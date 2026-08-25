import { describe, expect, it } from 'vitest';
import {
  createCombo,
  gainCombo,
  tickCombo,
  consumeCombo,
  comboTriggerMet,
  comboTriggerTracksHand,
  comboRulesOf,
  comboTotal,
  comboOf,
  otherHand,
  comboReadout,
  refreshCombo,
  COMBO_MAX,
  COMBO_BASE_DURATION,
} from './combo';
import type { StatBlock } from '@/engine/modifiers';

const stats: StatBlock = {};

describe('콤보 적립', () => {
  it('명중한 손의 수치만 오른다', () => {
    const combo = gainCombo(createCombo(), 'left', stats);

    expect(combo.left).toBe(1);
    expect(combo.right).toBe(0);
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

  it('소수 콤보 획득량을 타격마다 반올림하지 않고 누적한다', () => {
    let combo = gainCombo(createCombo(), 'left', { comboGain: 1.5 });
    combo = gainCombo(combo, 'left', { comboGain: 1.5 });

    expect(combo.left).toBe(3);
  });

});

describe('콤보 만료', () => {
  it('지속시간이 다하면 전부 풀린다', () => {
    let combo = gainCombo(gainCombo(createCombo(), 'left', stats), 'right', stats);
    combo = tickCombo(combo, 5.1);

    expect(comboTotal(combo)).toBe(0);
  });

  it('명중이 이어지면 시간이 다시 찬다', () => {
    let combo = gainCombo(createCombo(), 'left', stats);
    combo = tickCombo(combo, 4);
    combo = gainCombo(combo, 'right', stats);

    expect(combo.remaining).toBe(5);
    expect(comboTotal(combo)).toBe(2);
  });

  it('10초 지속 콤보를 반대손의 5초 명중이 줄이지 않는다', () => {
    let combo = gainCombo(createCombo(), 'left', { comboDuration: 10 });
    combo = tickCombo(combo, 2);
    combo = gainCombo(combo, 'right', { comboDuration: 5 });

    expect(combo.remaining).toBe(8);
    expect(combo.left).toBe(1);
    expect(combo.right).toBe(1);
  });

  it('긴 지속시간이 5초보다 적게 남으면 반대손 명중도 최소 5초까지 연장한다', () => {
    let combo = gainCombo(createCombo(), 'left', { comboDuration: 10 });
    combo = tickCombo(combo, 6);
    combo = gainCombo(combo, 'right', { comboDuration: 5 });

    expect(combo.remaining).toBe(5);
  });
});

describe('콤보 소모', () => {
  it('전체를 소모하면 양손이 비고 직전 손은 남는다', () => {
    // 직전 손이 남아야 소모 직후에도 교차 리듬이 끊기지 않는다.
    let combo = gainCombo(gainCombo(createCombo(), 'left', stats), 'left', stats);
    combo = gainCombo(combo, 'right', stats);
    combo = consumeCombo(combo, 'total');

    expect(comboTotal(combo)).toBe(0);
  });

  it('한 손만 소모하면 반대손은 남는다', () => {
    let combo = gainCombo(gainCombo(createCombo(), 'left', stats), 'right', stats);
    combo = consumeCombo(combo, 'left');

    expect(combo.left).toBe(0);
    expect(combo.right).toBe(1);
  });
});

describe('콤보 조건 판정', () => {

  it('합계 조건은 연계를 어느 손에 장착해도 양손 명중을 센다', () => {
    const trigger = { reads: 'total', required: 6 } as const;

    expect(comboTriggerTracksHand('left', 'left', trigger)).toBe(true);
    expect(comboTriggerTracksHand('left', 'right', trigger)).toBe(true);
  });

  it('자기 손과 반대손 조건은 필요한 손의 명중만 센다', () => {
    expect(comboTriggerTracksHand('left', 'left', { reads: 'self', required: 5 })).toBe(true);
    expect(comboTriggerTracksHand('left', 'right', { reads: 'self', required: 5 })).toBe(false);
    expect(comboTriggerTracksHand('left', 'left', { reads: 'other', required: 5 })).toBe(false);
    expect(comboTriggerTracksHand('left', 'right', { reads: 'other', required: 5 })).toBe(true);
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

describe('지대 지속피해', () => {
  it('지속시간만 늘리고 수치는 건드리지 않는다', () => {
    // 지대 틱은 플레이어가 손으로 친 것이 아니라 깔아 둔 지대가 도는 것이다.
    // 여기서 수치를 올리면 한 번 깔고 가만히 있어도 콤보가 계속 오른다.
    let combo = createCombo();
    for (const hand of ['left', 'right'] as const) combo = gainCombo(combo, hand, stats);

    const after = refreshCombo(tickCombo(combo, 2), stats);

    expect(after.left).toBe(combo.left);
    expect(after.right).toBe(combo.right);
    expect(after.remaining).toBe(COMBO_BASE_DURATION);
  });

  it('짧은 지대 틱이 다른 손이 만든 긴 콤보 시간을 줄이지 않는다', () => {
    let combo = gainCombo(createCombo(), 'left', { comboDuration: 10 });
    combo = tickCombo(combo, 2);

    const after = refreshCombo(combo, { comboDuration: 5 });

    expect(after.remaining).toBe(8);
  });
});

describe('보조능력에서 콤보 규칙 읽기', () => {
  it('콤보 거동만 골라낸다', () => {
    const rules = comboRulesOf([
      { kind: 'pierce', count: 2 },
      {
        kind: 'combo',
        trigger: { reads: 'total', required: 6 },
        effect: { kind: 'empower', hand: 'self', more: 0.3 },
      },
    ]);

    expect(rules).toHaveLength(1);
    expect(rules[0].trigger).toEqual({ reads: 'total', required: 6 });
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

describe('화면 표시', () => {

  it('합계 조건은 합계와 요구치를 준다', () => {
    let combo = createCombo();
    for (const hand of ['left', 'right', 'left'] as const) combo = gainCombo(combo, hand, stats);

    expect(comboReadout(combo, 'left', { reads: 'total', required: 6 })).toEqual({
      kind: 'count',
      value: 3,
      required: 6,
      label: '합계',
    });
  });

  it('자기 손 조건은 그 손의 수치를 준다', () => {
    let combo = createCombo();
    for (let i = 0; i < 4; i++) combo = gainCombo(combo, 'left', stats);

    expect(comboReadout(combo, 'left', { reads: 'self', required: 5 })).toMatchObject({ value: 4, label: '이 손' });
    expect(comboReadout(combo, 'right', { reads: 'self', required: 5 })).toMatchObject({ value: 0 });
  });

  it('반대손 조건은 반대손 수치를 준다', () => {
    let combo = createCombo();
    for (let i = 0; i < 3; i++) combo = gainCombo(combo, 'left', stats);

    expect(comboReadout(combo, 'right', { reads: 'other', required: 5 })).toMatchObject({
      value: 3,
      label: '반대손',
    });
  });
});
