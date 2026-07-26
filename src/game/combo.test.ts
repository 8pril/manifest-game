import { describe, it, expect } from 'vitest';
import {
  createCombo,
  gainCombo,
  tickCombo,
  isComboReady,
  consumeCombo,
  COMBO_REQUIRED,
  COMBO_BASE_DURATION,
} from '@/game/combo';

const base = { comboGain: 1, comboDuration: COMBO_BASE_DURATION };

describe('gainCombo', () => {
  it('명중할 때마다 1씩 오른다', () => {
    let combo = createCombo();
    combo = gainCombo(combo, base);
    expect(combo.value).toBe(1);
    combo = gainCombo(combo, base);
    expect(combo.value).toBe(2);
  });

  it('목표치를 넘어가지 않는다', () => {
    let combo = createCombo();
    for (let i = 0; i < COMBO_REQUIRED + 5; i++) combo = gainCombo(combo, base);
    expect(combo.value).toBe(COMBO_REQUIRED);
  });

  it('명중할 때마다 유지 시간이 갱신된다', () => {
    let combo = gainCombo(createCombo(), base);
    combo = tickCombo(combo, 2);
    expect(combo.remaining).toBeCloseTo(COMBO_BASE_DURATION - 2, 10);

    combo = gainCombo(combo, base);
    expect(combo.remaining).toBe(COMBO_BASE_DURATION);
  });

  it("'과감한 결단'의 comboGain 증폭이 반영된다", () => {
    // comboGain 1 × (1 + 0.5) = 1.5 -> 반올림 2
    const boosted = { comboGain: 1.5, comboDuration: COMBO_BASE_DURATION };
    expect(gainCombo(createCombo(), boosted).value).toBe(2);
  });

  it("'과감한 결단'의 comboDuration 증폭이 반영된다", () => {
    const boosted = { comboGain: 1, comboDuration: COMBO_BASE_DURATION * 2 };
    expect(gainCombo(createCombo(), boosted).remaining).toBe(COMBO_BASE_DURATION * 2);
  });
});

describe('tickCombo', () => {
  it('유지 시간이 다하면 초기화된다', () => {
    let combo = gainCombo(createCombo(), base);
    combo = tickCombo(combo, COMBO_BASE_DURATION + 0.1);
    expect(combo.value).toBe(0);
  });

  it('콤보가 0이면 아무 일도 하지 않는다', () => {
    const empty = createCombo();
    expect(tickCombo(empty, 10)).toBe(empty);
  });
});

describe('isComboReady / consumeCombo', () => {
  it('목표치에 도달해야 발동할 수 있다', () => {
    let combo = createCombo();
    for (let i = 0; i < COMBO_REQUIRED - 1; i++) combo = gainCombo(combo, base);
    expect(isComboReady(combo)).toBe(false);

    combo = gainCombo(combo, base);
    expect(isComboReady(combo)).toBe(true);
  });

  it('발동하면 콤보가 소모된다', () => {
    const combo = consumeCombo();
    expect(combo.value).toBe(0);
    expect(isComboReady(combo)).toBe(false);
  });
});
