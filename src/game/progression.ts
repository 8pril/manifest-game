import { WEAPON_IDS, weaponOf, type WeaponId } from '@/data/weapons';
import { findSupport } from '@/data/supports';
import { supportSlotType, type Support } from '@/engine/support';

/**
 * 플레이어 진행 상태.
 *
 * 기존 Loadout은 "이번 전투에서 양손에 무엇을 들었는가"만 표현한다.
 * 새 기획에는 그보다 바깥의 상태가 필요하다: 어떤 무기를 해금했는지, R키 링 메뉴에
 * 어떤 후보를 넣었는지, 무기별 콤보스킬과 보조형스킬 슬롯이 어떻게 세팅됐는지.
 */

export type Hand = 'left' | 'right';
export type WheelSlot = WeaponId | null;

export interface WeaponWheel {
  left: readonly [WheelSlot, WheelSlot];
  right: readonly [WheelSlot, WheelSlot];
}

export interface ManifestationConfig {
  /** 콤보 상태에서 기본 공격을 대체할 스킬. 우선 무기 기본 콤보스킬 id를 쓴다. */
  comboSkillId: string;
  /** 보조1형: 콤보스킬 자체 강화. */
  primarySupportId: string | null;
  /** 보조2형: 다른 무기와의 시너지. */
  synergySupportId: string | null;
}

export type ManifestationConfigs = Readonly<Record<WeaponId, ManifestationConfig>>;

export interface PlayerProgress {
  unlockedWeapons: readonly WeaponId[];
  ownedComboSkills: readonly string[];
  ownedSupports: readonly string[];
  weaponSwitchUnlocked: boolean;
  active: {
    left: WeaponId;
    right: WeaponId | null;
  };
  wheel: WeaponWheel;
  configs: ManifestationConfigs;
}

export function createInitialProgress(): PlayerProgress {
  return {
    unlockedWeapons: ['sword'],
    ownedComboSkills: [weaponOf('sword').combo.id],
    ownedSupports: [],
    weaponSwitchUnlocked: false,
    active: { left: 'sword', right: null },
    wheel: {
      left: ['sword', null],
      right: [null, null],
    },
    configs: createDefaultConfigs(),
  };
}

export function createDefaultConfigs(): ManifestationConfigs {
  return Object.fromEntries(
    WEAPON_IDS.map((id) => [
      id,
      {
        comboSkillId: weaponOf(id).combo.id,
        primarySupportId: null,
        synergySupportId: null,
      },
    ]),
  ) as ManifestationConfigs;
}

export function hasWeapon(progress: PlayerProgress, weapon: WeaponId): boolean {
  return progress.unlockedWeapons.includes(weapon);
}

export function hasComboSkill(progress: PlayerProgress, skillId: string): boolean {
  return progress.ownedComboSkills.includes(skillId);
}

export function hasSupport(progress: PlayerProgress, supportId: string): boolean {
  return progress.ownedSupports.includes(supportId);
}

export function unlockWeapons(progress: PlayerProgress, weapons: readonly WeaponId[]): PlayerProgress {
  const unlocked = new Set(progress.unlockedWeapons);
  for (const weapon of weapons) unlocked.add(weapon);

  return {
    ...progress,
    unlockedWeapons: WEAPON_IDS.filter((weapon) => unlocked.has(weapon)),
    ownedComboSkills: orderedComboSkillIds(progress.ownedComboSkills, [...unlocked].map((weapon) => weaponOf(weapon).combo.id)),
  };
}

export function unlockComboSkills(progress: PlayerProgress, skillIds: readonly string[]): PlayerProgress {
  return {
    ...progress,
    ownedComboSkills: orderedComboSkillIds(progress.ownedComboSkills, skillIds),
  };
}

export function unlockSupports(progress: PlayerProgress, supportIds: readonly string[]): PlayerProgress {
  return {
    ...progress,
    ownedSupports: orderedIds(progress.ownedSupports, supportIds),
  };
}

export function unlockWeaponSwitch(progress: PlayerProgress): PlayerProgress {
  return {
    ...progress,
    weaponSwitchUnlocked: true,
  };
}

