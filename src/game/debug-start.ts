import { WEAPON_IDS, type WeaponId } from '@/data/weapons';

export interface DebugStart {
  left?: WeaponId;
  right?: WeaponId | null;
  roomIndex?: number;
  /** 마을에서 시작한다. 마을 UI와 R링을 확인하려면 첫 보스를 넘어야 해서 검증이 막혔다. */
  town?: boolean;
  /**
   * `콤보 개방`을 미리 장착한 채 시작한다.
   *
   * 콤보는 이제 기본 규칙이 아니라 보조2형을 붙였을 때만 켜진다. 그런데 그 보조는
   * 첫 보스 보상이고 장착은 마을에서만 되므로, 콤보가 걸린 상태를 보려면 매번
   * 두 방을 클리어해야 한다. 콤보 유무를 비교하는 데 그 비용이 너무 크다.
   */
  combo?: boolean;
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
    combo: params.has('combo') && params.get('combo') !== '0',
  };
}
