import type { StatBlock } from '@/engine/modifiers';

/**
 * 콤보 게이지.
 *
 * 원안: "기본 공격 n콤보 **이상 시** 부여된 스킬로 **전환**됨", "콤보는 기본 지속시간 n초".
 *
 * `이상 시`는 조건이고 `전환`은 모드 전환이다. 목표치에 도달하면 그 무기의 공격이
 * 발동 스킬로 **바뀌어 있는 상태**가 되고, 콤보가 끊길 때까지 유지된다.
 * 한 번 쓰고 사라지는 것이 아니다.
 *
 * 발동 스킬로 때려도 콤보 지속시간은 갱신되지만 게이지가 오르지는 않는다.
 * 계속 맞히면 유지되고, 놓치면 지속시간이 지나 끊긴다.
 * 이 구조라서 "콤보를 유지하는 것" 자체가 플레이의 긴장이 된다.
 */

/** 발동에 필요한 콤보 수. */
export const COMBO_REQUIRED = 5;
/** 마지막 명중 이후 콤보가 유지되는 기본 시간(초). */
export const COMBO_BASE_DURATION = 5;

export interface ComboState {
  value: number;
  /** 남은 유지 시간(초). */
  remaining: number;
}

export function createCombo(): ComboState {
  return { value: 0, remaining: 0 };
}

/**
 * 기본 공격이 명중했을 때 콤보를 올린다.
 * 보조능력의 comboGain / comboDuration 수정자가 반영된다.
 */
export function gainCombo(combo: ComboState, stats: StatBlock): ComboState {
  const gain = Math.max(1, Math.round(stats.comboGain ?? 1));
  const duration = stats.comboDuration ?? COMBO_BASE_DURATION;

  return {
    value: Math.min(COMBO_REQUIRED, combo.value + gain),
    remaining: duration,
  };
}

/**
 * 발동 스킬이 명중했을 때. 지속시간만 갱신하고 게이지는 그대로 둔다.
 * 발동 상태를 유지하려면 계속 맞혀야 한다.
 */
export function sustainCombo(combo: ComboState, stats: StatBlock): ComboState {
  if (combo.value === 0) return combo;
  return { ...combo, remaining: stats.comboDuration ?? COMBO_BASE_DURATION };
}

export function tickCombo(combo: ComboState, deltaSeconds: number): ComboState {
  if (combo.value === 0) return combo;

  const remaining = combo.remaining - deltaSeconds;
  return remaining <= 0 ? createCombo() : { ...combo, remaining };
}

/** 발동 스킬을 쓸 수 있는 상태인지. */
export function isComboReady(combo: ComboState): boolean {
  return combo.value >= COMBO_REQUIRED;
}

/**
 * 콤보를 끊는다.
 *
 * 발동 스킬을 썼다고 끊지 않는다. 원안대로 콤보가 유지되는 동안은
 * 계속 발동 스킬이 나가야 한다. 지속시간이 다했을 때만 `tickCombo`가 끊는다.
 * 이 함수는 판이 새로 시작하는 등 명시적으로 초기화할 때만 쓴다.
 */
export function breakCombo(): ComboState {
  return createCombo();
}
