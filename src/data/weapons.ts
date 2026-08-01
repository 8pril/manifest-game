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
  /** 근접 휘두르기 연출 길이(ms). 무기 성격을 동작으로 드러낸다. */
  swingDuration: number;
  /** 지대형 콤보스킬처럼 기본 쿨다운으로 반복하면 중첩 피해가 튀는 스킬의 별도 간격(ms). */
  comboInterval: number;
}

/** 스킬이 어떻게 전달되는지를 태그에서 유도한다. */
export function deliveryOf(skill: Skill): Delivery {
  if (skill.tags.includes('지대')) return 'area';
  if (skill.tags.includes('투사체')) return 'projectile';
  return 'melee';
}

/**
 * 각성 상태에서 콤보스킬이 기본 공격을 대체할 때의 공격 간격.
 *
 * 투사체형 콤보스킬은 남아서 틱 피해를 중첩시키지 않으므로 무기 기본 쿨다운을 쓴다.
 * 지대형 콤보스킬은 지속시간 동안 여러 장이 겹치면 피해가 발동 주기에 반비례해 뛰므로
 * 별도 comboInterval을 유지한다.
 */
export function awakenedAttackInterval(weapon: Weapon): number {
  return deliveryOf(weapon.combo) === 'area' ? weapon.comboInterval : weapon.cooldown;
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
    comboInterval: 900,
    // 검은 짧고 빠르게 벤다.
    swingDuration: 110,
    basic: {
      id: 'sword-slash',
      name: '베기',
      tags: ['공격', '근접', '물리', '중첩'],
      base: { damage: 46, meleeRange: 120, meleeArc: 1.7, knockback: 18, comboGain: 1, ...COMBO_STATS },
      supportSlots: 2,
    },
    // 원안의 '멸검': n타마다 주변 적들에게 광역 장판
    combo: {
      id: 'annihilation',
      name: '멸검',
      tags: ['공격', '지대', '물리', '지속시간'],
      base: { damage: 38, areaRadius: 115, duration: 1.8, tickInterval: 0.3 },
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
    comboInterval: 1000,
    swingDuration: 0,
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
      base: { damage: 51, projectileCount: 5, projectileSpeed: 520 },
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
    comboInterval: 1100,
    swingDuration: 0,
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
      base: { damage: 54, projectileCount: 6, projectileSpeed: 560 },
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
    comboInterval: 1200,
    // 방패는 느리고 넓게 밀어낸다. 넉백이 검의 6배 이상이다.
    swingDuration: 240,
    basic: {
      id: 'shield-bash',
      name: '밀치기',
      tags: ['공격', '근접', '물리'],
      base: { damage: 24, meleeRange: 104, meleeArc: 2.4, knockback: 115, comboGain: 1, ...COMBO_STATS },
      supportSlots: 2,
    },
    combo: {
      id: 'fracture-wave',
      name: '균열 파동',
      tags: ['공격', '지대', '물리', '지속시간'],
      // 넉백을 준 이유: 방패의 제어는 균열(10% 확률)이 아니라 넉백에서 나온다.
      // 벽까지 밀린 적은 확률 판정을 건너뛰고 확정으로 기절한다. 그런데 각성하면
      // 밀치기가 나가지 않아 그 제어가 통째로 사라지고, 방패가 검과 같은
      // "바닥에 장판 까는 무기"가 됐다.
      //
      // 값은 밀치기(115)보다 작게 잡는다. 그대로 쓰면 자기가 깐 지대 밖으로
      // 적을 다 밀어내 스스로 딜을 깎는다. 사냥개 속도가 96이라 62만큼 밀리면
      // 0.65초면 돌아오는데, 지대가 1.2초마다 다시 깔리므로 지대 안에 남는다.
      //
      // 측정: 62에서 넉백은 확실히 걸리지만(각성 중 밀려남 13~21회/판)
      // 벽 충돌은 각성 중에 거의 나지 않는다. 넉백을 400으로 올려 확인해 보니
      // 벽 충돌이 나므로 경로는 정상이고, 값이 낮아 벽까지 닿지 않을 뿐이다.
      // 벽 충돌을 흔하게 만들려면 값을 올려야 하지만 그만큼 지대 피해를 잃는다.
      base: { damage: 22, areaRadius: 150, duration: 2.4, tickInterval: 0.4, knockback: 62 },
      supportSlots: 2,
    },
  },
};

export const WEAPON_IDS: readonly WeaponId[] = ['sword', 'bow', 'arcane', 'shield'];

export const WEAPON_LIST: readonly Weapon[] = WEAPON_IDS.map((id) => WEAPONS[id]);

export function weaponOf(id: WeaponId): Weapon {
  return WEAPONS[id];
}
