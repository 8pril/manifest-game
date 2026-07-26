import { describe, it, expect, beforeEach } from 'vitest';
import {
  spawnProjectiles,
  onHitTarget,
  onHitTerrain,
  advance,
  resetProjectileIds,
  type Target,
} from '@/engine/projectile';
import type { Behavior } from '@/engine/support';

beforeEach(() => resetProjectileIds());

const origin = { x: 0, y: 0 };
const stats = { damage: 100, projectileCount: 1, projectileSpeed: 400 };

const target = (id: number, x: number, y: number): Target => ({ id, x, y });

describe('spawnProjectiles', () => {
  it('projectileCount만큼 만든다', () => {
    const ps = spawnProjectiles({ ...stats, projectileCount: 3 }, [], origin, 0);
    expect(ps).toHaveLength(3);
  });

  it('홀수 개면 가운데 투사체가 정면을 향한다', () => {
    const ps = spawnProjectiles({ ...stats, projectileCount: 3 }, [], origin, 0, 0.2);
    expect(ps[1].angle).toBeCloseTo(0, 10);
    expect(ps[0].angle).toBeCloseTo(-0.2, 10);
    expect(ps[2].angle).toBeCloseTo(0.2, 10);
  });

  it('짝수 개면 정면을 기준으로 좌우 대칭이다', () => {
    const ps = spawnProjectiles({ ...stats, projectileCount: 2 }, [], origin, 0, 0.2);
    expect(ps[0].angle).toBeCloseTo(-0.1, 10);
    expect(ps[1].angle).toBeCloseTo(0.1, 10);
  });

  it('거동을 투사체 상태로 옮긴다', () => {
    const behaviors: Behavior[] = [
      { kind: 'pierce', count: 2 },
      { kind: 'chain', count: 3, sameTargetLimit: 2, damageFalloff: 0.2 },
    ];
    const [p] = spawnProjectiles(stats, behaviors, origin, 0);
    expect(p.pierceRemaining).toBe(2);
    expect(p.chainRemaining).toBe(3);
    expect(p.sameTargetLimit).toBe(2);
  });
});

describe('advance', () => {
  it('속도와 방향에 따라 이동한다', () => {
    const [p] = spawnProjectiles(stats, [], origin, 0);
    advance(p, 0.5);
    expect(p.x).toBeCloseTo(200, 10);
    expect(p.y).toBeCloseTo(0, 10);
  });
});

