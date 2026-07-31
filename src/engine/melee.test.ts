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

describe('큰 적에 대한 사거리', () => {
  const swing = { origin: { x: 0, y: 0 }, angle: 0, range: 120, arc: 1.7 };

  it('반지름을 더해 표면까지 재므로 큰 적이 더 멀리서 맞는다', () => {
    // 중심 거리 170. 사거리 120만 보면 빗나가지만,
    // 보스는 반지름 68이라 표면이 사거리 안에 들어온다.
    const boss = { id: 1, x: 170, y: 0, radius: 68 };
    expect(targetsInArc(swing, [boss]).map((t) => t.id)).toEqual([1]);
  });

  it('반지름이 없으면 중심 거리로만 판정한다', () => {
    expect(targetsInArc(swing, [{ id: 1, x: 170, y: 0 }])).toHaveLength(0);
    expect(targetsInArc(swing, [{ id: 1, x: 119, y: 0 }])).toHaveLength(1);
  });

  it('표면까지 닿아도 부채꼴 밖이면 맞지 않는다', () => {
    const behind = { id: 1, x: -170, y: 0, radius: 68 };
    expect(targetsInArc(swing, [behind])).toHaveLength(0);
  });

  it('모든 적에게 몸 표면까지의 여유가 같아진다', () => {
    // 접촉 피해는 (플레이어 반지름 20 + 적 반지름)에서 시작한다.
    // 사거리도 반지름을 반영하므로 여유가 적 크기와 무관하게 일정해야 한다.
    const PLAYER = 20;
    for (const radius of [20, 28, 68]) {
      const reach = swing.range + radius;
      const contact = PLAYER + radius;
      expect(reach - contact).toBe(swing.range - PLAYER);
    }
  });
});
