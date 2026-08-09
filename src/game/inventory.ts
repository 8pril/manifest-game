import { WEAPON_IDS, weaponOf, type WeaponId } from '@/data/weapons';
import { SUPPORTS, findSupport } from '@/data/supports';
import { KEYS, findKey } from '@/data/keys';
import { supportSlotType } from '@/engine/support';
import type { PlayerProgress } from '@/game/progression';

/**
 * 마을 인벤토리.
 *
 * 기획서(`UI구성.pptx`)의 요구는 이렇다.
 *
 * - 보유한 실체화 무기와 보조형스킬이 n×n 격자에 놓인다
 * - 드래그앤드롭으로 **칸 위치를 바꿀 수 있다**
 * - 버리거나 파괴할 수 없다
 * - 하단 버튼을 누르면 자동정렬된다
 * - 필터 3종: 전체 / 무기만 / 보조형스킬만
 *
 * 위치를 바꿀 수 있다는 것이 이 모듈이 필요한 이유다. 보유 목록만으로는 순서가
 * 정해지지 않으므로 **배치를 따로 들고 저장**해야 한다.
 */

/** 격자 한 변. 기획서는 7×7로 그려져 있고 "알맞는 크기로 재조정 가능"이라고 적혀 있다. */
export const INVENTORY_COLUMNS = 7;
export const INVENTORY_ROWS = 7;
export const INVENTORY_SIZE = INVENTORY_COLUMNS * INVENTORY_ROWS;

export type InventoryFilter = 'all' | 'weapon' | 'skill' | 'support' | 'key';

export type InventoryItem =
  | { kind: 'weapon'; id: WeaponId; name: string; color: number }
  /**
   * 기본스킬. 무기의 첫 소켓에 끼우면 기본 공격의 형태가 이것으로 바뀐다.
   *
   * `weapon`을 함께 들고 다니는 이유는 소켓이 자기 무기 것만 받기 때문이다.
   * 활에서 멸검이 나가면 그림도 소리도 맞지 않는다.
   */
  | { kind: 'skill'; id: string; weapon: WeaponId; name: string; color: number; description: string }
  | { kind: 'support'; id: string; name: string; slot: 'primary' | 'synergy'; description: string }
  /** 열쇠. 어디에도 장착하지 않고 보유 자체가 문을 여는 조건이다. */
  | { kind: 'key'; id: string; name: string; color: number; description: string };

/** 칸 하나. 비어 있으면 null. */
export type InventoryCell = InventoryItem | null;
export interface FilteredInventoryCell {
  item: InventoryItem | null;
  matchesFilter: boolean;
}

/** 저장되는 배치. 칸 번호 → 항목 id. 빈 칸은 문자열이 아니라 null이다. */
export type InventoryLayout = readonly (string | null)[];

export function createEmptyLayout(): InventoryLayout {
  return Array.from({ length: INVENTORY_SIZE }, () => null);
}

function weaponItem(id: WeaponId): InventoryItem {
  const weapon = weaponOf(id);
  return { kind: 'weapon', id, name: weapon.name, color: weapon.color };
}

export function basicSkillItem(id: WeaponId): InventoryItem {
  const weapon = weaponOf(id);
  return {
    kind: 'skill',
    id: weapon.basicSkill.id,
    weapon: id,
    name: weapon.basicSkill.name,
    color: weapon.color,
    description: `${weapon.basic.name} 대신 ${weapon.basicSkill.name}을 쓴다`,
  };
}

function keyItem(id: string): InventoryItem | null {
  const key = findKey(id);
  if (!key) return null;
  return { kind: 'key', id, name: key.name, color: key.color, description: `${key.from}에서 얻었다` };
}

function supportItem(id: string): InventoryItem | null {
  const support = findSupport(id);
  if (!support) return null;
  return {
    kind: 'support',
    id,
    name: support.name,
    slot: supportSlotType(support),
    description: support.description,
  };
}

/** 지금 보유한 것 전부. 정렬 기준이 되는 표준 순서다. */
export function ownedItems(progress: PlayerProgress): InventoryItem[] {
  const owned = WEAPON_IDS.filter((id) => progress.unlockedWeapons.includes(id));
  // **기본스킬은 무기와 별개로 보유한다.** 무기를 들고 있어도 그 스킬을 아직
  // 안 주웠으면 인벤토리에 없다. 소켓에 끼우는 아이템이므로 줍는 행위가
  // 상태로 남아야 한다.
  const skills = WEAPON_IDS
    .filter((id) => progress.ownedBasicSkills.includes(weaponOf(id).basicSkill.id))
    .map(basicSkillItem);
  const supports = SUPPORTS.filter((s) => progress.ownedSupports.includes(s.id))
    .map((s) => supportItem(s.id))
    .filter((item): item is InventoryItem => item !== null);
  const keys = KEYS.filter((k) => progress.ownedKeys.includes(k.id))
    .map((k) => keyItem(k.id))
    .filter((item): item is InventoryItem => item !== null);
  return [...owned.map(weaponItem), ...skills, ...supports, ...keys];
}

/**
 * 저장된 배치를 지금 보유 목록에 맞춰 정리한다.
 *
 * 새로 얻은 것은 빈 칸에 채우고, 더 이상 없는 것은 지운다. 저장된 배치를 그대로
 * 믿으면 보상으로 얻은 항목이 인벤토리에 나타나지 않는다.
 */
export function reconcileLayout(progress: PlayerProgress, saved: InventoryLayout): InventoryLayout {
  const owned = ownedItems(progress);
  const ownedIds = new Set(owned.map((item) => item.id));
  const next: (string | null)[] = Array.from({ length: INVENTORY_SIZE }, (_, i) => {
    const id = saved[i] ?? null;
    return id !== null && ownedIds.has(id) ? id : null;
  });

  // 중복 제거. 저장이 손상됐을 때 같은 것이 두 칸에 보이면 드래그가 꼬인다.
  const seen = new Set<string>();
  for (let i = 0; i < next.length; i++) {
    const id = next[i];
    if (id === null) continue;
    if (seen.has(id)) next[i] = null;
    else seen.add(id);
  }

  for (const item of owned) {
    if (seen.has(item.id)) continue;
    const empty = next.indexOf(null);
    if (empty === -1) break;
    next[empty] = item.id;
    seen.add(item.id);
  }
  return next;
}

/** 표준 순서로 앞에서부터 채운다. 하단 `자동정렬` 버튼이 이걸 쓴다. */
export function autoSortLayout(progress: PlayerProgress): InventoryLayout {
  const owned = ownedItems(progress);
  return Array.from({ length: INVENTORY_SIZE }, (_, i) => owned[i]?.id ?? null);
}

/** 두 칸의 내용을 맞바꾼다. 드래그앤드롭으로 위치를 바꾸는 경로다. */
export function swapCells(layout: InventoryLayout, from: number, to: number): InventoryLayout {
  if (from === to || from < 0 || to < 0 || from >= layout.length || to >= layout.length) return layout;
  const next = [...layout];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** 배치를 실제 항목으로 바꾼다. 필터에 걸리지 않는 것도 자리는 유지한다. */
export function cellsOf(
  progress: PlayerProgress,
  layout: InventoryLayout,
  filter: InventoryFilter = 'all',
): FilteredInventoryCell[] {
  const byId = new Map(ownedItems(progress).map((item) => [item.id, item]));
  return layout.map((id) => {
    if (id === null) return { item: null, matchesFilter: true };
    const item = byId.get(id);
    if (!item) return { item: null, matchesFilter: true };
    return { item, matchesFilter: filter === 'all' || item.kind === filter };
  });
}
