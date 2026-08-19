import { WEAPON_IDS, basicSkillsOf, weaponOf, type WeaponId } from '@/data/weapons';
import { findSupport } from '@/data/supports';
import { canAttach, supportSlotType, type Skill, type Support } from '@/engine/support';
import { createEmptyLayout, reconcileLayout, autoSortLayout, swapCells } from '@/game/inventory';

/**
 * 플레이어 진행 상태.
 *
 * 기존 Loadout은 "이번 전투에서 양손에 무엇을 들었는가"만 표현한다.
 * 새 기획에는 그보다 바깥의 상태가 필요하다: 어떤 무기를 해금했는지, R키 링 메뉴에
 * 어떤 후보를 넣었는지, 무기별 강화기술과 보조형스킬 슬롯이 어떻게 세팅됐는지.
 */

export type Hand = 'left' | 'right';
export type WheelSlot = WeaponId | null;
export interface WheelSlotRef {
  hand: Hand;
  index: 0 | 1;
}

export interface WeaponWheel {
  left: readonly [WheelSlot, WheelSlot];
  right: readonly [WheelSlot, WheelSlot];
}

/**
 * 무기 하나의 설정. 소켓 세 칸이다.
 *
 * 기획서(`UI구성.pptx`)의 행 구성이 `무기 ─ 기본스킬 ─ 보조 ─ 연계`다.
 *
 * **기본스킬은 기본 공격의 형태를 바꾼다.** 비워 두면 무기 본래의 기본 공격이
 * 나가고, 끼우면 그 스킬이 곧 기본 공격이 된다(검에 `멸검`을 끼우면 베기 대신
 * 멸검이 나간다). 예전에는 이것이 콤보 조건으로 잠깐 전환되는 구조였는데,
 * 조건을 아무리 손봐도 "언제 나가는지" 를 화면으로 설명하기 어려웠다.
 * 끼웠는지 아닌지로 갈리면 설명할 것이 없다.
 */
export interface ManifestationConfig {
  /** 기본스킬. 비어 있으면 무기 본래의 기본 공격을 쓴다. */
  basicSkillId: string | null;
  /** 보조. */
  primarySupportId: string | null;
  /** 연계. */
  synergySupportId: string | null;
}

export type ManifestationConfigs = Readonly<Record<WeaponId, ManifestationConfig>>;

export interface PlayerProgress {
  unlockedWeapons: readonly WeaponId[];
  /**
   * 마을 인벤토리의 칸 배치. 칸 번호 → 항목 id, 빈 칸은 null.
   *
   * 기획서가 드래그앤드롭으로 위치를 바꿀 수 있게 요구하므로, 보유 목록만으로는
   * 순서가 정해지지 않는다. 배치를 따로 들고 저장해야 다음 판에도 남는다.
   */
  inventory: readonly (string | null)[];
  /**
   * 보유한 기본스킬 id.
   *
   * **무기에 딸려 오지 않는다.** 무기와 별개로 바닥에서 주워야 하고, 주운 뒤에도
   * 마을에서 첫 소켓에 직접 끼워야 쓴다. 한때 무기에서 자동으로 끌어냈는데,
   * 그러면 "줍는다"는 행위가 화면에만 있고 상태에는 없어 드랍 연출이 거짓말이 된다.
   */
  ownedBasicSkills: readonly string[];
  ownedSupports: readonly string[];
  /** 보유한 열쇠 id. 봉인된 문을 여는 데 쓰고 소모되지 않는다. */
  ownedKeys: readonly string[];
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
    inventory: createEmptyLayout(),
    ownedBasicSkills: [],
    ownedSupports: [],
    ownedKeys: [],
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
        basicSkillId: null,
        primarySupportId: null,
        synergySupportId: null,
      },
    ]),
  ) as ManifestationConfigs;
}

export function hasWeapon(progress: PlayerProgress, weapon: WeaponId): boolean {
  return progress.unlockedWeapons.includes(weapon);
}

