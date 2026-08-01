import { WEAPON_IDS, type WeaponId } from '@/data/weapons';
import { createInitialProgress, type ManifestationConfig, type PlayerProgress, type WheelSlot } from '@/game/progression';

export const PROGRESS_STORAGE_KEY = 'nan2026.progress.v1';

interface ProgressSnapshot {
  version: 1;
  progress: PlayerProgress;
}

export interface ProgressStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function serializeProgress(progress: PlayerProgress): string {
  return JSON.stringify({ version: 1, progress } satisfies ProgressSnapshot);
}

export function parseProgress(value: string | null): PlayerProgress | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.progress)) return null;
    return sanitizeProgress(parsed.progress);
  } catch {
    return null;
  }
}

export function loadProgress(store: ProgressStore | undefined = browserStorage()): PlayerProgress | null {
  if (!store) return null;
  return parseProgress(store.getItem(PROGRESS_STORAGE_KEY));
}

export function saveProgress(progress: PlayerProgress, store: ProgressStore | undefined = browserStorage()): void {
  if (!store) return;
  store.setItem(PROGRESS_STORAGE_KEY, serializeProgress(progress));
}

export function clearSavedProgress(store: ProgressStore | undefined = browserStorage()): void {
  store?.removeItem(PROGRESS_STORAGE_KEY);
}

function sanitizeProgress(raw: Record<string, unknown>): PlayerProgress {
  const fallback = createInitialProgress();
  const unlockedWeapons = weaponIds(raw.unlockedWeapons);
  if (!unlockedWeapons.includes('sword')) unlockedWeapons.unshift('sword');

  const activeRaw = isRecord(raw.active) ? raw.active : {};
  const left = weaponId(activeRaw.left) ?? fallback.active.left;
  const right = weaponId(activeRaw.right);
  const active = {
    left: unlockedWeapons.includes(left) ? left : fallback.active.left,
    right: right && unlockedWeapons.includes(right) ? right : null,
  };

  return {
    unlockedWeapons,
    ownedComboSkills: stringIds(raw.ownedComboSkills, fallback.ownedComboSkills),
    ownedSupports: stringIds(raw.ownedSupports, fallback.ownedSupports),
    weaponSwitchUnlocked: raw.weaponSwitchUnlocked === true,
    active,
    wheel: {
      left: wheelSlots(isRecord(raw.wheel) ? raw.wheel.left : undefined, fallback.wheel.left, unlockedWeapons),
      right: wheelSlots(isRecord(raw.wheel) ? raw.wheel.right : undefined, fallback.wheel.right, unlockedWeapons),
    },
    configs: Object.fromEntries(
      WEAPON_IDS.map((weapon) => [
        weapon,
        configFor(isRecord(raw.configs) ? raw.configs[weapon] : undefined, fallback.configs[weapon]),
      ]),
    ) as PlayerProgress['configs'],
  };
}

function configFor(raw: unknown, fallback: ManifestationConfig): ManifestationConfig {
  if (!isRecord(raw)) return fallback;
  return {
    comboSkillId: typeof raw.comboSkillId === 'string' ? raw.comboSkillId : fallback.comboSkillId,
    primarySupportId: nullableString(raw.primarySupportId),
    synergySupportId: nullableString(raw.synergySupportId),
  };
}

function weaponIds(value: unknown): WeaponId[] {
  const ids = Array.isArray(value) ? value.flatMap((item) => {
    const id = weaponId(item);
    return id ? [id] : [];
  }) : [];
  return WEAPON_IDS.filter((id) => ids.includes(id));
}

function weaponId(value: unknown): WeaponId | null {
  return typeof value === 'string' && WEAPON_IDS.includes(value as WeaponId) ? value as WeaponId : null;
}

function wheelSlots(value: unknown, fallback: readonly [WheelSlot, WheelSlot], unlocked: readonly WeaponId[]): [WheelSlot, WheelSlot] {
  if (!Array.isArray(value)) return [...fallback];
  return [slot(value[0], fallback[0], unlocked), slot(value[1], fallback[1], unlocked)];
}

function slot(value: unknown, fallback: WheelSlot, unlocked: readonly WeaponId[]): WheelSlot {
  if (value === null) return null;
  const id = weaponId(value);
  return id && unlocked.includes(id) ? id : fallback;
}

function stringIds(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function browserStorage(): ProgressStore | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
