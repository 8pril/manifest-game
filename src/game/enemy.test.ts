import { describe, it, expect } from 'vitest';
import {
  createEnemy,
  advanceBossPattern,
  bossContactDamage,
  bossMoveDirection,
  bossMoveSpeed,
  desiredDirection,
  readyToFire,
  markFired,
  enemySpeed,
  resetEnemyIds,
  ENEMY_STATS,
  HINDER_SPEED_FACTOR,
  BOSS_CHARGE_COOLDOWN,
  BOSS_CHARGE_TELEGRAPH,
  BOSS_CHARGE_DURATION,
  BOSS_CHARGE_SPEED,
  BOSS_WALL_STAGGER,
  BOSS_SUMMON_COUNT,
  BOSS_SHARD_COUNT,
  BOSS_SHARD_DAMAGE,
  BOSS_SHARD_SPEED,
  BOSS_SHOCK_COOLDOWN,
  BOSS_SHOCK_DAMAGE,
  BOSS_SHOCK_RADIUS,
  BOSS_SHOCK_TELEGRAPH,
  staggerBossOnWall,
} from '@/game/enemy';
import { beforeEach } from 'vitest';

beforeEach(() => resetEnemyIds());

const player = { x: 0, y: 0 };

describe('desiredDirection - 추적형', () => {
  it('플레이어를 향해 곧장 온다', () => {
    const enemy = createEnemy('chaser', 100, 0);
    expect(desiredDirection(enemy, player)).toEqual({ x: -1, y: 0 });
  });

  it('같은 자리에 겹치면 움직이지 않는다', () => {
    const enemy = createEnemy('chaser', 0, 0);
    expect(desiredDirection(enemy, player)).toBeNull();
  });
});

describe('desiredDirection - 원거리형', () => {
  const preferred = ENEMY_STATS.archer.preferredRange!;

  it('너무 가까우면 물러난다', () => {
    const enemy = createEnemy('archer', 50, 0);
    const direction = desiredDirection(enemy, player)!;
    // 플레이어 반대 방향(+x)으로 간다
    expect(direction.x).toBeGreaterThan(0);
  });

  it('너무 멀면 다가온다', () => {
    const enemy = createEnemy('archer', preferred * 2, 0);
    const direction = desiredDirection(enemy, player)!;
    expect(direction.x).toBeLessThan(0);
  });

  it('적정 거리에서는 옆으로 돈다', () => {
    // 멈춰서 쏘면 맞히기 쉬워지므로 항상 움직여야 한다.
    const enemy = createEnemy('archer', preferred, 0);
    const direction = desiredDirection(enemy, player)!;
    expect(Math.abs(direction.x)).toBeLessThan(0.01);
    expect(Math.abs(direction.y)).toBeCloseTo(1, 5);
  });

  it('돌려주는 방향은 단위 벡터다', () => {
    for (const distance of [30, 200, 330, 900]) {
      const enemy = createEnemy('archer', distance, 0);
      const d = desiredDirection(enemy, player)!;
      expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 10);
    }
  });
});

describe('readyToFire', () => {
  it('추적형은 사격하지 않는다', () => {
    const enemy = createEnemy('chaser', 100, 0);
    enemy.sinceAttack = 999;
    expect(readyToFire(enemy)).toBe(false);
  });

  it('쿨다운이 차면 사격할 수 있다', () => {
    const enemy = createEnemy('archer', 300, 0);
    expect(readyToFire(enemy)).toBe(false);

    enemy.sinceAttack = ENEMY_STATS.archer.attackCooldown!;
    expect(readyToFire(enemy)).toBe(true);
  });

  it('사격하면 쿨다운이 초기화된다', () => {
    const enemy = createEnemy('archer', 300, 0);
    enemy.sinceAttack = 99;
    markFired(enemy);
    expect(readyToFire(enemy)).toBe(false);
  });
});

describe('enemySpeed', () => {
  it('이동 방해가 걸리면 느려진다', () => {
    const enemy = createEnemy('chaser', 0, 0);
    const base = enemySpeed(enemy);
    enemy.hindered = true;
    expect(enemySpeed(enemy)).toBeCloseTo(base * HINDER_SPEED_FACTOR, 10);
  });
});

describe('적 구성', () => {
  it('원거리형은 사격에 필요한 값을 모두 갖는다', () => {
    for (const stats of Object.values(ENEMY_STATS)) {
      if (stats.behavior !== 'ranged') continue;
      expect(stats.preferredRange).toBeGreaterThan(0);
      expect(stats.attackCooldown).toBeGreaterThan(0);
      expect(stats.projectileDamage).toBeGreaterThan(0);
      expect(stats.projectileSpeed).toBeGreaterThan(0);
    }
  });

  it('원거리형이 최소 한 종류 있다', () => {
    // 추적형만 있으면 플레이어가 계속 도망치는 것만으로 무적이 된다.
    const ranged = Object.values(ENEMY_STATS).filter((s) => s.behavior === 'ranged');
    expect(ranged.length).toBeGreaterThan(0);
  });
});

