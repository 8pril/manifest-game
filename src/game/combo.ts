import type { StatBlock } from '@/engine/modifiers';
import type { Behavior } from '@/engine/support';

/**
 * 콤보 게이지.
 *
 * 원안: "기본 공격 n콤보 **이상 시** 부여된 스킬로 **전환**됨", "콤보는 기본 지속시간 n초".
 *
 * `이상 시`는 조건이고 `전환`은 모드 전환이다. 목표치에 도달하면 그 무기의 공격이
 * 발동 스킬로 **바뀌어 있는 상태**가 되고, 콤보가 끊길 때까지 유지된다.
 * 한 번 쓰고 사라지는 것이 아니다.
 *
 * **콤보는 더 이상 모든 무기의 기본 규칙이 아니다.** 기본 공격에 `콤보 개방`
 * 보조2형을 붙인 무기만 게이지를 쌓는다. 붙이지 않은 무기는 기본 공격만 쓴다.
 *
 * 이렇게 바꾼 이유는 콤보가 선택이 아니라 통행세였기 때문이다. 강한 기술을 쓰려면
 * 누구나 먼저 5대를 채워야 했고, 그 5대에는 아무 판단이 없었다. 선택형으로 돌리면
 * "콤보를 쓰는 빌드"와 "안 쓰는 빌드"가 갈린다.
 */

/** 발동에 필요한 기본 콤보 수. `콤보 개방`이 값을 들고 있다. */
export const COMBO_REQUIRED = 5;
/** 마지막 명중 이후 콤보가 유지되는 기본 시간(초). */
export const COMBO_BASE_DURATION = 5;

/**
 * 이 스킬에 콤보 전환이 열려 있는지.
 *
 * 씬이 거동 배열을 직접 뒤지지 않도록 여기서 판정한다.
 */
export function comboBehaviorOf(
  behaviors: readonly Behavior[] | undefined,
): { required: number; duration: number } | null {
  const found = behaviors?.find((b) => b.kind === 'combo');
  return found && found.kind === 'combo' ? { required: found.required, duration: found.duration } : null;
}

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
export function gainCombo(combo: ComboState, stats: StatBlock, required = COMBO_REQUIRED): ComboState {
  const gain = Math.max(1, Math.round(stats.comboGain ?? 1));
  const duration = stats.comboDuration ?? COMBO_BASE_DURATION;

  return {
    value: Math.min(required, combo.value + gain),
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
export function isComboReady(combo: ComboState, required = COMBO_REQUIRED): boolean {
  return combo.value >= required;
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
