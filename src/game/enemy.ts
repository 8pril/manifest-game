/**
 * 적 정의.
 *
 * M4에서는 추적형과 보스 2종만 둔다. 원거리·돌진형은 M5에서 추가한다.
 * 전투 수치는 전부 여기 모아, 밸런스 조정이 코드 수정이 아니라
 * 이 표의 숫자를 고치는 일이 되게 한다.
 */

export type EnemyKind = 'chaser' | 'brute' | 'boss';

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
  },
  brute: {
    label: '중장갑',
    hp: 320,
    speed: 58,
    radius: 24,
    contactDamage: 16,
    contactCooldown: 1.0,
    color: 0xb0453d,
  },
  boss: {
    label: '보스',
    hp: 1600,
    speed: 74,
    radius: 40,
    contactDamage: 22,
    contactCooldown: 0.9,
    color: 0xff6b3d,
  },
};

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 마지막으로 플레이어에게 피해를 준 이후 지난 시간(초). */
  sinceContact: number;
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
    id: nextId++,
    kind,
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    sinceContact: stats.contactCooldown,
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
