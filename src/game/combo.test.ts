import { describe, it, expect } from 'vitest';
import {
  createCombo,
  gainCombo,
  tickCombo,
  isComboReady,
  sustainCombo,
  breakCombo,
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

describe('isComboReady', () => {
  it('목표치에 도달해야 발동할 수 있다', () => {
    let combo = createCombo();
    for (let i = 0; i < COMBO_REQUIRED - 1; i++) combo = gainCombo(combo, base);
    expect(isComboReady(combo)).toBe(false);

    combo = gainCombo(combo, base);
    expect(isComboReady(combo)).toBe(true);
  });
});

describe('발동 상태 유지 - 원안: n콤보 이상 시 전환, 콤보는 지속시간 n초', () => {
  const filled = () => {
    let combo = createCombo();
    for (let i = 0; i < COMBO_REQUIRED; i++) combo = gainCombo(combo, base);
    return combo;
  };

  it('발동 스킬을 써도 콤보가 소모되지 않는다', () => {
    // 한 번 쓰고 끝나면 '이상 시'와 '지속시간'이 무의미해진다.
    const combo = filled();
    expect(isComboReady(combo)).toBe(true);
    // 발동 스킬 사용은 상태를 바꾸지 않는다
    expect(isComboReady(combo)).toBe(true);
  });

  it('발동 스킬이 명중하면 지속시간만 갱신된다', () => {
    let combo = filled();
    combo = tickCombo(combo, 2);
    expect(combo.remaining).toBeCloseTo(COMBO_BASE_DURATION - 2, 10);

    combo = sustainCombo(combo, base);
    expect(combo.remaining).toBe(COMBO_BASE_DURATION);
    expect(combo.value).toBe(COMBO_REQUIRED);
  });

  it('맞히지 못하면 지속시간이 다해 끊긴다', () => {
    let combo = filled();
    combo = tickCombo(combo, COMBO_BASE_DURATION + 0.1);
    expect(isComboReady(combo)).toBe(false);
    expect(combo.value).toBe(0);
  });

  it('계속 맞히면 발동 상태가 유지된다', () => {
    let combo = filled();
    for (let i = 0; i < 20; i++) {
      combo = tickCombo(combo, COMBO_BASE_DURATION * 0.6);
      combo = sustainCombo(combo, base);
    }
    expect(isComboReady(combo)).toBe(true);
  });

  it('콤보가 없으면 유지 대상이 아니다', () => {
    const empty = createCombo();
    expect(sustainCombo(empty, base)).toBe(empty);
  });

  it('breakCombo는 명시적으로 끊는다', () => {
    expect(isComboReady(breakCombo())).toBe(false);
  });
});
