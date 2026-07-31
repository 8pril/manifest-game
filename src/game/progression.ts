import { WEAPON_IDS, weaponOf, type WeaponId } from '@/data/weapons';

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

export function unlockWeapons(progress: PlayerProgress, weapons: readonly WeaponId[]): PlayerProgress {
  const unlocked = new Set(progress.unlockedWeapons);
  for (const weapon of weapons) unlocked.add(weapon);

  return {
    ...progress,
    unlockedWeapons: WEAPON_IDS.filter((weapon) => unlocked.has(weapon)),
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

export function configureManifestation(
  progress: PlayerProgress,
  weapon: WeaponId,
  patch: Partial<ManifestationConfig>,
): PlayerProgress {
  if (!hasWeapon(progress, weapon)) return progress;

  return {
    ...progress,
    configs: {
      ...progress.configs,
      [weapon]: {
        ...progress.configs[weapon],
        ...patch,
      },
    },
  };
}
