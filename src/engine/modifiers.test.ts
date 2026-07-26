import { describe, it, expect } from 'vitest';
import { resolveStat, resolveCount, resolveStats, type Modifier } from '@/engine/modifiers';

const mod = (stat: Modifier['stat'], mode: Modifier['mode'], value: number): Modifier => ({
  stat,
  mode,
  value,
});

describe('resolveStat - 원안 계산 규칙', () => {
  it('수정자가 없으면 기본값을 그대로 돌려준다', () => {
    expect(resolveStat(100, 'damage', [])).toBe(100);
  });

  it('flat은 비율 계산보다 먼저 더해진다', () => {
    // (1 + 2) * (1 + 1.0) = 6
    expect(
      resolveStat(1, 'projectileCount', [
        mod('projectileCount', 'flat', 2),
        mod('projectileCount', 'increase', 1.0),
      ]),
    ).toBe(6);
  });

  it('증가는 합산되어 한 번만 곱해진다', () => {
    // 100 * (1 + 0.25 + 0.25) = 150
    expect(
      resolveStat(100, 'damage', [
        mod('damage', 'increase', 0.25),
        mod('damage', 'increase', 0.25),
      ]),
    ).toBe(150);
  });

  it('감소는 합산되어 한 번만 나눠진다', () => {
    // 100 / (1 + 0.4 + 0.4) = 55.55...
    expect(
      resolveStat(100, 'damage', [mod('damage', 'reduce', 0.4), mod('damage', 'reduce', 0.4)]),
    ).toBeCloseTo(100 / 1.8, 10);
  });

  it('증폭은 개별적으로 곱해진다', () => {
    // 100 * 1.5 * 1.5 = 225. 합산이었다면 200이 된다.
    expect(
      resolveStat(100, 'damage', [mod('damage', 'more', 0.5), mod('damage', 'more', 0.5)]),
    ).toBeCloseTo(225, 10);
  });

  it('감폭은 개별적으로 나눠진다', () => {
    // 100 / 1.5 / 1.5
    expect(
      resolveStat(100, 'damage', [mod('damage', 'less', 0.5), mod('damage', 'less', 0.5)]),
    ).toBeCloseTo(100 / 2.25, 10);
  });

  it('증가/감소를 먼저 계산한 뒤 증폭/감폭을 적용한다', () => {
    // (100 * 1.5 / 1.25) * 1.2 = 144
    expect(
      resolveStat(100, 'damage', [
        mod('damage', 'increase', 0.5),
        mod('damage', 'reduce', 0.25),
        mod('damage', 'more', 0.2),
      ]),
    ).toBeCloseTo((100 * 1.5) / 1.25 / 1 / 1 * 1.2, 10);
  });

  it('다른 스탯의 수정자는 무시한다', () => {
    expect(resolveStat(100, 'damage', [mod('duration', 'increase', 10)])).toBe(100);
  });
});

describe('원안 문서에 적힌 실제 수치를 재현한다', () => {
  it("'지진': 지대 지속피해 간격 0.5초에 50% 가속이면 0.34초", () => {
    // 원안 메모: "ex) 기본 지대 지속피해 0.5초 -> 0.5/1.5=0.34초"
    const result = resolveStat(0.5, 'tickInterval', [mod('tickInterval', 'reduce', 0.5)]);
    expect(result).toBeCloseTo(0.333, 3);
  });

  it("'다중투사체': 투사체 수 +2, 투사체 피해 40% 감소", () => {
    const multipleProjectiles = [
      mod('projectileCount', 'flat', 2),
      mod('damage', 'reduce', 0.4),
    ];
    expect(resolveCount(1, 'projectileCount', multipleProjectiles)).toBe(3);
    expect(resolveStat(100, 'damage', multipleProjectiles)).toBeCloseTo(100 / 1.4, 10);
  });

  it("'갈래': 갈라지는 투사체 수 +3, 투사체 피해 40% 감소", () => {
    const fork = [mod('forkCount', 'flat', 3), mod('damage', 'reduce', 0.4)];
    expect(resolveCount(0, 'forkCount', fork)).toBe(3);
    expect(resolveStat(100, 'damage', fork)).toBeCloseTo(71.43, 2);
  });

  it("'투사체 속도 증가': 속도 50% 증가, 피해 20% 증가", () => {
    const speedUp = [
      mod('projectileSpeed', 'increase', 0.5),
      mod('damage', 'increase', 0.2),
    ];
    expect(resolveStat(400, 'projectileSpeed', speedUp)).toBe(600);
    expect(resolveStat(100, 'damage', speedUp)).toBe(120);
  });

  it("'지속되는 평정': 지속시간 50% 증폭은 증가와 다르게 곱해진다", () => {
    // 증가 50%와 증폭 50%가 함께 붙으면 1.5 * 1.5 = 2.25배
    const mods = [
      mod('duration', 'increase', 0.5),
      mod('duration', 'more', 0.5),
    ];
    expect(resolveStat(2, 'duration', mods)).toBeCloseTo(4.5, 10);
  });

  it("'다중투사체' + '부귀'를 함께 붙이면 감소와 증가가 각각 합산된다", () => {
    // 부귀: 피해 25% 증가 / 다중투사체: 피해 40% 감소
    // 100 * 1.25 / 1.4 = 89.28...
    const mods = [mod('damage', 'reduce', 0.4), mod('damage', 'increase', 0.25)];
    expect(resolveStat(100, 'damage', mods)).toBeCloseTo(89.29, 2);
  });
});

describe('resolveCount', () => {
  it('정수로 반올림한다', () => {
    expect(resolveCount(1, 'projectileCount', [mod('projectileCount', 'increase', 0.4)])).toBe(1);
    expect(resolveCount(1, 'projectileCount', [mod('projectileCount', 'increase', 0.6)])).toBe(2);
  });

  it('음수가 되지 않는다', () => {
    expect(resolveCount(1, 'projectileCount', [mod('projectileCount', 'flat', -5)])).toBe(0);
  });
});

describe('resolveStats', () => {
  it('기본값에 없던 스탯도 수정자가 있으면 결과에 포함한다', () => {
    const result = resolveStats({ damage: 100 }, [mod('pierceCount', 'flat', 2)]);
    expect(result.damage).toBe(100);
    expect(result.pierceCount).toBe(2);
  });
});
