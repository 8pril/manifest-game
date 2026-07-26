import { createStatusHost, type StatusHost } from '@/engine/status';

/**
 * 적 정의.
 *
 * 전투 수치는 전부 여기 모아, 밸런스 조정이 코드 수정이 아니라
 * 이 표의 숫자를 고치는 일이 되게 한다.
 *
 * 행동은 두 가지다.
 *  - chase : 플레이어를 향해 곧장 온다
 *  - ranged: 선호 거리를 유지하며 투사체를 쏜다
 *
 * 원거리형이 필요한 이유는 플레이어 이동 속도가 근접 적보다 3배 이상
 * 빨라서, 추적형만 있으면 계속 도망치는 것만으로 한 대도 맞지 않기
 * 때문이다. 거리를 벌리는 행동에 대가를 만든다.
 */

export type EnemyKind = 'chaser' | 'brute' | 'archer' | 'boss';
export type EnemyBehavior = 'chase' | 'ranged';

export interface EnemyStats {
  label: string;
  hp: number;
  /** 초당 이동 픽셀. */
  speed: number;
  radius: number;
  /** 플레이어와 접촉 시 피해. */
  contactDamage: number;
  /** 같은 적이 다시 피해를 주기까지의 간격(초). */
  contactCooldown: number;
  color: number;
  behavior: EnemyBehavior;
  /** ranged 전용: 유지하려는 거리. */
  preferredRange?: number;
  /** ranged 전용: 사격 간격(초). */
  attackCooldown?: number;
  /** ranged 전용: 투사체 피해와 속도. */
  projectileDamage?: number;
  projectileSpeed?: number;
}

export const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  chaser: {
    label: '추적자',
    hp: 120,
    speed: 92,
    radius: 16,
    contactDamage: 8,
    contactCooldown: 0.8,
    color: 0xd4574e,
    behavior: 'chase',
  },
  brute: {
    label: '중장갑',
    hp: 320,
    speed: 58,
    radius: 24,
    contactDamage: 16,
    contactCooldown: 1.0,
    color: 0xb0453d,
    behavior: 'chase',
  },

  archer: {
    label: '사수',
    hp: 90,
    speed: 118,
    radius: 15,
    contactDamage: 5,
    contactCooldown: 1.0,
    color: 0xe0b055,
    behavior: 'ranged',
    preferredRange: 330,
    attackCooldown: 1.7,
    projectileDamage: 11,
    projectileSpeed: 290,
  },
  boss: {
    label: '보스',
    hp: 1600,
    speed: 74,
    radius: 40,
    contactDamage: 22,
    contactCooldown: 0.9,
    color: 0xff6b3d,
    behavior: 'chase',
  },
};

export interface Enemy extends StatusHost {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 마지막으로 플레이어에게 피해를 준 이후 지난 시간(초). */
  sinceContact: number;
  /** 마지막 사격 이후 지난 시간(초). ranged 전용. */
  sinceAttack: number;
  /** 지대의 이동 방해가 걸린 동안 감속된다. */
  hindered: boolean;
}

let nextId = 1;
export function resetEnemyIds(): void {
  nextId = 1;
}

export function createEnemy(kind: EnemyKind, x: number, y: number): Enemy {
  const stats = ENEMY_STATS[kind];
  return {
    ...createStatusHost(),
    id: nextId++,
    kind,
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    sinceContact: stats.contactCooldown,
    sinceAttack: 0,
    hindered: false,
  };
}

/** 이동 방해가 걸렸을 때의 감속 비율. */
export const HINDER_SPEED_FACTOR = 0.45;

export function enemySpeed(enemy: Enemy): number {
  const base = ENEMY_STATS[enemy.kind].speed;
  return enemy.hindered ? base * HINDER_SPEED_FACTOR : base;
}

export function isAlive(enemy: Enemy): boolean {
  return enemy.hp > 0;
}

/** 선호 거리를 유지할 때 허용하는 여유 비율. */
const RANGE_TOLERANCE = 0.2;

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * 이번 프레임에 적이 움직일 방향(단위 벡터).
 * 제자리에 있어야 하면 null을 준다.
 *
 * chase  : 플레이어를 향한다.
 * ranged : 너무 가까우면 물러나고, 너무 멀면 다가가며,
 *          적정 거리에서는 옆으로 돈다. 멈춰서 쏘면 맞히기 쉬워지므로
 *          항상 움직이게 한다.
 */
export function desiredDirection(enemy: Enemy, target: Vec2): Vec2 | null {
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return null;

  const toward = { x: dx / distance, y: dy / distance };
  const stats = ENEMY_STATS[enemy.kind];

  if (stats.behavior === 'chase') return toward;

  const preferred = stats.preferredRange ?? 300;
  if (distance < preferred * (1 - RANGE_TOLERANCE)) {
    return { x: -toward.x, y: -toward.y };
  }
  if (distance > preferred * (1 + RANGE_TOLERANCE)) {
    return toward;
  }
  // 적정 거리: 옆으로 돈다.
  return { x: -toward.y, y: toward.x };
}

/** 지금 사격할 수 있는지. 원거리형이 아니면 항상 false. */
export function readyToFire(enemy: Enemy): boolean {
  const stats = ENEMY_STATS[enemy.kind];
  if (stats.behavior !== 'ranged') return false;
  return enemy.sinceAttack >= (stats.attackCooldown ?? 2);
}

export function markFired(enemy: Enemy): void {
  enemy.sinceAttack = 0;
}
