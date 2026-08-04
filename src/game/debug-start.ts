import { WEAPON_IDS, type WeaponId } from '@/data/weapons';

export interface DebugStart {
  left?: WeaponId;
  right?: WeaponId | null;
  roomIndex?: number;
  /** 마을에서 시작한다. 마을 UI와 R링을 확인하려면 첫 보스를 넘어야 해서 검증이 막혔다. */
  town?: boolean;
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
  const town = params.has('town') && params.get('town') !== '0';
  const wave = Number(params.get('wave'));
  const roomIndex = Number.isFinite(wave) && wave >= 1 && wave <= totalRooms ? wave - 1 : undefined;

  return {
    left: parseWeapon(params.get('left')),
    right: parseRightWeapon(params.get('right')),
    roomIndex: town ? undefined : roomIndex,
    town,
  };
}
