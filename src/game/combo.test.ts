import { describe, expect, it } from 'vitest';
import {
  createCombo,
  gainCombo,
  sustainCombo,
  tickCombo,
  consumeCombo,
  comboTriggerMet,
  comboRulesOf,
  comboTotal,
  comboOf,
  otherHand,
  COMBO_MAX,
} from './combo';
import type { StatBlock } from '@/engine/modifiers';

const stats: StatBlock = {};

describe('콤보 적립', () => {
  it('명중한 손의 수치만 오른다', () => {
    const combo = gainCombo(createCombo(), 'left', stats);

    expect(combo.left).toBe(1);
    expect(combo.right).toBe(0);
    expect(combo.lastHand).toBe('left');
  });

  it('양손을 번갈아 쳐도 합계로 쌓인다', () => {
    // 예전에는 손마다 게이지가 따로라 번갈아 쓰면 어느 쪽도 차지 않았다.
    // 양손 조합이 이 게임의 핵심인데 기계가 한 손 연타를 보상하던 문제다.
    let combo = createCombo();
    for (const hand of ['left', 'right', 'left', 'right'] as const) {
      combo = gainCombo(combo, hand, stats);
    }

    expect(comboTotal(combo)).toBe(4);
    expect(combo.left).toBe(2);
    expect(combo.right).toBe(2);
  });

  it('상한을 넘지 않는다', () => {
    let combo = createCombo();
    for (let i = 0; i < COMBO_MAX + 5; i++) combo = gainCombo(combo, 'left', stats);

    expect(combo.left).toBe(COMBO_MAX);
  });

  it('보조능력의 콤보 획득량 수정자를 반영한다', () => {
    const combo = gainCombo(createCombo(), 'left', { comboGain: 2 });

    expect(combo.left).toBe(2);
  });

  it('강화기술 명중은 수치를 올리지 않고 직전 손만 갱신한다', () => {
    // 직전 손을 갱신해야 강화기술이 나가는 동안에도 교차 판정이 이어진다.
    let combo = gainCombo(createCombo(), 'left', stats);
    combo = sustainCombo(combo, 'right', stats);

    expect(combo.left).toBe(1);
    expect(combo.right).toBe(0);
    expect(combo.lastHand).toBe('right');
  });
});

describe('콤보 만료', () => {
  it('지속시간이 다하면 전부 풀린다', () => {
    let combo = gainCombo(gainCombo(createCombo(), 'left', stats), 'right', stats);
    combo = tickCombo(combo, 5.1);

    expect(comboTotal(combo)).toBe(0);
    expect(combo.lastHand).toBeNull();
  });

  it('명중이 이어지면 시간이 다시 찬다', () => {
    let combo = gainCombo(createCombo(), 'left', stats);
    combo = tickCombo(combo, 4);
    combo = gainCombo(combo, 'right', stats);

    expect(combo.remaining).toBe(5);
    expect(comboTotal(combo)).toBe(2);
  });
});

describe('콤보 소모', () => {
  it('전체를 소모하면 양손이 비고 직전 손은 남는다', () => {
    // 직전 손이 남아야 소모 직후에도 교차 리듬이 끊기지 않는다.
    let combo = gainCombo(gainCombo(createCombo(), 'left', stats), 'left', stats);
    combo = gainCombo(combo, 'right', stats);
    combo = consumeCombo(combo, 'total');

    expect(comboTotal(combo)).toBe(0);
    expect(combo.lastHand).toBe('right');
  });

  it('한 손만 소모하면 반대손은 남는다', () => {
    let combo = gainCombo(gainCombo(createCombo(), 'left', stats), 'right', stats);
    combo = consumeCombo(combo, 'left');

    expect(combo.left).toBe(0);
    expect(combo.right).toBe(1);
  });
});

describe('콤보 조건 판정', () => {
  it('교차 — 직전 명중이 반대손이면 성립한다', () => {
    const combo = gainCombo(createCombo(), 'right', stats);

    expect(comboTriggerMet(combo, 'left', { reads: 'alternate' })).toBe(true);
    expect(comboTriggerMet(combo, 'right', { reads: 'alternate' })).toBe(false);
  });

  it('교차 — 같은 손을 연달아 치면 끊긴다', () => {
    let combo = gainCombo(createCombo(), 'right', stats);
    expect(comboTriggerMet(combo, 'left', { reads: 'alternate' })).toBe(true);

    combo = gainCombo(combo, 'left', stats);
    expect(comboTriggerMet(combo, 'left', { reads: 'alternate' })).toBe(false);
  });

  it('교차 — 아직 아무것도 안 맞혔으면 성립하지 않는다', () => {
    expect(comboTriggerMet(createCombo(), 'left', { reads: 'alternate' })).toBe(false);
  });

  it('자기 손 수치를 본다', () => {
    let combo = createCombo();
    for (let i = 0; i < 5; i++) combo = gainCombo(combo, 'left', stats);

    expect(comboTriggerMet(combo, 'left', { reads: 'self', required: 5 })).toBe(true);
    expect(comboTriggerMet(combo, 'right', { reads: 'self', required: 5 })).toBe(false);
  });

  it('반대손 수치를 본다', () => {
    let combo = createCombo();
    for (let i = 0; i < 5; i++) combo = gainCombo(combo, 'left', stats);

    expect(comboTriggerMet(combo, 'right', { reads: 'other', required: 5 })).toBe(true);
    expect(comboTriggerMet(combo, 'left', { reads: 'other', required: 5 })).toBe(false);
  });

  it('합계를 보면 어느 손으로 쌓았든 상관없다', () => {
    let combo = createCombo();
    for (const hand of ['left', 'right', 'left', 'right', 'left', 'right'] as const) {
      combo = gainCombo(combo, hand, stats);
    }

    expect(comboTriggerMet(combo, 'left', { reads: 'total', required: 6 })).toBe(true);
    expect(comboTriggerMet(combo, 'right', { reads: 'total', required: 6 })).toBe(true);
    expect(comboTriggerMet(combo, 'left', { reads: 'total', required: 7 })).toBe(false);
  });
});

describe('보조능력에서 콤보 규칙 읽기', () => {
  it('콤보 거동만 골라낸다', () => {
    const rules = comboRulesOf([
      { kind: 'pierce', count: 2 },
      { kind: 'combo', trigger: { reads: 'alternate' }, effect: { kind: 'comboSkill' } },
    ]);

    expect(rules).toHaveLength(1);
    expect(rules[0].trigger).toEqual({ reads: 'alternate' });
  });

  it('콤보 거동이 없으면 비어 있다', () => {
    // 이게 곧 "이 무기는 콤보를 쓰지 않는다"는 뜻이다.
    expect(comboRulesOf([{ kind: 'pierce', count: 2 }])).toEqual([]);
    expect(comboRulesOf(undefined)).toEqual([]);
  });
});

describe('보조', () => {
  it('otherHand는 반대손을 준다', () => {
    expect(otherHand('left')).toBe('right');
    expect(otherHand('right')).toBe('left');
  });

  it('comboOf는 손별 수치를 준다', () => {
    const combo = gainCombo(createCombo(), 'right', stats);

    expect(comboOf(combo, 'right')).toBe(1);
    expect(comboOf(combo, 'left')).toBe(0);
  });
});