describe('boss patterns', () => {
  it('보스는 돌진 예고 뒤 돌진하고 다시 대기한다', () => {
    const boss = createEnemy('gatekeeper', 100, 0);

    const telegraph = advanceBossPattern(boss, player, BOSS_CHARGE_COOLDOWN);
    expect(telegraph).toEqual([{ kind: 'chargeTelegraph', direction: { x: -1, y: 0 } }]);
    expect(boss.boss?.phase).toBe('telegraph');
    expect(bossMoveDirection(boss, player)).toBeNull();

    const charge = advanceBossPattern(boss, player, BOSS_CHARGE_TELEGRAPH);
    expect(charge).toEqual([{ kind: 'chargeStart', direction: { x: -1, y: 0 } }]);
    expect(boss.boss?.phase).toBe('charging');
    expect(bossMoveDirection(boss, player)).toEqual({ x: -1, y: 0 });
    expect(bossMoveSpeed(boss)).toBe(BOSS_CHARGE_SPEED);
    expect(bossContactDamage(boss)).toBeGreaterThan(ENEMY_STATS.gatekeeper.contactDamage);

    advanceBossPattern(boss, player, BOSS_CHARGE_DURATION);
    expect(boss.boss?.phase).toBe('idle');
  });

  it('돌진 중 벽에 부딪히면 잠시 멈춘다', () => {
    const boss = createEnemy('gatekeeper', 100, 0);

    advanceBossPattern(boss, player, BOSS_CHARGE_COOLDOWN);
    advanceBossPattern(boss, player, BOSS_CHARGE_TELEGRAPH);

    expect(staggerBossOnWall(boss)).toBe(true);
    expect(boss.boss?.phase).toBe('staggered');
    expect(bossMoveDirection(boss, player)).toBeNull();
    expect(boss.boss?.staggerRemaining).toBe(BOSS_WALL_STAGGER);

    advanceBossPattern(boss, player, BOSS_WALL_STAGGER);
    expect(boss.boss?.phase).toBe('idle');
  });

  it('돌진 중이 아니면 벽 충돌 멈춤을 걸지 않는다', () => {
    const boss = createEnemy('gatekeeper', 100, 0);

    expect(staggerBossOnWall(boss)).toBe(false);
    expect(boss.boss?.phase).toBe('idle');
  });

  it('체력 구간마다 사냥개 소환 이벤트를 한 번만 낸다', () => {
    const boss = createEnemy('gatekeeper', 0, 0);
    boss.hp = boss.maxHp * 0.69;

    expect(advanceBossPattern(boss, player, 0)).toEqual([{ kind: 'summon', count: BOSS_SUMMON_COUNT, threshold: 0.7 }]);
    expect(advanceBossPattern(boss, player, 0)).toEqual([]);

    boss.hp = boss.maxHp * 0.34;
    expect(advanceBossPattern(boss, player, 0)).toEqual([{ kind: 'summon', count: BOSS_SUMMON_COUNT, threshold: 0.35 }]);
  });

  it('무너진 문은 충격파를 예고한 뒤 발동한다', () => {
    const boss = createEnemy('collapsedDoor', 100, 0);

    expect(advanceBossPattern(boss, player, BOSS_SHOCK_COOLDOWN)).toEqual([{ kind: 'shockTelegraph', radius: BOSS_SHOCK_RADIUS }]);
    expect(boss.boss?.phase).toBe('shockTelegraph');
    expect(bossMoveDirection(boss, player)).toBeNull();

    expect(advanceBossPattern(boss, player, BOSS_SHOCK_TELEGRAPH)).toEqual([
      { kind: 'shockwave', radius: BOSS_SHOCK_RADIUS, damage: BOSS_SHOCK_DAMAGE },
    ]);
    expect(boss.boss?.phase).toBe('idle');
  });

  it('무너진 문은 체력 구간마다 파편 탄막을 한 번만 낸다', () => {
    const boss = createEnemy('collapsedDoor', 0, 0);
    boss.hp = boss.maxHp * 0.74;

    expect(advanceBossPattern(boss, player, 0)).toEqual([
      { kind: 'shardBurst', count: BOSS_SHARD_COUNT, damage: BOSS_SHARD_DAMAGE, speed: BOSS_SHARD_SPEED, threshold: 0.75 },
    ]);
    expect(advanceBossPattern(boss, player, 0)).toEqual([]);

    boss.hp = boss.maxHp * 0.44;
    expect(advanceBossPattern(boss, player, 0)).toEqual([
      { kind: 'shardBurst', count: BOSS_SHARD_COUNT, damage: BOSS_SHARD_DAMAGE, speed: BOSS_SHARD_SPEED, threshold: 0.45 },
    ]);
  });

  it('일반 적은 보스 패턴 이벤트를 내지 않는다', () => {
    const chaser = createEnemy('chaser', 0, 0);
    expect(advanceBossPattern(chaser, player, 99)).toEqual([]);
  });
});
