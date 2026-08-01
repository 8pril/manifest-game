import { describe, it, expect } from 'vitest';
import { applyKnockback, type Bounds } from '@/engine/knockback';

const bounds: Bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
const origin = { x: 500, y: 300 };

describe('applyKnockback', () => {
  it('원점에서 멀어지는 방향으로 민다', () => {
    const result = applyKnockback(origin, { x: 600, y: 300 }, 50, bounds);
    expect(result.x).toBe(650);
    expect(result.y).toBe(300);
    expect(result.hitWall).toBe(false);
  });

  it('대각선 방향에서도 거리를 정확히 지킨다', () => {
    const target = { x: 600, y: 400 };
    const result = applyKnockback(origin, target, 100, bounds);
    const moved = Math.hypot(result.x - target.x, result.y - target.y);
    expect(moved).toBeCloseTo(100, 10);
  });

  it('거리가 0이면 움직이지 않는다', () => {
    const result = applyKnockback(origin, { x: 600, y: 300 }, 0, bounds);
    expect(result).toEqual({ x: 600, y: 300, hitWall: false });
  });

  it('완전히 겹쳐 있으면 방향을 정할 수 없어 밀지 않는다', () => {
    const result = applyKnockback(origin, { ...origin }, 100, bounds);
    expect(result.x).toBe(origin.x);
    expect(result.y).toBe(origin.y);
    expect(result.hitWall).toBe(false);
  });
});

describe('벽 충돌', () => {
  it('경계를 넘어가면 경계에 붙고 벽 충돌로 표시한다', () => {
    // 오른쪽 벽까지 500밖에 안 남았는데 900을 민다
    const result = applyKnockback(origin, { x: 900, y: 300 }, 500, bounds);
    expect(result.x).toBe(1000);
    expect(result.hitWall).toBe(true);
  });

  it('세로 경계에서도 동작한다', () => {
    const result = applyKnockback(origin, { x: 500, y: 550 }, 200, bounds);
    expect(result.y).toBe(600);
    expect(result.hitWall).toBe(true);
  });

  it('경계에 정확히 닿기만 하면 벽 충돌이 아니다', () => {
    const result = applyKnockback(origin, { x: 950, y: 300 }, 50, bounds);
    expect(result.x).toBe(1000);
    expect(result.hitWall).toBe(false);
  });

  it('벽에서 멀면 충돌하지 않는다', () => {
    const result = applyKnockback(origin, { x: 600, y: 300 }, 100, bounds);
    expect(result.hitWall).toBe(false);
  });

  it('밀린 뒤에도 항상 경계 안에 있다', () => {
    for (const target of [
      { x: 10, y: 10 },
      { x: 990, y: 590 },
      { x: 500, y: 5 },
    ]) {
      const result = applyKnockback(origin, target, 400, bounds);
      expect(result.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(result.x).toBeLessThanOrEqual(bounds.maxX);
      expect(result.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(result.y).toBeLessThanOrEqual(bounds.maxY);
    }
  });
});

describe('무기별 넉백 차이', () => {
  it('넉백이 강할수록 더 멀리 밀린다', () => {
    const target = { x: 600, y: 300 };
    const weak = applyKnockback(origin, target, 20, bounds);
    const strong = applyKnockback(origin, target, 120, bounds);
    expect(strong.x - target.x).toBeGreaterThan(weak.x - target.x);
  });
});

describe('이미 벽에 붙어 있는 적', () => {
  const bounds = { minX: 24, minY: 24, maxX: 1876, maxY: 1126 };

  it('더 밀리지 않지만 벽 충돌로 친다', () => {
    // 균열 파동이 벽에 붙은 적에게 깔린 경우. 위치는 그대로인데
    // 벽 충돌이 나서 확정 기절과 추가 피해가 들어간다.
    const atWall = { x: bounds.maxX, y: 600 };
    const result = applyKnockback({ x: 1500, y: 600 }, atWall, 62, bounds);

    expect(result.x).toBe(bounds.maxX);
    expect(result.y).toBe(600);
    expect(result.hitWall).toBe(true);
  });

  it('벽에서 떨어져 있으면 밀리기만 하고 충돌은 아니다', () => {
    const away = { x: 1000, y: 600 };
    const result = applyKnockback({ x: 900, y: 600 }, away, 62, bounds);

    expect(result.x).toBeCloseTo(1062, 5);
    expect(result.hitWall).toBe(false);
  });

  it('벽까지 남은 거리보다 넉백이 크면 벽에 붙고 충돌한다', () => {
    // 벽에서 30px 떨어진 적을 62만큼 밀면 벽에 닿는다.
    const near = { x: bounds.maxX - 30, y: 600 };
    const result = applyKnockback({ x: 1000, y: 600 }, near, 62, bounds);

    expect(result.x).toBe(bounds.maxX);
    expect(result.hitWall).toBe(true);
  });
});