export function hasSupport(progress: PlayerProgress, supportId: string): boolean {
  return progress.ownedSupports.includes(supportId);
}

export function unlockWeapons(progress: PlayerProgress, weapons: readonly WeaponId[]): PlayerProgress {
  const unlocked = new Set(progress.unlockedWeapons);
  for (const weapon of weapons) unlocked.add(weapon);

  // 얻으면 인벤토리에 들어간다. 호출하는 쪽이 따로 챙기게 하면 빠뜨리는 경로가 생긴다.
  return syncInventory({
    ...progress,
    unlockedWeapons: WEAPON_IDS.filter((weapon) => unlocked.has(weapon)),
  });
}

/** 콤보를 읽는 연계. `?combo=`로 어느 것을 물릴지 고른다. */
export const COMBO_SUPPORT_IDS = ['linked-momentum', 'combo-release'] as const;
export type ComboSupportId = (typeof COMBO_SUPPORT_IDS)[number];

/**
 * 개발용: 모든 무기에 콤보 계열 연계를 물려 콤보 빌드 상태를 만든다.
 *
 * 콤보는 이 보조를 붙였을 때만 켜지는데, 그 보조는 첫 보스 보상이고 장착은 마을에서만
 * 된다. 콤보가 걸린 상태를 보려면 매번 첫 방과 첫 보스를 지나야 해서 검증과 플레이
 * 테스트가 막힌다. `?combo=1`이 이 함수를 쓴다.
 *
 * 콤보 계열이 셋이고 조건이 각자 달라서 어느 것을 물릴지 고를 수 있어야 한다.
 */
export function grantComboSupport(
  progress: PlayerProgress,
  supportId: ComboSupportId = 'linked-momentum',
): PlayerProgress {
  let next = unlockSupports(progress, [supportId]);
  for (const weapon of next.unlockedWeapons) {
    next = configureManifestation(next, weapon, { synergySupportId: supportId });
  }
  return next;
}

/**
 * 인벤토리 배치를 보유 목록에 맞춘다.
 *
 * 보상을 얻거나 저장을 불러온 뒤에 부른다. 새로 얻은 것은 빈 칸에 들어가고
 * 더 이상 없는 것은 빠진다.
 */
export function syncInventory(progress: PlayerProgress): PlayerProgress {
  return { ...progress, inventory: reconcileLayout(progress, progress.inventory) };
}

/** 드래그앤드롭으로 두 칸을 맞바꾼다. */
export function moveInventoryItem(progress: PlayerProgress, from: number, to: number): PlayerProgress {
  return { ...progress, inventory: swapCells(progress.inventory, from, to) };
}

/** 하단 `자동정렬` 버튼. */
export function sortInventory(progress: PlayerProgress): PlayerProgress {
  return { ...progress, inventory: autoSortLayout(progress) };
}

export function hasBasicSkill(progress: PlayerProgress, skillId: string): boolean {
  return progress.ownedBasicSkills.includes(skillId);
}

/** 바닥에서 주운 기본스킬을 보유 목록에 넣는다. */
export function unlockBasicSkills(progress: PlayerProgress, skillIds: readonly string[]): PlayerProgress {
  return syncInventory({
    ...progress,
    ownedBasicSkills: orderedIds(progress.ownedBasicSkills, skillIds),
  });
}

/** 바닥에서 주운 열쇠를 보유 목록에 넣는다. */
export function unlockKeys(progress: PlayerProgress, keyIds: readonly string[]): PlayerProgress {
  return syncInventory({ ...progress, ownedKeys: orderedIds(progress.ownedKeys, keyIds) });
}

/** 봉인된 문을 열 수 있는지. 필요한 열쇠를 전부 갖고 있어야 한다. */
export function hasAllKeys(progress: PlayerProgress, required: readonly string[]): boolean {
  return required.every((id) => progress.ownedKeys.includes(id));
}

