import { describe, it, expect } from 'vitest';
import { targetsInArc, angleDifference, type MeleeSwing } from '@/engine/melee';
import type { Target } from '@/engine/projectile';

const swing: MeleeSwing = {
  origin: { x: 0, y: 0 },
  angle: 0, // 오른쪽
  range: 100,
  arc: Math.PI / 2, // 90도
};

const target = (id: number, x: number, y: number): Target => ({ id, x, y });

describe('targetsInArc', () => {
  it('정면 사거리 안의 대상을 맞힌다', () => {
    expect(targetsInArc(swing, [target(1, 50, 0)])).toHaveLength(1);
  });

  it('사거리 밖은 맞지 않는다', () => {
    expect(targetsInArc(swing, [target(1, 150, 0)])).toHaveLength(0);
  });

  it('사거리 경계는 포함한다', () => {
    expect(targetsInArc(swing, [target(1, 100, 0)])).toHaveLength(1);
  });

  it('부채꼴 밖의 대상은 맞지 않는다', () => {
    // 뒤쪽
    expect(targetsInArc(swing, [target(1, -50, 0)])).toHaveLength(0);
    // 바로 위(90도)는 45도 경계를 벗어난다
    expect(targetsInArc(swing, [target(1, 0, 50)])).toHaveLength(0);
  });

  it('부채꼴 경계 안쪽은 맞는다', () => {
    // 45도 방향, 거리 약 70
    expect(targetsInArc(swing, [target(1, 50, 49)])).toHaveLength(1);
  });

  it('여러 대상을 동시에 맞힌다', () => {
    const hits = targetsInArc(swing, [
      target(1, 40, 0),
      target(2, 60, 20),
      target(3, -60, 0), // 뒤
      target(4, 300, 0), // 멀리
    ]);
    expect(hits.map((t) => t.id)).toEqual([1, 2]);
  });

  it('방패처럼 넓은 부채꼴은 더 많이 맞힌다', () => {
    const wide: MeleeSwing = { ...swing, arc: 2.4 };
    const targets = [target(1, 50, 0), target(2, 20, 50), target(3, -10, 60)];
    expect(targetsInArc(wide, targets).length).toBeGreaterThan(
      targetsInArc(swing, targets).length,
    );
  });

  it('방향이 바뀌면 맞는 대상도 바뀐다', () => {
    const upward: MeleeSwing = { ...swing, angle: Math.PI / 2 };
    expect(targetsInArc(upward, [target(1, 0, 50)])).toHaveLength(1);
    expect(targetsInArc(upward, [target(1, 50, 0)])).toHaveLength(0);
  });
});

describe('angleDifference', () => {
  it('-π..π 범위로 정규화한다', () => {
    expect(angleDifference(0, 0)).toBe(0);
    expect(angleDifference(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2, 10);
    // 경계를 넘어가도 짧은 쪽으로 계산한다
    expect(angleDifference(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(0.2, 10);
  });
});
