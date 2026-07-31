import type { Behavior } from '@/engine/support';
import { findBehavior } from '@/engine/support';
import type { StatBlock } from '@/engine/modifiers';

/**
 * 투사체 조합 엔진.
 *
 * 렌더링과 분리된 순수 로직이다. Phaser는 이 상태를 그리기만 하고,
 * 무엇이 관통하고 어디로 연쇄되는지는 전부 여기서 결정한다.
 * 이렇게 나눠야 조합 규칙을 테스트로 고정할 수 있다.
 *
 * 거동 우선순위는 원안의 `관통 > 연쇄 > 갈래 > 튕겨쏘기`를 따른다.
 * 한 번의 명중에서 이 중 가장 앞선 것 하나만 소비된다.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Target extends Vec2 {
  id: number;
  /** 몸 반지름. 근접 판정이 표면 기준으로 닿는지 보는 데 쓴다. */
  radius?: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  /** 진행 방향(라디안). */
  angle: number;
  speed: number;
  damage: number;
  pierceRemaining: number | 'all';
  chainRemaining: number;
  forkRemaining: number;
  ricochetRemaining: number;
  /** 연쇄 시 같은 대상을 몇 번까지 다시 칠 수 있는지. */
  sameTargetLimit: number;
  chainDamageFalloff: number;
  /** 대상별 명중 횟수. 연쇄가 같은 적을 무한히 왕복하는 것을 막는다. */
  hitCounts: Map<number, number>;
}

let nextId = 1;
export function resetProjectileIds(): void {
  nextId = 1;
}

/**
 * 해석된 스킬 스탯과 거동으로 발사 시점의 투사체들을 만든다.
 * projectileCount만큼 부채꼴로 퍼뜨린다.
 */
export function spawnProjectiles(
  stats: StatBlock,
  behaviors: readonly Behavior[],
  origin: Vec2,
  angle: number,
  spreadRadians = 0.18,
): Projectile[] {
  const count = Math.max(1, Math.round(stats.projectileCount ?? 1));
  const pierce = findBehavior(behaviors, 'pierce');
  const chain = findBehavior(behaviors, 'chain');
  const fork = findBehavior(behaviors, 'fork');
  const ricochet = findBehavior(behaviors, 'ricochet');

  const projectiles: Projectile[] = [];
  // 홀수면 가운데가 정면, 짝수면 좌우 대칭이 되도록 오프셋을 잡는다.
  const start = -((count - 1) / 2) * spreadRadians;

  for (let i = 0; i < count; i++) {
    projectiles.push({
      id: nextId++,
      x: origin.x,
      y: origin.y,
      angle: angle + start + i * spreadRadians,
      speed: stats.projectileSpeed ?? 400,
      damage: stats.damage ?? 0,
      pierceRemaining: pierce ? pierce.count : 0,
      chainRemaining: chain?.count ?? 0,
      forkRemaining: fork?.count ?? 0,
      ricochetRemaining: ricochet?.count ?? 0,
      sameTargetLimit: chain?.sameTargetLimit ?? 1,
      chainDamageFalloff: chain?.damageFalloff ?? 0,
      hitCounts: new Map(),
    });
  }
  return projectiles;
}

export function advance(projectile: Projectile, deltaSeconds: number): void {
  projectile.x += Math.cos(projectile.angle) * projectile.speed * deltaSeconds;
  projectile.y += Math.sin(projectile.angle) * projectile.speed * deltaSeconds;
}

/** 투사체가 사라지는 여유 거리. 벽에 닿자마자 끊기면 눈에 거슬린다. */
export const DESPAWN_MARGIN = 40;

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 투사체가 활동 영역을 벗어났는지.
 *
 * 판정 기준은 **화면이 아니라 방**이다.
 * 방이 화면(1280×720)보다 커진 뒤 화면 크기로 판정하면,
 * 방 오른쪽이나 아래쪽에서 쏜 투사체가 생기자마자 지워져
 * 활과 비전이 아무 반응 없이 안 나가는 것처럼 보인다.
 */
