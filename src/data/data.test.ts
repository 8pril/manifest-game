import { describe, it, expect } from 'vitest';
import { SUPPORTS } from '@/data/supports';
import { SKILLS, ARROW_SHOT, ANNIHILATION } from '@/data/skills';
import { canAttach, resolveSkill } from '@/engine/support';
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

describe('스킬별 장착 가능 보조능력', () => {
  it('화살 사격에는 투사체 보조능력이 붙는다', () => {
    const attachable = SUPPORTS.filter((s) => canAttach(ARROW_SHOT, s).ok);
    expect(attachable.map((s) => s.name)).toContain('다중투사체');
    expect(attachable.map((s) => s.name)).toContain('관통');
  });

  it('화살 사격에는 지대 보조능력이 붙지 않는다', () => {
    const earthquake = SUPPORTS.find((s) => s.id === 'earthquake')!;
    expect(canAttach(ARROW_SHOT, earthquake).ok).toBe(false);
  });

  it('멸검에는 지대 보조능력이 붙는다', () => {
    const earthquake = SUPPORTS.find((s) => s.id === 'earthquake')!;
    expect(canAttach(ANNIHILATION, earthquake).ok).toBe(true);
  });

  it('멸검에는 투사체 보조능력이 붙지 않는다', () => {
    const pierce = SUPPORTS.find((s) => s.id === 'pierce')!;
    expect(canAttach(ANNIHILATION, pierce).ok).toBe(false);
  });
});

describe('실제 조합 결과', () => {
  it("'다중투사체' + '관통'을 붙인 화살 사격", () => {
    const combo = SUPPORTS.filter((s) => ['multiple-projectiles', 'pierce'].includes(s.id));
    const resolved = resolveSkill(ARROW_SHOT, combo);

    expect(resolved.stats.projectileCount).toBe(3);
    expect(resolved.stats.damage).toBeCloseTo(100 / 1.4, 10);
    expect(resolved.behaviors).toContainEqual({ kind: 'pierce', count: 2 });
    expect(resolved.rejected).toHaveLength(0);
  });

  it("'지진'을 붙인 멸검은 틱이 빨라지고 범위가 넓어진다", () => {
    const earthquake = SUPPORTS.filter((s) => s.id === 'earthquake');
    const resolved = resolveSkill(ANNIHILATION, earthquake);

    // 원안 메모의 0.5 -> 0.34
    expect(resolved.stats.tickInterval).toBeCloseTo(0.333, 3);
    expect(resolved.stats.areaRadius).toBe(180);
    expect(resolved.stats.damage).toBeCloseTo(24 / 1.2, 10);
  });

  it('슬롯 2개를 넘는 조합은 세 번째가 거부된다', () => {
    const three = SUPPORTS.filter((s) =>
      ['multiple-projectiles', 'pierce', 'chain'].includes(s.id),
    );
    const resolved = resolveSkill(ARROW_SHOT, three);
    expect(resolved.supports).toHaveLength(2);
    expect(resolved.rejected).toHaveLength(1);
  });
});