export function unlockSupports(progress: PlayerProgress, supportIds: readonly string[]): PlayerProgress {
  return syncInventory({
    ...progress,
    ownedSupports: orderedIds(progress.ownedSupports, supportIds),
  });
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
  if (weapon && wheelHasWeaponElsewhere(progress, { hand, index }, weapon)) return progress;

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

function wheelHasWeaponElsewhere(progress: PlayerProgress, target: WheelSlotRef, weapon: WeaponId): boolean {
  for (const hand of ['left', 'right'] as const) {
    for (const index of [0, 1] as const) {
      if (hand === target.hand && index === target.index) continue;
      if (progress.wheel[hand][index] === weapon) return true;
    }
  }
  return false;
}

export function swapWheelSlots(progress: PlayerProgress, a: WheelSlotRef, b: WheelSlotRef): PlayerProgress {
  if (a.hand === b.hand && a.index === b.index) return progress;

  const left: [WheelSlot, WheelSlot] = [...progress.wheel.left];
  const right: [WheelSlot, WheelSlot] = [...progress.wheel.right];
  const slots = { left, right };
  const from = slots[a.hand][a.index];
  slots[a.hand][a.index] = slots[b.hand][b.index];
  slots[b.hand][b.index] = from;

  return {
    ...progress,
    wheel: {
      left,
      right,
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
  const merged = reconcileManifestationConfig(progress, weapon, {
    ...progress.configs[weapon],
    ...accepted,
  });
  let configs: ManifestationConfigs = {
    ...progress.configs,
    [weapon]: merged,
  };

  configs = clearEquippedSupportElsewhere(
    configs,
    weapon,
    'primary',
    patch.primarySupportId !== undefined ? merged.primarySupportId : undefined,
  );
  configs = clearEquippedSupportElsewhere(
    configs,
    weapon,
    'synergy',
    patch.synergySupportId !== undefined ? merged.synergySupportId : undefined,
  );

  return {
    ...progress,
    configs,
  };
}

/**
 * 저장 복원용. 보유 상태·현재 기본스킬과 맞지 않는 설정을 화면에 남기지 않는다.
 * 같은 보조가 여러 무기에 중복된 옛 저장은 무기 목록에서 먼저 나온 한 곳만 유지한다.
 */
export function reconcileManifestationConfigs(progress: PlayerProgress): PlayerProgress {
  const usedSupportIds = new Set<string>();
  let configs = progress.configs;

  for (const weapon of WEAPON_IDS) {
    const config = reconcileManifestationConfig({ ...progress, configs }, weapon, configs[weapon], usedSupportIds);
    if (config !== configs[weapon]) configs = { ...configs, [weapon]: config };
  }

  return configs === progress.configs ? progress : { ...progress, configs };
}

function reconcileManifestationConfig(
  progress: PlayerProgress,
  weapon: WeaponId,
  config: ManifestationConfig,
  usedSupportIds: Set<string> = new Set(),
): ManifestationConfig {
  if (!hasWeapon(progress, weapon)) {
    return config.basicSkillId === null && config.primarySupportId === null && config.synergySupportId === null
      ? config
      : { basicSkillId: null, primarySupportId: null, synergySupportId: null };
  }

  const basicSkillId = config.basicSkillId !== null
    && canEquipBasicSkill(weapon, config.basicSkillId)
    && hasBasicSkill(progress, config.basicSkillId)
    ? config.basicSkillId
    : null;
  const progressWithSkill: PlayerProgress = {
    ...progress,
    configs: {
      ...progress.configs,
      [weapon]: { ...config, basicSkillId },
    },
  };
  const skill = equippedBasicSkill(progressWithSkill, weapon);
  const attached: Support[] = [];

  const accept = (id: string | null, slot: 'primary' | 'synergy'): string | null => {
    if (!id || usedSupportIds.has(id) || !canUseSupportInSlot(progress, id, slot)) return null;
    const support = findSupport(id);
    if (!support || !canAttach(skill, support, attached).ok) return null;
    attached.push(support);
    usedSupportIds.add(id);
    return id;
  };

  const primarySupportId = accept(config.primarySupportId, 'primary');
  const synergySupportId = accept(config.synergySupportId, 'synergy');
  if (
    basicSkillId === config.basicSkillId
    && primarySupportId === config.primarySupportId
    && synergySupportId === config.synergySupportId
  ) return config;

  return { basicSkillId, primarySupportId, synergySupportId };
}

function clearEquippedSupportElsewhere(
  configs: ManifestationConfigs,
  targetWeapon: WeaponId,
  targetSlot: 'primary' | 'synergy',
  supportId: string | null | undefined,
): ManifestationConfigs {
  if (!supportId) return configs;
  const targetKey = targetSlot === 'primary' ? 'primarySupportId' : 'synergySupportId';
  let next = configs;

  for (const weapon of WEAPON_IDS) {
    for (const slot of ['primary', 'synergy'] as const) {
      if (weapon === targetWeapon && slot === targetSlot) continue;
      const key = slot === 'primary' ? 'primarySupportId' : 'synergySupportId';
      if (next[weapon][key] !== supportId) continue;
      if (next === configs) next = { ...configs };
      next = {
        ...next,
        [weapon]: {
          ...next[weapon],
          [key]: null,
        },
      };
    }
  }

  // 같은 보조가 같은 무기의 반대 슬롯에 남아 있던 옛 저장도 정리한다.
  const oppositeKey = targetKey === 'primarySupportId' ? 'synergySupportId' : 'primarySupportId';
  if (next[targetWeapon][oppositeKey] === supportId) {
    next = {
      ...next,
      [targetWeapon]: {
        ...next[targetWeapon],
        [oppositeKey]: null,
      },
    };
  }

  return next;
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

/**
 * 이 무기의 첫 소켓에 끼울 수 있는 기본스킬.
 *
 * **무기가 자기 것만 받는다.** 검의 소켓에는 찌르기나 멸검, 활에는 산탄이나
 * 일제 사격이 들어간다.
 */
export function basicSkillOptions(weapon: WeaponId): readonly string[] {
  return basicSkillsOf(weapon).map((skill) => skill.id);
}

export function canEquipBasicSkill(weapon: WeaponId, skillId: string): boolean {
  return basicSkillOptions(weapon).includes(skillId);
}

/**
 * 이 무기가 실제로 쓸 기본 공격. 소켓이 비어 있으면 무기 본래의 것이다.
 *
 * **보유 여부까지 본다.** 설정만 남고 아이템은 없는 상태(저장을 지웠거나 옛 저장)에서
 * 소켓이 켜져 있으면, 줍지 않은 스킬이 공짜로 나가게 된다.
 */
export function equippedBasicSkill(progress: PlayerProgress, weapon: WeaponId): Skill {
  const id = progress.configs[weapon].basicSkillId;
  const source = weaponOf(weapon);
  const usable = id !== null && canEquipBasicSkill(weapon, id) && hasBasicSkill(progress, id);
  return usable ? basicSkillsOf(source).find((skill) => skill.id === id) ?? source.basic : source.basic;
}

function sanitizeManifestationPatch(
  progress: PlayerProgress,
  weapon: WeaponId,
  patch: Partial<ManifestationConfig>,
): Partial<ManifestationConfig> {
  const accepted: Partial<ManifestationConfig> = {};
  const current = progress.configs[weapon];

  if (patch.basicSkillId !== undefined) {
    const ok =
      patch.basicSkillId === null
      || (canEquipBasicSkill(weapon, patch.basicSkillId) && hasBasicSkill(progress, patch.basicSkillId));
    accepted.basicSkillId = ok ? patch.basicSkillId : current.basicSkillId;
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

function orderedIds(existing: readonly string[], added: readonly string[]): readonly string[] {
  return [...new Set([...existing, ...added])];
}
