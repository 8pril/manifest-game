import { WEAPON_IDS, type WeaponId } from '@/data/weapons';
import { COMBO_SUPPORT_IDS, type ComboSupportId } from '@/game/progression';

export interface DebugStart {
  left?: WeaponId;
  right?: WeaponId | null;
  roomIndex?: number;
  /** 마을에서 시작한다. 마을 UI와 R링을 확인하려면 첫 보스를 넘어야 해서 검증이 막혔다. */
  town?: boolean;
  /**
   * 콤보 계열 연계를 미리 장착한 채 시작한다.
   *
   * 콤보는 이제 기본 규칙이 아니라 연계를 붙였을 때만 켜진다. 그런데 그 보조는
   * 첫 보스 보상이고 장착은 마을에서만 되므로, 콤보가 걸린 상태를 보려면 매번
   * 첫 방과 첫 보스를 지나야 한다. 콤보 유무를 비교하는 데 그 비용이 너무 크다.
   *
   * 콤보 계열이 셋이고 조건이 각자 달라서 어느 것을 볼지 고를 수 있어야 한다.
   * `?combo=1`은 기본값인 `연결 가속`이다.
   */
  combo?: ComboSupportId | null;
  /**
   * 보조형스킬을 미리 보유한 채 시작한다. `?supports=chain,wound-seeker`.
   *
   * 보조는 최종 보스 보상뿐이라, 인벤토리에 보조와 연계가 함께 있는 상태를 보려면
   * 판을 끝까지 깨고 다음 판으로 넘어가야 한다. 마을 UI 검증이 그 비용에 계속 막혔다.
   * id 검증은 하지 않는다. 없는 id는 `unlockSupports` 뒤 보유 목록에 남아도
   * `findSupport`에서 걸러진다.
   */
  supports?: readonly string[];
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

/** `?combo=1`은 기본값, `?combo=combo-release`처럼 id를 직접 줄 수도 있다. */
function parseCombo(value: string | null): ComboSupportId | null {
  if (value === null || value === '0') return null;
  const found = COMBO_SUPPORT_IDS.find((id) => id === value);
  return found ?? 'linked-momentum';
}

function parseSupports(value: string | null): readonly string[] | undefined {
  if (!value) return undefined;
  const ids = value.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
  return ids.length ? ids : undefined;
}

export function parseDebugStart(search: string, totalRooms: number): DebugStart {
  return parseDebugStartWithMode(search, totalRooms, true);
}

export function parseDebugStartWithMode(search: string, totalRooms: number, enabled: boolean): DebugStart {
  if (!enabled) return { town: false, combo: null };

  const params = new URLSearchParams(search);
  const town = params.has('town') && params.get('town') !== '0';
  const wave = Number(params.get('wave'));
  const roomIndex = Number.isFinite(wave) && wave >= 1 && wave <= totalRooms ? wave - 1 : undefined;

  return {
    left: parseWeapon(params.get('left')),
    right: parseRightWeapon(params.get('right')),
    roomIndex: town ? undefined : roomIndex,
    town,
    combo: parseCombo(params.get('combo')),
    supports: parseSupports(params.get('supports')),
  };
}
