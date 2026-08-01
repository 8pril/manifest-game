/**
 * 태그 시스템.
 *
 * 원안(`01. 기획초안.xlsx` - 무기별 스킬부여 시트)의 태그 체계를 그대로 쓴다.
 * 보조능력은 자신이 요구하는 태그를 가진 스킬에만 장착할 수 있으며,
 * 이 제약이 잘못된 조합을 애초에 만들어지지 않게 막는다.
 * 조합 QA 표면적을 줄이는 핵심 장치다.
 */

export const TAGS = [
  // 행동 계열
  '공격',
  '근접',
  '파괴',
  '지대',
  '투사체',
  '소환',
  '주문',
  '보호막',
  '소환수',
  '강화',
  '방어',

  // 피해 속성
  '물리',
  '원소',
  '화염',
  '냉기',
  '번개',
  '카오스',

  // 동작 특성
  '지속시간',
  '중첩',
  '시너지',
  '상처',
  '균열',
] as const;

export type Tag = (typeof TAGS)[number];

/** 태그를 가진 모든 대상의 공통 형태. */
export interface Tagged {
  tags: readonly Tag[];
}

export function hasTag(target: Tagged, tag: Tag): boolean {
  return target.tags.includes(tag);
}

/** required의 태그를 target이 하나라도 가지고 있는지. */
export function hasAnyTag(target: Tagged, required: readonly Tag[]): boolean {
  return required.some((tag) => target.tags.includes(tag));
}

/** required의 태그를 target이 모두 가지고 있는지. */
export function hasAllTags(target: Tagged, required: readonly Tag[]): boolean {
  return required.every((tag) => target.tags.includes(tag));
}
