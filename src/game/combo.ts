import type { StatBlock } from '@/engine/modifiers';
import type { Behavior, ComboEffect, ComboTrigger } from '@/engine/support';

/**
 * 콤보.
 *
 * **콤보는 모든 무기의 기본 규칙이 아니다.** 콤보를 읽는 연계를 붙인 무기만
 * 콤보를 쓴다. 붙이지 않은 무기는 기본 공격만 나간다.
 *
 * 처음에는 "기본 공격 5대를 채우면 강화기술로 전환"이 모든 무기에 강제로 걸려 있었다.
 * 그 5대에는 아무 판단이 없어서 선택이 아니라 통행세였고, 게이지가 손마다 따로 쌓여
 * **양손을 번갈아 쓰면 오히려 손해**였다. 양손 조합을 파는 게임인데 기계는 한 손
 * 연타를 보상하고 있었다.
 *
 * 그래서 콤보를 연계으로 옮기고, **조건과 효과를 연계가 각자 들고 있게** 했다.
 * 어떤 것은 손을 번갈아 쳤는지를 보고, 어떤 것은 양손 합계를 보고, 어떤 것은 쌓인
 * 콤보를 소모해 반대손을 강화한다. 새 규칙을 만드는 일은 코드가 아니라
 * `data/supports.ts`에 항목을 하나 더 넣는 일이다.
 */

/** 콤보가 필요한 기본 수치. 연계가 각자 값을 들고 있고 이건 기본값이다. */
export const COMBO_REQUIRED = 5;
/** 마지막 명중 이후 콤보가 유지되는 기본 시간(초). */
export const COMBO_BASE_DURATION = 5;
/**
 * 한 손이 쌓을 수 있는 콤보 상한.
 *
 * 예전에는 조건 수치(5)가 곧 상한이었는데, 이제 연계마다 요구치가 달라 그럴 수
 * 없다. 상한이 없으면 잡몹을 오래 썰수록 수치가 끝없이 올라 HUD도 의미를 잃는다.
 */
export const COMBO_MAX = 9;

// 손 구분은 장비 설정과 같은 개념이라 정의를 하나로 둔다.
export type { Hand } from '@/game/progression';
import type { Hand } from '@/game/progression';

export function otherHand(hand: Hand): Hand {
  return hand === 'left' ? 'right' : 'left';
}

/**
 * 한 판의 콤보 상태.
 *
 * 손별 수치를 따로 들고 있는 이유는 연계가 서로 다른 것을 읽기 때문이다.
 * 어떤 것은 자기 손만, 어떤 것은 반대손만, 어떤 것은 합계를 본다.
 */
export interface ComboState {
  left: number;
  right: number;
  /** 남은 유지 시간(초). 손과 무관하게 하나다. 마지막 명중에서 다시 찬다. */
  remaining: number;
  /** 직전에 명중시킨 손. 교차 판정에 쓴다. 아직 아무것도 안 맞혔으면 null. */
  lastHand: Hand | null;
}

export function createCombo(): ComboState {
  return { left: 0, right: 0, remaining: 0, lastHand: null };
}

export function comboOf(combo: ComboState, hand: Hand): number {
  return hand === 'left' ? combo.left : combo.right;
}

export function comboTotal(combo: ComboState): number {
  return combo.left + combo.right;
}

/**
 * 기본 공격이 명중했을 때 그 손의 콤보를 올린다.
 * 보조능력의 comboGain / comboDuration 수정자가 반영된다.
 */
export function gainCombo(combo: ComboState, hand: Hand, stats: StatBlock): ComboState {
  const gain = Math.max(1, Math.round(stats.comboGain ?? 1));
  const duration = stats.comboDuration ?? COMBO_BASE_DURATION;

  return {
    ...combo,
    [hand]: Math.min(COMBO_MAX, comboOf(combo, hand) + gain),
    remaining: duration,
    lastHand: hand,
  };
}

/**
 * 강화기술이 명중했을 때. 수치는 그대로 두고 지속시간과 직전 손만 갱신한다.
 *
 * 강화기술로 때린 것도 "그 손으로 때렸다"이므로 교차 판정에 반영해야 한다.
 * 반영하지 않으면 강화기술이 나가는 동안 교차가 끊긴 것으로 잘못 읽힌다.
 */
export function sustainCombo(combo: ComboState, hand: Hand, stats: StatBlock): ComboState {
  if (comboTotal(combo) === 0) return { ...combo, lastHand: hand };
  return { ...combo, remaining: stats.comboDuration ?? COMBO_BASE_DURATION, lastHand: hand };
}

export function tickCombo(combo: ComboState, deltaSeconds: number): ComboState {
  if (comboTotal(combo) === 0) return combo;

  const remaining = combo.remaining - deltaSeconds;
  return remaining <= 0 ? createCombo() : { ...combo, remaining };
}

/**
 * 쌓인 콤보를 써서 없앤다.
 *
 * `소모하여 반대쪽 무기를 강화한다` 같은 연계가 이걸 쓴다. 시간이 지나 풀리는
 * 것과 달리 **플레이어가 의도해서 털어내는** 동작이라 따로 둔다.
 */
export function consumeCombo(combo: ComboState, scope: 'total' | Hand): ComboState {
  if (scope === 'total') return { ...createCombo(), lastHand: combo.lastHand };
  return { ...combo, [scope]: 0 };
}

/** 판이 새로 시작하는 등 명시적으로 초기화할 때만 쓴다. */
export function breakCombo(): ComboState {
  return createCombo();
}

/**
 * 연계가 내건 콤보 조건이 지금 충족됐는지.
 *
 * `hand`는 이 보조가 붙어 있는 무기의 손이다. `self`와 `other`가 그 기준으로 갈린다.
 */
export function comboTriggerMet(combo: ComboState, hand: Hand, trigger: ComboTrigger): boolean {
  switch (trigger.reads) {
    // 직전 명중이 반대손이면 성립한다. 세지 않고 직전 한 번만 본다.
    // 같은 손을 연달아 치면 끊긴다.
    case 'alternate':
      return combo.lastHand !== null && combo.lastHand !== hand;
    case 'self':
      return comboOf(combo, hand) >= trigger.required;
    case 'other':
      return comboOf(combo, otherHand(hand)) >= trigger.required;
    case 'total':
      return comboTotal(combo) >= trigger.required;
  }
}

/** 스킬에 붙은 콤보 규칙들. 한 스킬에 여러 개가 붙을 수 있다. */
export function comboRulesOf(
  behaviors: readonly Behavior[] | undefined,
): Array<{ trigger: ComboTrigger; effect: ComboEffect }> {
  return (behaviors ?? []).flatMap((b) => (b.kind === 'combo' ? [{ trigger: b.trigger, effect: b.effect }] : []));
}
