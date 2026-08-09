import type { WeaponId } from '@/data/weapons';

/**
 * 열쇠.
 *
 * 봉인된 문을 여는 소모되지 않는 아이템이다. 보스가 하나씩 떨어뜨리고, 전부 모아야
 * 문이 열린다. 인벤토리 칸에 그대로 보이므로 **지금 몇 개를 모았는지**가 화면에서
 * 확인된다 — 문 앞에서 무엇이 부족한지 알 수 없으면 길을 잃는다.
 */
export interface KeyItem {
  id: string;
  name: string;
  /** 어느 길에서 나오는지. 안내 문구와 색에 쓴다. */
  from: string;
  color: number;
}

export const KEYS: readonly KeyItem[] = [
  { id: 'key-upper', name: '윗길 열쇠', from: '윗길 제단', color: 0x9ae6a0 },
  { id: 'key-lower', name: '아랫길 열쇠', from: '아랫길 굴', color: 0xffc55c },
];

export function findKey(id: string): KeyItem | undefined {
  return KEYS.find((key) => key.id === id);
}

/** 봉인된 문을 여는 데 필요한 열쇠 전부. */
export const SEAL_KEYS: readonly string[] = KEYS.map((key) => key.id);

/** 아직 못 모은 열쇠. 문 앞 안내에 쓴다. */
export function missingKeys(owned: readonly string[]): readonly KeyItem[] {
  return KEYS.filter((key) => !owned.includes(key.id));
}

/** 열쇠는 무기와 무관하다. 타입을 맞추려고 두는 것이 아니라 문서화를 위해 남긴다. */
export type KeyOwner = WeaponId | null;
