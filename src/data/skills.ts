import type { Skill } from '@/engine/support';

/**
 * 스킬 데이터.
 *
 * M3에서는 엔진을 검증할 최소 2종만 둔다.
 * 투사체 계열 하나, 지대 계열 하나로 세 엔진이 모두 걸린다.
 * 무기 4종의 기본 공격과 콤보 발동 스킬은 M5 콘텐츠 단계에서 채운다.
 */

/** 활의 기본 공격. 투사체 보조능력이 붙는다. */
export const ARROW_SHOT: Skill = {
  id: 'arrow-shot',
  name: '화살 사격',
  tags: ['공격', '투사체', '물리'],
  base: {
    damage: 100,
    projectileCount: 1,
    projectileSpeed: 420,
  },
  supportSlots: 2,
};

/** 검의 콤보 발동 스킬. 원안의 '멸검'. 지대 보조능력이 붙는다. */
export const ANNIHILATION = {
  id: 'annihilation',
  name: '멸검',
  tags: ['공격', '지대', '물리', '지속시간'],
  base: {
    damage: 24,
    areaRadius: 90,
    duration: 2,
    tickInterval: 0.5,
  },
  supportSlots: 2,
} as const satisfies Skill;

/**
 * 검의 콤보 발동 스킬. 원안의 '꿰뚫기'.
 * 중첩 보조능력이 붙는 유일한 스킬이라, 중첩 계열 수정자의 검증 대상이다.
 *
 * 원안: "공격 명중 시 적에게 꿰뚫기 중첩 1회(무한 지속시간).
 *        최대중첩 시 폭발. 폭발 후 적에게 걸린 중첩 절반 상실.
 *        폭발 피해에 중첩 당 물리 피해 추가. 기본최대중첩 4"
 */
export const IMPALE = {
  id: 'impale',
  name: '꿰뚫기',
  tags: ['공격', '파괴', '물리', '중첩'],
  base: {
    damage: 30,
    maxStacks: 4,
  },
  supportSlots: 2,
} as const satisfies Skill;

export const SKILLS: readonly Skill[] = [ARROW_SHOT, ANNIHILATION, IMPALE];
