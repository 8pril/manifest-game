import { WEAPON_IDS, type WeaponId } from '@/data/weapons';
import { reconcileLayout } from '@/game/inventory';
import { createInitialProgress, type ManifestationConfig, type PlayerProgress, type WheelSlot } from '@/game/progression';

export const PROGRESS_STORAGE_KEY = 'nan2026.progress.v1';
export const RUN_CHECKPOINT_STORAGE_KEY = 'nan2026.run-checkpoint.v2';

interface ProgressSnapshot {
  version: 1;
  progress: PlayerProgress;
}

export interface RunCheckpoint {
  phase: 'combat' | 'town' | 'won' | 'lost';
  roomIndex: number;
  hp: number;
  maxHp: number;
  shieldEnergy: number;
  potionCharge: number;
  progress: PlayerProgress;
  roomStartProgress: PlayerProgress;
  roomStartKills: number;
  clearedRooms: readonly number[];
  kills: number;
  gained?: {
    weapons?: readonly WeaponId[];
    basicSkills?: readonly string[];
    supports?: readonly string[];
    keys?: readonly string[];
  };
  elapsed: number;
}

interface RunCheckpointSnapshot {
  version: 2;
  checkpoint: RunCheckpoint;
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
  store?.removeItem(RUN_CHECKPOINT_STORAGE_KEY);
}

export function serializeRunCheckpoint(checkpoint: RunCheckpoint): string {
  return JSON.stringify({ version: 2, checkpoint } satisfies RunCheckpointSnapshot);
}

export function parseRunCheckpoint(value: string | null): RunCheckpoint | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || parsed.version !== 2 || !isRecord(parsed.checkpoint)) return null;
    return sanitizeRunCheckpoint(parsed.checkpoint);
  } catch {
    return null;
  }
}

export function loadRunCheckpoint(store: ProgressStore | undefined = browserStorage()): RunCheckpoint | null {
  if (!store) return null;
  return parseRunCheckpoint(store.getItem(RUN_CHECKPOINT_STORAGE_KEY));
}

export function saveRunCheckpoint(checkpoint: RunCheckpoint, store: ProgressStore | undefined = browserStorage()): void {
  if (!store) return;
  store.setItem(RUN_CHECKPOINT_STORAGE_KEY, serializeRunCheckpoint(checkpoint));
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

  const parsed: PlayerProgress = {
    unlockedWeapons,
    inventory: Array.isArray(raw.inventory)
      ? raw.inventory.map((id) => (typeof id === 'string' ? id : null))
      : fallback.inventory,
    ownedBasicSkills: stringIds(raw.ownedBasicSkills, fallback.ownedBasicSkills),
    ownedSupports: stringIds(raw.ownedSupports, fallback.ownedSupports),
    ownedKeys: stringIds(raw.ownedKeys, fallback.ownedKeys),
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

  // **저장된 배치를 그대로 쓰면 안 된다.**
  // `inventory` 필드가 없던 시절의 저장에는 배치가 통째로 비어 있어서, 활·방패를
  // 보유하고 있어도 인벤토리 격자가 텅 빈 채로 보인다. 손상된 배치도 마찬가지다.
  // 보유 목록에 맞춰 정리해야 새로 얻은 것이 빈 칸에 들어가고 없는 것이 빠진다.
  return { ...parsed, inventory: reconcileLayout(parsed, parsed.inventory) };
}

function sanitizeRunCheckpoint(raw: Record<string, unknown>): RunCheckpoint {
  const progress = sanitizeProgress(isRecord(raw.progress) ? raw.progress : {});
  const roomStartProgress = isRecord(raw.roomStartProgress) ? sanitizeProgress(raw.roomStartProgress) : progress;
  const maxHp = positiveNumber(raw.maxHp, 100);

  return {
    phase: runPhase(raw.phase),
    roomIndex: nonNegativeInteger(raw.roomIndex, 0),
    hp: clampNumber(raw.hp, 0, maxHp, maxHp),
    maxHp,
    shieldEnergy: clampNumber(raw.shieldEnergy, 0, 45, 45),
    potionCharge: clampNumber(raw.potionCharge, 0, 70, 70),
    progress,
    roomStartProgress,
    roomStartKills: nonNegativeInteger(raw.roomStartKills, 0),
    clearedRooms: integerList(raw.clearedRooms),
    kills: nonNegativeInteger(raw.kills, 0),
    gained: roomReward(raw.gained),
    elapsed: Math.max(0, numberOr(raw.elapsed, 0)),
  };
}

function runPhase(value: unknown): RunCheckpoint['phase'] {
  return value === 'town' || value === 'won' || value === 'lost' ? value : 'combat';
}

function roomReward(value: unknown): RunCheckpoint['gained'] {
  if (!isRecord(value)) return undefined;
  return {
    weapons: weaponIds(value.weapons),
    basicSkills: stringIds(value.basicSkills, []),
    supports: stringIds(value.supports, []),
    keys: stringIds(value.keys, []),
  };
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return Math.max(0, Math.floor(numberOr(value, fallback)));
}

function integerList(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => nonNegativeInteger(entry, 0)))];
}

function positiveNumber(value: unknown, fallback: number): number {
  const n = numberOr(value, fallback);
  return n > 0 ? n : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, numberOr(value, fallback)));
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function configFor(raw: unknown, fallback: ManifestationConfig): ManifestationConfig {
  if (!isRecord(raw)) return fallback;
  return {
    basicSkillId: nullableString(raw.basicSkillId),
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