export function isOutOfBounds(point: Vec2, bounds: Bounds): boolean {
  return (
    point.x < bounds.minX - DESPAWN_MARGIN ||
    point.x > bounds.maxX + DESPAWN_MARGIN ||
    point.y < bounds.minY - DESPAWN_MARGIN ||
    point.y > bounds.maxY + DESPAWN_MARGIN
  );
}

export interface HitOutcome {
  /** 이 명중으로 대상이 받는 피해. */
  damage: number;
  /** 투사체가 사라지는지. */
  consumed: boolean;
  /** 갈래로 새로 생긴 투사체들. */
  spawned: Projectile[];
  /** 어떤 거동이 소비됐는지. 디버깅과 테스트용. */
  resolvedBy: 'pierce' | 'chain' | 'fork' | 'none';
}

/**
 * 적에게 명중했을 때의 처리.
 *
 * @param candidates 연쇄 대상 후보. 보통 화면 안의 살아있는 적 전체를 넘긴다.
 */
export function onHitTarget(
  projectile: Projectile,
  target: Target,
  candidates: readonly Target[] = [],
): HitOutcome {
  const damage = projectile.damage;
  const hits = (projectile.hitCounts.get(target.id) ?? 0) + 1;
  projectile.hitCounts.set(target.id, hits);

  // 1순위: 관통
  if (projectile.pierceRemaining === 'all') {
    return { damage, consumed: false, spawned: [], resolvedBy: 'pierce' };
  }
  if (projectile.pierceRemaining > 0) {
    projectile.pierceRemaining -= 1;
    return { damage, consumed: false, spawned: [], resolvedBy: 'pierce' };
  }

  // 2순위: 연쇄
  if (projectile.chainRemaining > 0) {
    const next = findChainTarget(projectile, target, candidates);
    if (next) {
      projectile.chainRemaining -= 1;
      projectile.damage = projectile.damage / (1 + projectile.chainDamageFalloff);
      projectile.x = target.x;
      projectile.y = target.y;
      projectile.angle = Math.atan2(next.y - target.y, next.x - target.x);
      return { damage, consumed: false, spawned: [], resolvedBy: 'chain' };
    }
  }

  // 3순위: 갈래
  if (projectile.forkRemaining > 0) {
    const spawned = forkFrom(projectile, target);
    return { damage, consumed: true, spawned, resolvedBy: 'fork' };
  }

  return { damage, consumed: true, spawned: [], resolvedBy: 'none' };
}

/** 지형에 부딪혔을 때. 튕겨쏘기가 남아 있으면 반사한다. */
export function onHitTerrain(
  projectile: Projectile,
  surfaceNormal: 'horizontal' | 'vertical',
): { consumed: boolean } {
  if (projectile.ricochetRemaining <= 0) {
    return { consumed: true };
  }
  projectile.ricochetRemaining -= 1;
  projectile.angle =
    surfaceNormal === 'vertical' ? Math.PI - projectile.angle : -projectile.angle;
  return { consumed: false };
}

/**
 * 연쇄할 다음 대상을 고른다.
 * 같은 대상을 sameTargetLimit 초과로 치지 않으며, 가장 가까운 적을 고른다.
 */
function findChainTarget(
  projectile: Projectile,
  from: Target,
  candidates: readonly Target[],
): Target | undefined {
  let best: Target | undefined;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    if (candidate.id === from.id) continue;
    if ((projectile.hitCounts.get(candidate.id) ?? 0) >= projectile.sameTargetLimit) continue;

    const distance = Math.hypot(candidate.x - from.x, candidate.y - from.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** 명중 지점에서 갈래 투사체를 만든다. 원래 투사체의 남은 거동을 물려받는다. */
function forkFrom(projectile: Projectile, at: Vec2): Projectile[] {
  const count = projectile.forkRemaining;
  const spread = 0.5;
  const start = -((count - 1) / 2) * spread;

  return Array.from({ length: count }, (_, i) => ({
    ...projectile,
    id: nextId++,
    x: at.x,
    y: at.y,
    angle: projectile.angle + start + i * spread,
    // 갈래는 한 번만 갈라진다. 무한 증식을 막는다.
    forkRemaining: 0,
    hitCounts: new Map(projectile.hitCounts),
  }));
}
