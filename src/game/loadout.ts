import type { Skill, Support } from '@/engine/support';
import { resolveSkill, canAttach, type ResolvedSkill } from '@/engine/support';
import { basicSkillsOf, weaponOf, type Weapon, type WeaponId } from '@/data/weapons';
import { configuredSupports, equippedBasicSkill, type PlayerProgress } from '@/game/progression';

/**
 * 로드아웃.
 *
 * 플레이어는 무기 2종을 들고, 각 무기는 기본 공격과 발동 스킬을 갖는다.
 * 보조능력은 스킬 단위로 붙으므로 어떤 보조능력이 어느 스킬에 붙었는지를
 * 같이 들고 다녀야 한다. 새 기획에서는 마을의 실체화 장비 설정이 이 구조를 만든다.
 *
 * 무기 2종 × (기본 + 발동) × 슬롯 2 = 최대 8개까지 장착 가능하다.
 */

export interface Loadout {
  left: WeaponId;
  right: WeaponId | null;
  /** 스킬 id별로 장착된 보조능력. */
  supports: Readonly<Record<string, readonly Support[]>>;
}

export function createLoadout(left: WeaponId, right: WeaponId | null): Loadout {
  return { left, right, supports: {} };
}

export function setLoadoutWeapons(loadout: Loadout, left: WeaponId, right: WeaponId | null): Loadout {
  return { ...loadout, left, right };
}

export function loadoutFromProgress(progress: PlayerProgress, previous: Loadout = createLoadout(progress.active.left, progress.active.right)): Loadout {
  return {
    ...previous,
    left: progress.active.left,
    right: progress.active.right,
    supports: supportsFromProgress(progress),
  };
}

/**
 * 마을에서 세팅한 보조형스킬을 전투용 로드아웃 형태로 옮긴다.
 *
 * **반드시 `canAttach`를 거친다.** 보조능력은 태그가 맞는 스킬에만 붙고 슬롯 수도
 * 정해져 있는데, 세팅 경로가 그 검증을 건너뛰면 태그가 맞지 않는 조합이 조용히
 * 붙어 수정자가 엉뚱하게 적용된다. 지금은 기본 세팅이 하드코딩이라 우연히
 * 유효하지만, 마을 UI로 직접 고르게 되면 바로 문제가 된다.
 */
export function supportsFromProgress(progress: PlayerProgress): Readonly<Record<string, readonly Support[]>> {
  const supports: Record<string, Support[]> = {};
  const usedSupportIds = new Set<string>();

  for (const weaponId of progress.unlockedWeapons) {
    // **실제로 나가는 공격에만 붙인다.** 첫 소켓에 기본스킬을 끼웠으면 그것이
    // 곧 기본 공격이다. 나가지도 않는 스킬에 붙이면 그 칸이 통째로 죽는다.
    //
    // 예전에는 붙일 곳을 두 군데 두고 태그가 맞는 쪽으로 흘려보냈는데, 콤보 전환이
    // 없어지면서 그럴 이유가 사라졌다. 한 무기가 쓰는 공격은 언제나 하나다.
    const skill = equippedBasicSkill(progress, weaponId);

    for (const support of configuredSupports(progress, weaponId)) {
      if (usedSupportIds.has(support.id)) continue;
      const accepted = supports[skill.id] ?? [];
      if (canAttach(skill, support, accepted).ok) {
        supports[skill.id] = [...accepted, support];
        usedSupportIds.add(support.id);
      }
    }
  }
  return supports;
}

export function leftWeapon(loadout: Loadout): Weapon {
  return weaponOf(loadout.left);
}

export function rightWeapon(loadout: Loadout): Weapon | null {
  return loadout.right ? weaponOf(loadout.right) : null;
}

/** 로드아웃에 포함된 모든 스킬. 기본 공격 + 기본스킬 후보. */
export function allSkills(loadout: Loadout): Skill[] {
  const left = leftWeapon(loadout);
  const right = rightWeapon(loadout);
  return right
    ? [left.basic, ...basicSkillsOf(left), right.basic, ...basicSkillsOf(right)]
    : [left.basic, ...basicSkillsOf(left)];
}

export function supportsFor(loadout: Loadout, skillId: string): readonly Support[] {
  return loadout.supports[skillId] ?? [];
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
  ] as const;

  return sides.map(({ hand, weapon }) => ({
    hand,
    weapon: weapon?.name ?? '없음',
    lines: weapon ? [weapon.basic, ...basicSkillsOf(weapon)].flatMap((skill) => {
      const supports = supportsFor(loadout, skill.id);
      return supports.length ? [`${skill.name}: ${supports.map((s) => s.name).join(', ')}`] : [];
    }) : [],
  }));
}

/** 어떤 스킬이 어느 손에 속하는지. HUD나 장비 설정 UI에서 쓴다. */
export function handOf(loadout: Loadout, skillId: string): '왼손' | '오른손' | null {
  const left = leftWeapon(loadout);
  if (left.basic.id === skillId || basicSkillsOf(left).some((skill) => skill.id === skillId)) return '왼손';
  const right = rightWeapon(loadout);
  if (!right) return null;
  if (right.basic.id === skillId || basicSkillsOf(right).some((skill) => skill.id === skillId)) return '오른손';
  return null;
}