export function setWheelSlot(
  progress: PlayerProgress,
  hand: Hand,
  index: 0 | 1,
  weapon: WheelSlot,
): PlayerProgress {
  if (weapon && !hasWeapon(progress, weapon)) return progress;

  const slots: [WheelSlot, WheelSlot] = [...progress.wheel[hand]];
  slots[index] = weapon;

  return {
    ...progress,
    wheel: {
      ...progress.wheel,
      [hand]: slots,
    },
  };
}

export function equipFromWheel(progress: PlayerProgress, hand: Hand, index: 0 | 1): PlayerProgress {
  if (!progress.weaponSwitchUnlocked) return progress;

  const weapon = progress.wheel[hand][index];
  if (!weapon || !hasWeapon(progress, weapon)) return progress;

  return {
    ...progress,
    active: {
      ...progress.active,
      [hand]: weapon,
    },
  };
}

export function equipFirstWheelSlots(progress: PlayerProgress): PlayerProgress {
  if (!progress.weaponSwitchUnlocked) return progress;
  const left = firstAvailableWheelSlot(progress, 'left') ?? progress.active.left;
  const right = firstAvailableWheelSlot(progress, 'right');

  return {
    ...progress,
    active: { left, right },
  };
}

export function configureManifestation(
  progress: PlayerProgress,
  weapon: WeaponId,
  patch: Partial<ManifestationConfig>,
): PlayerProgress {
  if (!hasWeapon(progress, weapon)) return progress;
  const accepted = sanitizeManifestationPatch(progress, weapon, patch);

  return {
    ...progress,
    configs: {
      ...progress.configs,
      [weapon]: {
        ...progress.configs[weapon],
        ...accepted,
      },
    },
  };
}

export function configuredSupports(progress: PlayerProgress, weapon: WeaponId): readonly Support[] {
  const config = progress.configs[weapon];
  return [
    { id: config.primarySupportId, slot: 'primary' },
    { id: config.synergySupportId, slot: 'synergy' },
  ].flatMap(({ id, slot }) => {
    if (!id) return [];
    if (!hasSupport(progress, id)) return [];
    const support = findSupport(id);
    return support && supportSlotType(support) === slot ? [support] : [];
  });
}

function sanitizeManifestationPatch(
  progress: PlayerProgress,
  weapon: WeaponId,
  patch: Partial<ManifestationConfig>,
): Partial<ManifestationConfig> {
  const accepted: Partial<ManifestationConfig> = {};
  const current = progress.configs[weapon];

  if (patch.comboSkillId !== undefined && hasComboSkill(progress, patch.comboSkillId)) {
    accepted.comboSkillId = patch.comboSkillId;
  }
  if (patch.primarySupportId !== undefined) {
    accepted.primarySupportId = patch.primarySupportId === null || canUseSupportInSlot(progress, patch.primarySupportId, 'primary')
      ? patch.primarySupportId
      : current.primarySupportId;
  }
  if (patch.synergySupportId !== undefined) {
    accepted.synergySupportId = patch.synergySupportId === null || canUseSupportInSlot(progress, patch.synergySupportId, 'synergy')
      ? patch.synergySupportId
      : current.synergySupportId;
  }

  return accepted;
}

function canUseSupportInSlot(progress: PlayerProgress, supportId: string, slot: 'primary' | 'synergy'): boolean {
  if (!hasSupport(progress, supportId)) return false;
  const support = findSupport(supportId);
  return support !== undefined && supportSlotType(support) === slot;
}

function firstAvailableWheelSlot(progress: PlayerProgress, hand: Hand): WeaponId | null {
  return progress.wheel[hand].find((weapon): weapon is WeaponId => Boolean(weapon && hasWeapon(progress, weapon))) ?? null;
}

function orderedComboSkillIds(existing: readonly string[], added: readonly string[]): readonly string[] {
  const ids = orderedIds(existing, added);
  const comboOrder = WEAPON_IDS.map((weapon) => weaponOf(weapon).combo.id);
  return [
    ...comboOrder.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !comboOrder.includes(id)),
  ];
}

function orderedIds(existing: readonly string[], added: readonly string[]): readonly string[] {
  return [...new Set([...existing, ...added])];
}
