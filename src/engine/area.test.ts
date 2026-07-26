import { describe, it, expect, beforeEach } from 'vitest';
import { createArea, tickArea, containsPoint, remainingRatio, resetAreaIds } from '@/engine/area';
import type { Behavior } from '@/engine/support';

beforeEach(() => resetAreaIds());

const stats = { damage: 20, areaRadius: 100, duration: 2, tickInterval: 0.5 };

describe('createArea', () => {
  it('스탯을 그대로 반영한다', () => {
    const area = createArea(stats, [], { x: 10, y: 20 });
    expect(area.radius).toBe(100);
    expect(area.remaining).toBe(2);
    expect(area.tickInterval).toBe(0.5);
    expect(area.kind).toBe('plain');
  });

  it('areaKind 거동으로 지대 성질이 바뀐다', () => {
    const behaviors: Behavior[] = [{ kind: 'areaKind', value: 'chill' }];
    expect(createArea(stats, behaviors, { x: 0, y: 0 }).kind).toBe('chill');
  });

  it('hinder 거동이 있으면 이동 방해가 켜진다', () => {
    const behaviors: Behavior[] = [{ kind: 'hinder' }];
    expect(createArea(stats, behaviors, { x: 0, y: 0 }).hinders).toBe(true);
    expect(createArea(stats, [], { x: 0, y: 0 }).hinders).toBe(false);
  });
});

describe('tickArea', () => {
  it('틱 간격에 도달하면 지속피해가 발생한다', () => {
    const area = createArea(stats, [], { x: 0, y: 0 });
    expect(tickArea(area, 0.3).ticked).toBe(false);
    expect(tickArea(area, 0.3).ticked).toBe(true);
  });

  it('틱 이후 초과분을 누적해 다음 틱을 앞당긴다', () => {
    // 프레임이 길어져도 피해량이 손실되지 않아야 한다.
    const area = createArea(stats, [], { x: 0, y: 0 });
    tickArea(area, 0.6); // 틱 발생, 0.1 남음
    expect(area.elapsedSinceTick).toBeCloseTo(0.1, 10);
    expect(tickArea(area, 0.4).ticked).toBe(true);
  });

  it('지속시간이 끝나면 만료된다', () => {
    const area = createArea(stats, [], { x: 0, y: 0 });
    expect(tickArea(area, 1.0).expired).toBe(false);
    expect(tickArea(area, 1.0).expired).toBe(true);
  });

  it("'지진'처럼 틱 간격이 줄어들면 더 자주 발생한다", () => {
    // 원안: 지속피해 간격 50% 가속 -> 0.5 / 1.5 = 0.333
    const fast = createArea({ ...stats, tickInterval: 0.5 / 1.5 }, [], { x: 0, y: 0 });
    expect(tickArea(fast, 0.34).ticked).toBe(true);
  });
});

describe('containsPoint', () => {
  it('반경 안이면 포함한다', () => {
    const area = createArea(stats, [], { x: 0, y: 0 });
    expect(containsPoint(area, { x: 50, y: 0 })).toBe(true);
    expect(containsPoint(area, { x: 100, y: 0 })).toBe(true);
    expect(containsPoint(area, { x: 101, y: 0 })).toBe(false);
  });
});

describe('remainingRatio', () => {
  it('생성 직후에는 1, 만료 시점에는 0이다', () => {
    const area = createArea(stats, [], { x: 0, y: 0 });
    expect(remainingRatio(area)).toBe(1);
    tickArea(area, 1.0);
    expect(remainingRatio(area)).toBeCloseTo(0.5, 10);
    tickArea(area, 1.0);
    expect(remainingRatio(area)).toBe(0);
  });

  it('보조능력으로 지속시간이 늘어나도 비율은 1에서 시작한다', () => {
    // '끌어내리는 지대'는 지속시간 +2초
    const longer = createArea({ ...stats, duration: 4 }, [], { x: 0, y: 0 });
    expect(longer.duration).toBe(4);
    expect(remainingRatio(longer)).toBe(1);
  });
});
