import { WEAPON_IDS, weaponOf, type WeaponId } from '@/data/weapons';
import { findSupport } from '@/data/supports';
import { supportSlotType, type Support } from '@/engine/support';

/**
 * 플레이어 진행 상태.
 *
 * 기존 Loadout은 "이번 전투에서 양손에 무엇을 들었는가"만 표현한다.
 * 새 기획에는 그보다 바깥의 상태가 필요하다: 어떤 무기를 해금했는지, R키 링 메뉴에
 * 어떤 후보를 넣었는지, 무기별 강화기술과 보조형스킬 슬롯이 어떻게 세팅됐는지.
 */

export type Hand = 'left' | 'right';
export type WheelSlot = WeaponId | null;

export interface WeaponWheel {
  left: readonly [WheelSlot, WheelSlot];
  right: readonly [WheelSlot, WheelSlot];
}

export interface ManifestationConfig {
  /** 콤보 상태에서 기본 공격을 대체할 강화기술. 내부 id는 기존 comboSkillId를 유지한다. */
  comboSkillId: string;
  /** 보조. */
  primarySupportId: string | null;
  /** 연계. */
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
    ownedComboSkills: [],
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
  };
}

export function unlockComboSkills(progress: PlayerProgress, skillIds: readonly string[]): PlayerProgress {
  return {
    ...progress,
    ownedComboSkills: orderedComboSkillIds(progress.ownedComboSkills, skillIds),
  };
}

/** 콤보를 읽는 연계. `?combo=`로 어느 것을 물릴지 고른다. */
export const COMBO_SUPPORT_IDS = ['combo-imprint', 'linked-momentum', 'combo-release'] as const;
export type ComboSupportId = (typeof COMBO_SUPPORT_IDS)[number];

/**
 * 개발용: 모든 무기에 콤보 계열 연계를 물려 콤보 빌드 상태를 만든다.
 *
 * 콤보는 이 보조를 붙였을 때만 켜지는데, 그 보조는 첫 보스 보상이고 장착은 마을에서만
 * 된다. 콤보가 걸린 상태를 보려면 매번 두 방을 클리어해야 해서 검증과 플레이 테스트가
 * 막힌다. `?combo=1`이 이 함수를 쓴다.
 *
 * 콤보 계열이 셋이고 조건이 각자 달라서 어느 것을 물릴지 고를 수 있어야 한다.
 */
export function grantComboSupport(
  progress: PlayerProgress,
  supportId: ComboSupportId = 'combo-imprint',
): PlayerProgress {
  // 보조만 물리면 콤보 조건이 성립해도 발동하지 않는다. 강화기술을 보유하지 않으면
  // `hasComboSkill`에서 막히기 때문이다. 실제로 이걸 빠뜨려 검증에서 발동이 0회로
  // 나왔고, 규칙이 잘못된 것으로 오진할 뻔했다. 쓸 수 있는 상태까지 만들어 준다.
  let next = unlockComboSkills(
    unlockSupports(progress, [supportId]),
    progress.unlockedWeapons.map((id) => weaponOf(id).combo.id),
  );
  for (const weapon of next.unlockedWeapons) {
    next = configureManifestation(next, weapon, { synergySupportId: supportId });
  }
  return next;
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
