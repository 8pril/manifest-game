import type { StatBlock } from '@/engine/modifiers';

/**
 * 콤보 게이지.
 *
 * 원안: "기본 공격 n콤보 이상 시 부여된 스킬로 전환", "콤보는 기본 지속시간 n초".
 * 기본 공격이 명중하면 게이지가 오르고, 목표치에 도달하면 다음 공격이
 * 무기의 발동 스킬로 바뀐다. 일정 시간 명중하지 못하면 초기화된다.
 */

/** 발동에 필요한 콤보 수. */
export const COMBO_REQUIRED = 5;
/** 마지막 명중 이후 콤보가 유지되는 기본 시간(초). */
export const COMBO_BASE_DURATION = 3;

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

export function tickCombo(combo: ComboState, deltaSeconds: number): ComboState {
  if (combo.value === 0) return combo;

  const remaining = combo.remaining - deltaSeconds;
  return remaining <= 0 ? createCombo() : { ...combo, remaining };
}

/** 발동 스킬을 쓸 수 있는 상태인지. */
export function isComboReady(combo: ComboState): boolean {
  return combo.value >= COMBO_REQUIRED;
}

/** 발동 스킬을 쓰고 콤보를 소모한다. */
export function consumeCombo(): ComboState {
  return createCombo();
}
