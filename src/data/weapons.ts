import type { Skill } from '@/engine/support';
import type { StatusKind } from '@/engine/status';
import { COMBO_BASE_DURATION } from '@/game/combo';

/**
 * 무기 4종.
 *
 * 원안 `02. 전투시스템 초안.xlsx`의 01_실체화무기 시트에서 검·활·비전·방패를
 * 골랐다. 근접 / 투사체 / 유도 주문 / 제어로 아키타입이 겹치지 않아
 * 엔진이 특정 무기에 맞춰 만들어진 게 아니라는 것을 보여줄 수 있다.
 *
 * 각 무기는 기본 공격과 콤보 발동 스킬을 하나씩 갖는다.
 * 스킬의 전달 방식은 태그에서 유도한다. 지대 > 투사체 > 근접 순으로 본다.
 */

export type WeaponId = 'sword' | 'bow' | 'arcane' | 'shield';
export type Delivery = 'melee' | 'projectile' | 'area';

export interface Weapon {
  id: WeaponId;
  name: string;
  concept: string;
  /** 기본 공격 명중 시 부여를 시도하는 상태이상. */
  status: StatusKind;
  basic: Skill;
  combo: Skill;
  color: number;
  /** 기본 공격 간격(ms). */
  cooldown: number;
}

/** 스킬이 어떻게 전달되는지를 태그에서 유도한다. */
export function deliveryOf(skill: Skill): Delivery {
  if (skill.tags.includes('지대')) return 'area';
  if (skill.tags.includes('투사체')) return 'projectile';
  return 'melee';
}

const COMBO_STATS = { comboDuration: COMBO_BASE_DURATION };

export const WEAPONS: Record<WeaponId, Weapon> = {
  sword: {
    id: 'sword',
    name: '검',
    concept: '근접 지속딜',
    status: 'wound',
    color: 0xc9d1e8,
    cooldown: 300,
    basic: {
      id: 'sword-slash',
      name: '베기',
      tags: ['공격', '근접', '물리', '중첩'],
      base: { damage: 46, meleeRange: 96, meleeArc: 1.7, comboGain: 1, ...COMBO_STATS },
      supportSlots: 2,
    },
    // 원안의 '멸검': n타마다 주변 적들에게 광역 장판
    combo: {
      id: 'annihilation',
      name: '멸검',
      tags: ['공격', '지대', '물리', '지속시간'],
      base: { damage: 26, areaRadius: 130, duration: 2.5, tickInterval: 0.4 },
      supportSlots: 2,
    },
  },

  bow: {
    id: 'bow',
    name: '활',
    concept: '원거리 약점 공격',
    status: 'exposed',
    color: 0x9ae6a0,
    cooldown: 320,
    basic: {
      id: 'arrow-shot',
      name: '화살 사격',
      tags: ['공격', '투사체', '물리'],
      base: { damage: 74, projectileCount: 1, projectileSpeed: 460, comboGain: 1, ...COMBO_STATS },
      supportSlots: 2,
    },
    combo: {
      id: 'volley',
      name: '연사',
      tags: ['공격', '투사체', '물리'],
      base: { damage: 58, projectileCount: 5, projectileSpeed: 520 },
      supportSlots: 2,
    },
  },

  arcane: {
    id: 'arcane',
    name: '비전',
    concept: '마법 피해',
    status: 'brand',
    color: 0xb08bff,
    cooldown: 380,
    basic: {
      id: 'arcane-bolt',
      name: '비전 탄',
      tags: ['공격', '투사체', '주문', '원소'],
      base: { damage: 88, projectileCount: 1, projectileSpeed: 380, comboGain: 1, ...COMBO_STATS },
      supportSlots: 2,
    },
    // 원안의 '비전단검': 플레이어 주변에 단검 6개를 소환해 발사
    combo: {
      id: 'arcane-daggers',
      name: '비전단검',
      tags: ['공격', '투사체', '주문'],
      base: { damage: 52, projectileCount: 6, projectileSpeed: 560 },
      supportSlots: 2,
    },
  },

  shield: {
    id: 'shield',
    name: '방패',
    concept: '방어 / 밀치기',
    status: 'fracture',
    color: 0xffc55c,
    cooldown: 420,
    basic: {
      id: 'shield-bash',
      name: '밀치기',
      tags: ['공격', '근접', '물리'],
      base: { damage: 38, meleeRange: 78, meleeArc: 2.4, comboGain: 1, ...COMBO_STATS },
      supportSlots: 2,
    },
    combo: {
      id: 'fracture-wave',
      name: '균열 파동',
      tags: ['공격', '지대', '물리', '지속시간'],
      base: { damage: 20, areaRadius: 170, duration: 3, tickInterval: 0.5 },
      supportSlots: 2,
    },
  },
};

export const WEAPON_IDS: readonly WeaponId[] = ['sword', 'bow', 'arcane', 'shield'];

export const WEAPON_LIST: readonly Weapon[] = WEAPON_IDS.map((id) => WEAPONS[id]);

export function weaponOf(id: WeaponId): Weapon {
  return WEAPONS[id];
}
