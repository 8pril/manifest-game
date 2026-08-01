import { describe, it, expect } from 'vitest';
import { canAttach, resolveSkill, sortBehaviors, supportSlotType, type Skill, type Support } from '@/engine/support';

const arrowShot: Skill = {
  id: 'arrow-shot',
  name: '화살 사격',
  tags: ['공격', '투사체', '물리'],
  base: { damage: 100, projectileCount: 1, projectileSpeed: 400 },
  supportSlots: 2,
};

const swordSlash: Skill = {
  id: 'sword-slash',
  name: '베기',
  tags: ['공격', '근접', '물리'],
  base: { damage: 120 },
  supportSlots: 2,
};

const multipleProjectiles: Support = {
  id: 'multiple-projectiles',
  name: '다중투사체',
  tags: ['투사체'],
  requires: ['투사체'],
  modifiers: [
    { stat: 'projectileCount', mode: 'flat', value: 2 },
    { stat: 'damage', mode: 'reduce', value: 0.2 },
  ],
  description: '투사체 수 +2, 투사체 피해 20% 감소',
};

const pierce: Support = {
  id: 'pierce',
  name: '관통',
  tags: ['투사체'],
  requires: ['투사체'],
  modifiers: [],
  behaviors: [{ kind: 'pierce', count: 2 }],
  description: '투사체가 관통함. 관통 횟수 2회',
};

const opulence: Support = {
  id: 'opulence',
  name: '부귀',
  tags: ['공격'],
  requires: ['공격'],
  modifiers: [{ stat: 'damage', mode: 'increase', value: 0.25 }],
  description: '보조 대상 스킬의 피해 25% 증가',
};

describe('canAttach - 태그 기반 장착 제약', () => {
  it('요구 태그를 가진 스킬에는 장착할 수 있다', () => {
    expect(canAttach(arrowShot, multipleProjectiles).ok).toBe(true);
  });

  it('요구 태그가 없는 스킬에는 장착할 수 없다', () => {
    const result = canAttach(swordSlash, multipleProjectiles);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('투사체');
  });

  it('근접 스킬에도 공격 태그만 요구하는 보조는 붙는다', () => {
    expect(canAttach(swordSlash, opulence).ok).toBe(true);
  });

  it('같은 보조능력을 두 번 장착할 수 없다', () => {
    const result = canAttach(arrowShot, pierce, [pierce]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('이미 장착');
  });

  it('슬롯 수를 넘으면 장착할 수 없다', () => {
    const result = canAttach(arrowShot, opulence, [multipleProjectiles, pierce]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('슬롯');
  });
});

describe('supportSlotType', () => {
  it('slotType을 생략한 기존 보조능력은 보조1형으로 취급한다', () => {
    expect(supportSlotType(multipleProjectiles)).toBe('primary');
  });

  it('명시된 시너지 보조능력은 보조2형으로 취급한다', () => {
    expect(supportSlotType({ ...opulence, slotType: 'synergy' })).toBe('synergy');
  });
});

describe('resolveSkill', () => {
  it('장착된 보조능력의 수정자를 모두 반영한다', () => {
    const resolved = resolveSkill(arrowShot, [multipleProjectiles, opulence]);
    expect(resolved.stats.projectileCount).toBe(3);
    // 100 * 1.25 / 1.2
    expect(resolved.stats.damage).toBeCloseTo(104.17, 2);
    expect(resolved.rejected).toHaveLength(0);
  });

  it('장착 불가능한 보조능력은 조용히 무시하지 않고 사유와 함께 돌려준다', () => {
    const resolved = resolveSkill(swordSlash, [multipleProjectiles]);
    expect(resolved.supports).toHaveLength(0);
    expect(resolved.rejected).toHaveLength(1);
    expect(resolved.rejected[0].support.id).toBe('multiple-projectiles');
  });

  it('슬롯을 넘긴 보조능력은 제외된다', () => {
    const third: Support = { ...opulence, id: 'third', name: '세 번째' };
    const resolved = resolveSkill(arrowShot, [multipleProjectiles, pierce, third]);
    expect(resolved.supports).toHaveLength(2);
    expect(resolved.rejected).toHaveLength(1);
  });

  it('거동을 수집한다', () => {
    const resolved = resolveSkill(arrowShot, [pierce]);
    expect(resolved.behaviors).toEqual([{ kind: 'pierce', count: 2 }]);
  });
});

describe('sortBehaviors - 원안의 관통>연쇄>갈래>튕겨쏘기 우선순위', () => {
  it('우선순위대로 정렬한다', () => {
    const sorted = sortBehaviors([
      { kind: 'ricochet', count: 1 },
      { kind: 'fork', count: 3 },
      { kind: 'chain', count: 2, sameTargetLimit: 2, damageFalloff: 0.2 },
      { kind: 'pierce', count: 2 },
    ]);
    expect(sorted.map((b) => b.kind)).toEqual(['pierce', 'chain', 'fork', 'ricochet']);
  });

  it('우선순위 목록에 없는 거동은 뒤로 보낸다', () => {
    const sorted = sortBehaviors([
      { kind: 'convert', to: '화염', ratio: 0.4 },
      { kind: 'pierce', count: 1 },
    ]);
    expect(sorted[0].kind).toBe('pierce');
  });
});
