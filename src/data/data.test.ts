import { describe, it, expect } from 'vitest';
import { SUPPORTS } from '@/data/supports';
import { SKILLS, findSkill } from '@/data/skills';
import { WEAPON_LIST, awakenedAttackInterval, deliveryOf } from '@/data/weapons';
import { canAttach, resolveSkill, supportSlotType } from '@/engine/support';
import { TAGS } from '@/engine/tags';

/**
 * 데이터 무결성 검사.
 *
 * 보조능력은 계속 늘어나므로, 오타나 잘못된 태그가 런타임에야 드러나면
 * 조합 QA 비용이 그만큼 커진다. 데이터가 추가될 때마다 여기서 먼저 걸린다.
 */

describe('보조능력 데이터 무결성', () => {
  it('id가 중복되지 않는다', () => {
    const ids = SUPPORTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('이름이 중복되지 않는다', () => {
    const names = SUPPORTS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('모든 태그가 정의된 태그 목록 안에 있다', () => {
    for (const support of SUPPORTS) {
      for (const tag of [...support.tags, ...support.requires]) {
        expect(TAGS).toContain(tag);
      }
    }
  });

  it('모든 보조능력은 요구 태그를 최소 하나 갖는다', () => {
    // 요구 태그가 없으면 아무 스킬에나 붙어버려 태그 시스템이 무력해진다.
    for (const support of SUPPORTS) {
      expect(support.requires.length).toBeGreaterThan(0);
    }
  });

  it('모든 보조능력은 수정자나 거동 중 최소 하나를 갖는다', () => {
    for (const support of SUPPORTS) {
      const hasEffect = support.modifiers.length > 0 || (support.behaviors?.length ?? 0) > 0;
      expect(hasEffect, `${support.name}에 효과가 없습니다`).toBe(true);
    }
  });

  it('모든 보조능력에 설명이 있다', () => {
    for (const support of SUPPORTS) {
      expect(support.description.length).toBeGreaterThan(0);
    }
  });

  it('모든 보조능력은 최소 하나의 스킬에 장착 가능하다', () => {
    // 어떤 스킬에도 못 붙는 보조능력은 게임에 등장할 수 없는 죽은 데이터다.
    for (const support of SUPPORTS) {
      const attachable = SKILLS.some((skill) => canAttach(skill, support).ok);
      expect(attachable, `${support.name}을 붙일 수 있는 스킬이 없습니다`).toBe(true);
    }
  });

  it('보조와 연계가 데이터에서 구분된다', () => {
    const primary = SUPPORTS.filter((support) => supportSlotType(support) === 'primary');
    const synergy = SUPPORTS.filter((support) => supportSlotType(support) === 'synergy');

    expect(primary.length).toBeGreaterThan(0);
    expect(synergy.map((support) => support.id)).toEqual([
      // 콤보 계열 3종. 조건과 효과가 각자 다르다.
      'combo-imprint',
      'linked-momentum',
      'combo-release',
      // 상태이상 시너지 3종.
      'wound-seeker',
      'wound-resonance',
      'fracture-resonance',
    ]);
  });

  it('연계는 조건부 거동을 갖는다', () => {
    // 연계는 수치를 그냥 올려주는 것이 아니라 **조건이 붙은** 효과여야 한다.
    // 상태이상 대상일 때(statusDamage)이거나 연속 명중했을 때(combo)다.
    // 콤보를 기본 규칙에서 빼면서 `콤보 개방`이 여기 들어왔고, 그래서 조건이
    // 상태이상 하나로 고정되지 않는다.
    const synergy = SUPPORTS.filter((support) => supportSlotType(support) === 'synergy');
    const conditional = ['statusDamage', 'combo'];

    for (const support of synergy) {
      const ok = support.behaviors?.some((behavior) => conditional.includes(behavior.kind));
      expect(ok, `${support.id}에 조건부 거동이 없습니다`).toBe(true);
    }
  });

  it('비율 수정자의 값이 상식적인 범위 안에 있다', () => {
    for (const support of SUPPORTS) {
      for (const mod of support.modifiers) {
        if (mod.mode === 'flat') continue;
        expect(mod.value, `${support.name}의 ${mod.stat}`).toBeGreaterThan(0);
        expect(mod.value, `${support.name}의 ${mod.stat}`).toBeLessThanOrEqual(2);
      }
    }
  });
});

const ARROW_SHOT_ = findSkill('arrow-shot')!;
const ANNIHILATION_ = findSkill('annihilation')!;

describe('스킬별 장착 가능 보조능력', () => {
  it('화살 사격에는 투사체 보조능력이 붙는다', () => {
    const attachable = SUPPORTS.filter((s) => canAttach(ARROW_SHOT_, s).ok);
    expect(attachable.map((s) => s.name)).toContain('다중투사체');
    expect(attachable.map((s) => s.name)).toContain('관통');
  });

  it('화살 사격에는 지대 보조능력이 붙지 않는다', () => {
    const earthquake = SUPPORTS.find((s) => s.id === 'earthquake')!;
    expect(canAttach(ARROW_SHOT_, earthquake).ok).toBe(false);
  });

  it('멸검에는 지대 보조능력이 붙는다', () => {
    const earthquake = SUPPORTS.find((s) => s.id === 'earthquake')!;
    expect(canAttach(ANNIHILATION_, earthquake).ok).toBe(true);
  });

  it('멸검에는 투사체 보조능력이 붙지 않는다', () => {
    const pierce = SUPPORTS.find((s) => s.id === 'pierce')!;
    expect(canAttach(ANNIHILATION_, pierce).ok).toBe(false);
  });
});

describe('실제 조합 결과', () => {
  it("'다중투사체' + '관통'을 붙인 화살 사격", () => {
    const combo = SUPPORTS.filter((s) => ['multiple-projectiles', 'pierce'].includes(s.id));
    const resolved = resolveSkill(ARROW_SHOT_, combo);

    // 기본값은 밸런스에 따라 바뀌므로 스킬에서 읽어 비율로 검증한다.
    expect(resolved.stats.projectileCount).toBe((ARROW_SHOT_.base.projectileCount ?? 1) + 2);
    expect(resolved.stats.damage).toBeCloseTo((ARROW_SHOT_.base.damage ?? 0) / 1.2, 10);
    expect(resolved.behaviors).toContainEqual({ kind: 'pierce', count: 2 });
    expect(resolved.rejected).toHaveLength(0);
  });

  it("'지진'을 붙인 멸검은 틱이 빨라지고 범위가 넓어진다", () => {
    const earthquake = SUPPORTS.filter((s) => s.id === 'earthquake');
    const resolved = resolveSkill(ANNIHILATION_, earthquake);

    // 지진: 틱 간격 50% 가속, 효과 범위 100% 증가, 피해 20% 감소
    expect(resolved.stats.tickInterval).toBeCloseTo((ANNIHILATION_.base.tickInterval ?? 0) / 1.5, 10);
    expect(resolved.stats.areaRadius).toBe((ANNIHILATION_.base.areaRadius ?? 0) * 2);
    expect(resolved.stats.damage).toBeCloseTo((ANNIHILATION_.base.damage ?? 0) / 1.2, 10);
  });

  it('슬롯 수를 넘는 조합은 초과분이 거부된다', () => {
    // 슬롯 수는 밸런스에 따라 바뀌므로 스킬에서 읽는다.
    const attachable = SUPPORTS.filter((s) => canAttach(ARROW_SHOT_, s).ok);
    const overflow = attachable.slice(0, ARROW_SHOT_.supportSlots + 1);
    expect(overflow.length).toBeGreaterThan(ARROW_SHOT_.supportSlots);

    const resolved = resolveSkill(ARROW_SHOT_, overflow);
    expect(resolved.supports).toHaveLength(ARROW_SHOT_.supportSlots);
    expect(resolved.rejected).toHaveLength(1);
  });
});

describe('무기 데이터 무결성', () => {
  it('무기 4종이 모두 정의되어 있다', () => {
    expect(WEAPON_LIST).toHaveLength(4);
  });

  it('무기마다 상태이상이 서로 다르다', () => {
    const statuses = WEAPON_LIST.map((w) => w.status);
    expect(new Set(statuses).size).toBe(statuses.length);
  });

  it('스킬 id가 중복되지 않는다', () => {
    const ids = SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('전달 방식이 태그에서 올바르게 유도된다', () => {
    expect(deliveryOf(findSkill('sword-slash')!)).toBe('melee');
    expect(deliveryOf(findSkill('shield-bash')!)).toBe('melee');
    expect(deliveryOf(findSkill('arrow-shot')!)).toBe('projectile');
    expect(deliveryOf(findSkill('arcane-bolt')!)).toBe('projectile');
    expect(deliveryOf(findSkill('annihilation')!)).toBe('area');
    expect(deliveryOf(findSkill('fracture-wave')!)).toBe('area');
  });

  it('근접 스킬은 사거리와 부채꼴 각도를 갖는다', () => {
    for (const weapon of WEAPON_LIST) {
      if (deliveryOf(weapon.basic) !== 'melee') continue;
      expect(weapon.basic.base.meleeRange, weapon.name).toBeGreaterThan(0);
      expect(weapon.basic.base.meleeArc, weapon.name).toBeGreaterThan(0);
    }
  });

  it('기본 공격은 모두 콤보를 쌓을 수 있다', () => {
    for (const weapon of WEAPON_LIST) {
      expect(weapon.basic.base.comboGain, weapon.name).toBeGreaterThan(0);
    }
  });

  it('무기마다 보조능력 후보가 하나 이상 있다', () => {
    for (const weapon of WEAPON_LIST) {
      const basic = SUPPORTS.filter((s) => canAttach(weapon.basic, s).ok);
      const combo = SUPPORTS.filter((s) => canAttach(weapon.combo, s).ok);
      expect(basic.length, `${weapon.name} 기본 공격`).toBeGreaterThan(0);
      expect(combo.length, `${weapon.name} 발동 스킬`).toBeGreaterThan(0);
    }
  });

  it('슬롯은 원안대로 스킬당 2개다', () => {
    for (const skill of SKILLS) {
      expect(skill.supportSlots, skill.name).toBe(2);
    }
  });

  it('각성 대체 발동에서 지대형은 별도 간격을 유지한다', () => {
    const sword = WEAPON_LIST.find((weapon) => weapon.id === 'sword')!;
    const shield = WEAPON_LIST.find((weapon) => weapon.id === 'shield')!;

    expect(deliveryOf(sword.combo)).toBe('area');
    expect(deliveryOf(shield.combo)).toBe('area');
    expect(awakenedAttackInterval(sword)).toBe(sword.comboInterval);
    expect(awakenedAttackInterval(shield)).toBe(shield.comboInterval);
    expect(awakenedAttackInterval(sword)).toBeGreaterThan(sword.cooldown);
    expect(awakenedAttackInterval(shield)).toBeGreaterThan(shield.cooldown);
  });

  it('각성 대체 발동에서 투사체형은 기본 무기 쿨다운을 쓴다', () => {
    const bow = WEAPON_LIST.find((weapon) => weapon.id === 'bow')!;
    const arcane = WEAPON_LIST.find((weapon) => weapon.id === 'arcane')!;

    expect(deliveryOf(bow.combo)).toBe('projectile');
    expect(deliveryOf(arcane.combo)).toBe('projectile');
    expect(awakenedAttackInterval(bow)).toBe(bow.cooldown);
    expect(awakenedAttackInterval(arcane)).toBe(arcane.cooldown);
  });
});
