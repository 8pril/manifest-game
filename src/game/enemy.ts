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

export type EnemyKind = 'chaser' | 'brute' | 'archer' | 'gatekeeper' | 'collapsedDoor' | 'warden' | 'glutton';
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
  // 사냥개는 수가 많고 개별로는 약하다. 두 대면 죽는다.
  // 기획 방향이 "잡몹 수량이 엄청 많고 걔네는 그냥 다 쉽게 썰면서 나아간다"이므로
  // 방 전체 체력은 유지한 채 마리당 체력을 낮추고 수를 늘렸다.
  chaser: {
    label: '사냥개',
    hp: 52,
    speed: 96,
    radius: 20,
    // 마리당 죽는 속도가 빨라진 만큼 한 대의 무게를 올린다.
    contactDamage: 11,
    contactCooldown: 0.8,
    color: 0xd4574e,
    behavior: 'chase',
  },
  // 껍데기는 수가 아니라 단단함으로 존재감을 갖는다. 여기서 속도가 끊긴다.
  brute: {
    label: '껍데기',
    hp: 260,
    speed: 58,
    radius: 28,
    contactDamage: 16,
    contactCooldown: 1.0,
    color: 0xb0453d,
    behavior: 'chase',
  },

  archer: {
    label: '몰이꾼',
    hp: 60,
    speed: 118,
    radius: 21,
    contactDamage: 5,
    contactCooldown: 1.0,
    color: 0xe0b055,
    behavior: 'ranged',
    preferredRange: 330,
    attackCooldown: 1.7,
    projectileDamage: 11,
    projectileSpeed: 290,
  },
  // 문지기는 잡몹보다 확연히 커야 한다. 반지름이 사냥개의 3.4배다.
  gatekeeper: {
    label: '문지기',
    hp: 1600,
    speed: 74,
    radius: 68,
    contactDamage: 22,
    contactCooldown: 0.9,
    color: 0xff6b3d,
    behavior: 'chase',
  },
  /**
   * 윗길 제단의 보스. **기믹이 까다로운 쪽**이다.
   *
   * 문지기와 같은 돌진 패턴을 쓰되 예고가 짧고 다시 오는 주기가 빠르다. 체력은
   * 오히려 낮다 — 오래 버티는 싸움이 아니라 **읽고 피하는** 싸움이어야 한다.
   */
  warden: {
    label: '제단지기',
    hp: 1500,
    speed: 96,
    radius: 62,
    contactDamage: 26,
    contactCooldown: 0.8,
    color: 0x6be0a0,
    behavior: 'chase',
  },
  /**
   * 아랫길 굴의 보스. **기믹은 단순하고 체력이 많은 쪽**이다.
   *
   * 느리고 예고가 길어 피하기 쉽지만 좀처럼 죽지 않는다. 화력이 부족한 빌드는
   * 여기서 시간이 걸린다 — 소켓과 보조를 제대로 채웠는지 묻는 방이다.
   */
  glutton: {
    label: '굴의 포식자',
    hp: 4200,
    speed: 40,
    radius: 86,
    contactDamage: 16,
    contactCooldown: 1.1,
    color: 0xd9a441,
    behavior: 'chase',
  },
  collapsedDoor: {
    label: '무너진 문',
    hp: 2200,
    speed: 46,
    radius: 78,
    contactDamage: 18,
    contactCooldown: 1.0,
    color: 0x8f7cff,
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
  /** 보스 전용 패턴 상태. 일반 적은 없다. */
  boss?: BossState;
}

export type BossPhase = 'idle' | 'telegraph' | 'charging' | 'staggered' | 'shockTelegraph';

export interface BossState {
  phase: BossPhase;
  chargeCooldown: number;
  telegraphRemaining: number;
  chargeRemaining: number;
  staggerRemaining: number;
  shockRemaining: number;
  chargeDirection: Vec2;
  summonedAt: readonly number[];
}

export type BossEvent =
  | { kind: 'chargeTelegraph'; direction: Vec2 }
  | { kind: 'chargeStart'; direction: Vec2 }
  | { kind: 'summon'; count: number; threshold: number }
  | { kind: 'shockTelegraph'; radius: number }
  | { kind: 'shockwave'; radius: number; damage: number }
  | { kind: 'shardBurst'; count: number; damage: number; speed: number; threshold: number };

export const BOSS_CHARGE_COOLDOWN = 4.2;
export const BOSS_CHARGE_TELEGRAPH = 0.75;
export const BOSS_CHARGE_DURATION = 0.45;
export const BOSS_CHARGE_SPEED = 520;
export const BOSS_CHARGE_DAMAGE_MULTIPLIER = 1.6;
export const BOSS_WALL_STAGGER = 1.1;
export const BOSS_SUMMON_THRESHOLDS = [0.7, 0.35] as const;
export const BOSS_SUMMON_COUNT = 4;
export const BOSS_SHOCK_COOLDOWN = 3.4;
export const BOSS_SHOCK_TELEGRAPH = 0.85;
export const BOSS_SHOCK_RADIUS = 260;
export const BOSS_SHOCK_DAMAGE = 18;
export const BOSS_SHARD_THRESHOLDS = [0.75, 0.45] as const;
export const BOSS_SHARD_COUNT = 10;
export const BOSS_SHARD_DAMAGE = 12;
export const BOSS_SHARD_SPEED = 330;

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
    boss: isBossKind(kind) ? createBossState(kind) : undefined,
  };
}

const BOSS_KINDS: readonly EnemyKind[] = ['gatekeeper', 'collapsedDoor', 'warden', 'glutton'];

export function isBossKind(kind: EnemyKind): boolean {
  return BOSS_KINDS.includes(kind);
}

