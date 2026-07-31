import { WEAPON_IDS, type WeaponId } from '@/data/weapons';

export interface DebugStart {
  left?: WeaponId;
  right?: WeaponId | null;
  roomIndex?: number;
}

const WEAPON_SET = new Set<WeaponId>(WEAPON_IDS);

function parseWeapon(value: string | null): WeaponId | undefined {
  if (!value) return undefined;
  return WEAPON_SET.has(value as WeaponId) ? (value as WeaponId) : undefined;
}

function parseRightWeapon(value: string | null): WeaponId | null | undefined {
  if (value === '' || value === 'none' || value === 'null') return null;
  return parseWeapon(value);
}

export function parseDebugStart(search: string, totalRooms: number): DebugStart {
  const params = new URLSearchParams(search);
  const wave = Number(params.get('wave'));
  const roomIndex = Number.isFinite(wave) && wave >= 1 && wave <= totalRooms ? wave - 1 : undefined;

  return {
    left: parseWeapon(params.get('left')),
    right: parseRightWeapon(params.get('right')),
    roomIndex,
  };
}
