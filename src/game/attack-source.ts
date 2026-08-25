import type { Weapon } from '@/data/weapons';
import type { StatBlock } from '@/engine/modifiers';
import type { ComboEffect, ComboTrigger } from '@/engine/support';
import type { Hand } from '@/game/combo';
import type { EmpowerState } from '@/game/empower';

export interface AttackComboRule {
  ownerHand: Hand;
  trigger: ComboTrigger;
  effect: ComboEffect;
  supportName: string;
}

/**
 * 공격이 생성된 순간의 소유권과 콤보 계산 기준.
 *
 * 투사체와 지대는 생성 후에도 남으므로 현재 장비를 다시 조회하면 안 된다.
 * R링 교체나 마을 설정이 일어나도 이 공격은 발동 당시 손과 수치를 유지한다.
 */
export interface AttackSource {
  weapon: Weapon;
  hand: Hand;
  comboStats: StatBlock;
  tracksCombo: boolean;
  comboRules: readonly AttackComboRule[];
  /** 발동 순간 확보한 강화. 이 공격의 모든 전달체가 공유한다. */
  empower?: EmpowerState;
}

export function snapshotAttackSource(source: AttackSource): AttackSource {
  return {
    weapon: source.weapon,
    hand: source.hand,
    comboStats: { ...source.comboStats },
    tracksCombo: source.tracksCombo,
    empower: source.empower ? { ...source.empower } : undefined,
    comboRules: source.comboRules.map((rule) => ({
      ownerHand: rule.ownerHand,
      trigger: { ...rule.trigger },
      effect: { ...rule.effect },
      supportName: rule.supportName,
    })),
  };
}