/** 충격파(원거리 예고) 패턴을 쓰는 보스. 나머지는 돌진 패턴이다. */
const SHOCK_BOSSES: readonly EnemyKind[] = ['collapsedDoor', 'glutton'];

function createBossState(kind: EnemyKind): BossState {
  return {
    phase: 'idle',
    // 제단지기는 같은 돌진 패턴을 **더 자주** 건다. 읽는 눈을 시험하는 쪽이다.
    chargeCooldown: SHOCK_BOSSES.includes(kind)
      ? BOSS_SHOCK_COOLDOWN
      : kind === 'warden'
        ? BOSS_CHARGE_COOLDOWN * 0.6
        : BOSS_CHARGE_COOLDOWN,
    telegraphRemaining: 0,
    chargeRemaining: 0,
    staggerRemaining: 0,
    shockRemaining: 0,
    chargeDirection: { x: 1, y: 0 },
    summonedAt: [],
  };
}

/** 이동 방해가 걸렸을 때의 감속 비율. */
export const HINDER_SPEED_FACTOR = 0.45;

export function enemySpeed(enemy: Enemy): number {
  const base = ENEMY_STATS[enemy.kind].speed;
  if (isBossKind(enemy.kind)) return base;
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

export function advanceBossPattern(enemy: Enemy, target: Vec2, deltaSeconds: number): BossEvent[] {
  if (!enemy.boss) return [];

  const events: BossEvent[] = [];
  const boss = enemy.boss;

  const hpRatio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
  const thresholds = enemy.kind === 'collapsedDoor' ? BOSS_SHARD_THRESHOLDS : BOSS_SUMMON_THRESHOLDS;
  for (const threshold of thresholds) {
    if (hpRatio <= threshold && !boss.summonedAt.includes(threshold)) {
      boss.summonedAt = [...boss.summonedAt, threshold];
      if (enemy.kind === 'collapsedDoor') {
        events.push({ kind: 'shardBurst', count: BOSS_SHARD_COUNT, damage: BOSS_SHARD_DAMAGE, speed: BOSS_SHARD_SPEED, threshold });
      } else {
        events.push({ kind: 'summon', count: BOSS_SUMMON_COUNT, threshold });
      }
    }
  }

  if (boss.phase === 'charging') {
    boss.chargeRemaining -= deltaSeconds;
    if (boss.chargeRemaining <= 0) {
      boss.phase = 'idle';
      boss.chargeCooldown = BOSS_CHARGE_COOLDOWN;
    }
    return events;
  }

  if (boss.phase === 'staggered') {
    boss.staggerRemaining -= deltaSeconds;
    if (boss.staggerRemaining <= 0) {
      boss.phase = 'idle';
      boss.chargeCooldown = BOSS_CHARGE_COOLDOWN;
    }
    return events;
  }

  if (boss.phase === 'shockTelegraph') {
    boss.shockRemaining -= deltaSeconds;
    if (boss.shockRemaining <= 0) {
      boss.phase = 'idle';
      boss.chargeCooldown = BOSS_SHOCK_COOLDOWN;
      events.push({ kind: 'shockwave', radius: BOSS_SHOCK_RADIUS, damage: BOSS_SHOCK_DAMAGE });
    }
    return events;
  }

  if (boss.phase === 'telegraph') {
    boss.telegraphRemaining -= deltaSeconds;
    if (boss.telegraphRemaining <= 0) {
      boss.phase = 'charging';
      boss.chargeRemaining = BOSS_CHARGE_DURATION;
      events.push({ kind: 'chargeStart', direction: boss.chargeDirection });
    }
    return events;
  }

  boss.chargeCooldown -= deltaSeconds;
  if (boss.chargeCooldown <= 0) {
    if (enemy.kind === 'collapsedDoor') {
      boss.phase = 'shockTelegraph';
      boss.shockRemaining = BOSS_SHOCK_TELEGRAPH;
      events.push({ kind: 'shockTelegraph', radius: BOSS_SHOCK_RADIUS });
      return events;
    }
    boss.phase = 'telegraph';
    boss.telegraphRemaining = BOSS_CHARGE_TELEGRAPH;
    boss.chargeDirection = directionTo(enemy, target);
    events.push({ kind: 'chargeTelegraph', direction: boss.chargeDirection });
  }

  return events;
}

export function bossMoveDirection(enemy: Enemy, target: Vec2): Vec2 | null {
  if (enemy.boss?.phase === 'telegraph') return null;
  if (enemy.boss?.phase === 'staggered') return null;
  if (enemy.boss?.phase === 'shockTelegraph') return null;
  if (enemy.boss?.phase === 'charging') return enemy.boss.chargeDirection;
  return desiredDirection(enemy, target);
}

export function bossMoveSpeed(enemy: Enemy): number {
  return enemy.boss?.phase === 'charging' ? BOSS_CHARGE_SPEED : enemySpeed(enemy);
}

export function bossContactDamage(enemy: Enemy): number {
  const base = ENEMY_STATS[enemy.kind].contactDamage;
  return enemy.boss?.phase === 'charging' ? base * BOSS_CHARGE_DAMAGE_MULTIPLIER : base;
}

export function staggerBossOnWall(enemy: Enemy): boolean {
  if (enemy.boss?.phase !== 'charging') return false;
  enemy.boss.phase = 'staggered';
  enemy.boss.chargeRemaining = 0;
  enemy.boss.staggerRemaining = BOSS_WALL_STAGGER;
  return true;
}

function directionTo(enemy: Enemy, target: Vec2): Vec2 {
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  return distance === 0 ? { x: 1, y: 0 } : { x: dx / distance, y: dy / distance };
}
