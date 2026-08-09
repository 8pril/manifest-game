import type { Skill, Support } from '@/engine/support';
import { resolveSkill, canAttach, supportSlotType, type ResolvedSkill } from '@/engine/support';
import { weaponOf, type Weapon, type WeaponId } from '@/data/weapons';
import { configuredSupports, type PlayerProgress } from '@/game/progression';

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

  for (const weaponId of progress.unlockedWeapons) {
    const weapon = weaponOf(weaponId);
    const configured = configuredSupports(progress, weaponId);

    // 이 무기가 강화기술을 쓰는가. `콤보 개방`을 붙였을 때만 전환이 일어난다.
    const usesCombo = configured.some((s) => s.behaviors?.some((b) => b.kind === 'combo'));

    for (const support of configured) {
      // **연계는 기본 공격에 먼저 붙인다.** 조건과 시너지를 다루는 쪽이라
      // 평소 쓰는 공격에 걸려야 의미가 있고, `콤보 개방`은 기본 공격에 붙어야
      // 기본 → 강화기술 전환을 열 수 있다. 태그가 안 맞으면 강화기술로 넘긴다
      // (예: `상처 공명`은 `지대`를 요구하는데 기본 공격에는 지대가 없다).
      //
      // **보조는 실제로 발동하는 공격에 붙인다.** 콤보를 쓰는 빌드면 강화기술,
      // 아니면 기본 공격이다. 발동하지도 않을 스킬에 붙이면 칸이 통째로 죽는다.
      const order =
        supportSlotType(support) === 'synergy'
          ? [weapon.basic, weapon.combo]
          : usesCombo
            ? [weapon.combo, weapon.basic]
            : [weapon.basic, weapon.combo];

      for (const skill of order) {
        const accepted = supports[skill.id] ?? [];
        if (canAttach(skill, support, accepted).ok) {
          supports[skill.id] = [...accepted, support];
          break;
        }
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

/** 로드아웃에 포함된 모든 스킬. 기본 공격 2개 + 발동 스킬 2개. */
export function allSkills(loadout: Loadout): Skill[] {
  const left = leftWeapon(loadout);
  const right = rightWeapon(loadout);
  return right ? [left.basic, left.combo, right.basic, right.combo] : [left.basic, left.combo];
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
    lines: weapon ? [weapon.basic, weapon.combo].flatMap((skill) => {
      const supports = supportsFor(loadout, skill.id);
      return supports.length ? [`${skill.name}: ${supports.map((s) => s.name).join(', ')}`] : [];
    }) : [],
  }));
}

/** 어떤 스킬이 어느 손에 속하는지. HUD나 장비 설정 UI에서 쓴다. */
export function handOf(loadout: Loadout, skillId: string): '왼손' | '오른손' | null {
  const left = leftWeapon(loadout);
  if (left.basic.id === skillId || left.combo.id === skillId) return '왼손';
  const right = rightWeapon(loadout);
  if (!right) return null;
  if (right.basic.id === skillId || right.combo.id === skillId) return '오른손';
  return null;
}