describe('onHitTarget - 거동 우선순위', () => {
  it('거동이 없으면 명중 후 사라진다', () => {
    const [p] = spawnProjectiles(stats, [], origin, 0);
    const result = onHitTarget(p, target(1, 10, 0));
    expect(result.consumed).toBe(true);
    expect(result.damage).toBe(100);
    expect(result.resolvedBy).toBe('none');
  });

  it('관통이 남아 있으면 관통을 먼저 소비한다', () => {
    const behaviors: Behavior[] = [
      { kind: 'pierce', count: 1 },
      { kind: 'chain', count: 3, sameTargetLimit: 2, damageFalloff: 0.2 },
    ];
    const [p] = spawnProjectiles(stats, behaviors, origin, 0);

    const first = onHitTarget(p, target(1, 10, 0), [target(2, 50, 0)]);
    expect(first.resolvedBy).toBe('pierce');
    expect(p.pierceRemaining).toBe(0);
    expect(p.chainRemaining).toBe(3);

    // 관통이 떨어지면 그다음이 연쇄
    const second = onHitTarget(p, target(1, 10, 0), [target(2, 50, 0)]);
    expect(second.resolvedBy).toBe('chain');
  });

  it("관통 count가 'all'이면 소비되지 않는다", () => {
    const [p] = spawnProjectiles(stats, [{ kind: 'pierce', count: 'all' }], origin, 0);
    for (let i = 0; i < 5; i++) {
      const result = onHitTarget(p, target(i, i * 10, 0));
      expect(result.consumed).toBe(false);
    }
    expect(p.pierceRemaining).toBe('all');
  });

  it('연쇄는 가장 가까운 다른 대상으로 방향을 바꾼다', () => {
    const behaviors: Behavior[] = [
      { kind: 'chain', count: 2, sameTargetLimit: 2, damageFalloff: 0.2 },
    ];
    const [p] = spawnProjectiles(stats, behaviors, origin, 0);
    const hit = target(1, 100, 0);
    const near = target(2, 100, 50);
    const far = target(3, 500, 0);

    const result = onHitTarget(p, hit, [hit, near, far]);
    expect(result.resolvedBy).toBe('chain');
    expect(p.x).toBe(100);
    expect(p.y).toBe(0);
    // 가까운 쪽(아래)을 향한다
    expect(p.angle).toBeCloseTo(Math.PI / 2, 10);
  });

  it('연쇄마다 피해가 감소한다', () => {
    const behaviors: Behavior[] = [
      { kind: 'chain', count: 2, sameTargetLimit: 2, damageFalloff: 0.2 },
    ];
    const [p] = spawnProjectiles(stats, behaviors, origin, 0);
    const a = target(1, 10, 0);
    const b = target(2, 20, 0);

    const first = onHitTarget(p, a, [a, b]);
    expect(first.damage).toBe(100);
    // 다음 명중은 100 / 1.2
    const second = onHitTarget(p, b, [a, b]);
    expect(second.damage).toBeCloseTo(100 / 1.2, 10);
  });

  it('sameTargetLimit을 넘긴 대상으로는 연쇄하지 않는다', () => {
    const behaviors: Behavior[] = [
      { kind: 'chain', count: 5, sameTargetLimit: 1, damageFalloff: 0 },
    ];
    const [p] = spawnProjectiles(stats, behaviors, origin, 0);
    const a = target(1, 10, 0);
    const b = target(2, 20, 0);

    onHitTarget(p, a, [a, b]); // a -> b
    onHitTarget(p, b, [a, b]); // b -> a는 a가 이미 1회 명중이라 불가

    const third = onHitTarget(p, a, [a, b]);
    expect(third.consumed).toBe(true);
    expect(third.resolvedBy).toBe('none');
  });

  it('연쇄할 대상이 없으면 다음 우선순위인 갈래로 넘어간다', () => {
    const behaviors: Behavior[] = [
      { kind: 'chain', count: 2, sameTargetLimit: 1, damageFalloff: 0 },
      { kind: 'fork', count: 3 },
    ];
    const [p] = spawnProjectiles(stats, behaviors, origin, 0);
    const only = target(1, 10, 0);

    const result = onHitTarget(p, only, [only]);
    expect(result.resolvedBy).toBe('fork');
    expect(result.spawned).toHaveLength(3);
  });

  it('갈래는 원본을 소비하고 새 투사체를 명중 지점에서 만든다', () => {
    const [p] = spawnProjectiles(stats, [{ kind: 'fork', count: 3 }], origin, 0);
    const hit = target(1, 100, 0);

    const result = onHitTarget(p, hit, [hit]);
    expect(result.consumed).toBe(true);
    expect(result.spawned).toHaveLength(3);
    for (const child of result.spawned) {
      expect(child.x).toBe(100);
      expect(child.y).toBe(0);
    }
  });

  it('갈래로 생긴 투사체는 다시 갈라지지 않는다', () => {
    const [p] = spawnProjectiles(stats, [{ kind: 'fork', count: 2 }], origin, 0);
    const hit = target(1, 100, 0);
    const [child] = onHitTarget(p, hit, [hit]).spawned;

    expect(child.forkRemaining).toBe(0);
    const childResult = onHitTarget(child, target(2, 200, 0));
    expect(childResult.spawned).toHaveLength(0);
  });
});

describe('onHitTerrain - 튕겨쏘기', () => {
  it('튕겨쏘기가 없으면 지형에서 사라진다', () => {
    const [p] = spawnProjectiles(stats, [], origin, 0);
    expect(onHitTerrain(p, 'vertical').consumed).toBe(true);
  });

  it('수직면에서는 좌우가 반사된다', () => {
    const [p] = spawnProjectiles(stats, [{ kind: 'ricochet', count: 1 }], origin, 0);
    p.angle = 0.5;
    const result = onHitTerrain(p, 'vertical');
    expect(result.consumed).toBe(false);
    expect(p.angle).toBeCloseTo(Math.PI - 0.5, 10);
    expect(p.ricochetRemaining).toBe(0);
  });

  it('수평면에서는 상하가 반사된다', () => {
    const [p] = spawnProjectiles(stats, [{ kind: 'ricochet', count: 1 }], origin, 0);
    p.angle = 0.5;
    onHitTerrain(p, 'horizontal');
    expect(p.angle).toBeCloseTo(-0.5, 10);
  });
});
