import type { Skill, Support } from '@/engine/support';
import { resolveSkill, type ResolvedSkill } from '@/engine/support';
import { weaponOf, type Weapon, type WeaponId } from '@/data/weapons';

/**
 * 로드아웃.
 *
 * 플레이어는 무기 2종을 들고, 각 무기는 기본 공격과 발동 스킬을 갖는다.
 * 보조능력은 스킬 단위로 붙으므로 어떤 보조능력이 어느 스킬에 붙었는지를
 * 같이 들고 다녀야 한다. 원안의 "스킬당 보조젬 2개"를 그대로 유지하면서
 * 웨이브마다 선택을 받으려면 이 구조가 필요하다.
 *
 * 무기 2종 × (기본 + 발동) × 슬롯 2 = 최대 8개까지 장착 가능하다.
 */

export interface Loadout {
  left: WeaponId;
  right: WeaponId;
  /** 스킬 id별로 장착된 보조능력. */
  supports: Readonly<Record<string, readonly Support[]>>;
}

export function createLoadout(left: WeaponId, right: WeaponId): Loadout {
  return { left, right, supports: {} };
}

export function leftWeapon(loadout: Loadout): Weapon {
  return weaponOf(loadout.left);
}

export function rightWeapon(loadout: Loadout): Weapon {
  return weaponOf(loadout.right);
}

/** 로드아웃에 포함된 모든 스킬. 기본 공격 2개 + 발동 스킬 2개. */
export function allSkills(loadout: Loadout): Skill[] {
  const left = leftWeapon(loadout);
  const right = rightWeapon(loadout);
  return [left.basic, left.combo, right.basic, right.combo];
}

export function supportsFor(loadout: Loadout, skillId: string): readonly Support[] {
  return loadout.supports[skillId] ?? [];
}

/** 보조능력을 특정 스킬에 붙인 새 로드아웃을 만든다. */
export function attachSupport(loadout: Loadout, skillId: string, support: Support): Loadout {
  return {
    ...loadout,
    supports: {
      ...loadout.supports,
      [skillId]: [...supportsFor(loadout, skillId), support],
    },
  };
}

export function resolveFor(loadout: Loadout, skill: Skill): ResolvedSkill {
  return resolveSkill(skill, supportsFor(loadout, skill.id));
}

/** 장착된 보조능력 총 개수. HUD와 결과 화면에 쓴다. */
export function totalSupports(loadout: Loadout): number {
  return Object.values(loadout.supports).reduce((sum, list) => sum + list.length, 0);
}

/**
 * 손별로 장착된 보조능력을 정리한다.
 *
 * 스킬 이름만 나열하면 그 스킬이 왼손 것인지 오른손 것인지 알 수 없다.
 * 어느 손을 강화했는지가 보여야 선택의 결과를 알 수 있다.
 */
export function describeByHand(loadout: Loadout): { hand: string; weapon: string; lines: string[] }[] {
  const sides = [
    { hand: '왼손', weapon: leftWeapon(loadout) },
    { hand: '오른손', weapon: rightWeapon(loadout) },
  ];

  return sides.map(({ hand, weapon }) => ({
    hand,
    weapon: weapon.name,
    lines: [weapon.basic, weapon.combo].flatMap((skill) => {
      const supports = supportsFor(loadout, skill.id);
      return supports.length ? [`${skill.name}: ${supports.map((s) => s.name).join(', ')}`] : [];
    }),
  }));
}

/** 어떤 스킬이 어느 손에 속하는지. 선택 화면에서 쓴다. */
export function handOf(loadout: Loadout, skillId: string): '왼손' | '오른손' | null {
  const left = leftWeapon(loadout);
  if (left.basic.id === skillId || left.combo.id === skillId) return '왼손';
  const right = rightWeapon(loadout);
  if (right.basic.id === skillId || right.combo.id === skillId) return '오른손';
  return null;
}
