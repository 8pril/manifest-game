import { describe, it, expect } from 'vitest';
import {
  createLoadout,
  attachSupport,
  supportsFor,
  allSkills,
  totalSupports,
  describeByHand,
  handOf,
  resolveFor,
  leftWeapon,
  rightWeapon,
} from '@/game/loadout';
import { SUPPORTS } from '@/data/supports';

const pierce = SUPPORTS.find((s) => s.id === 'pierce')!;
const opulence = SUPPORTS.find((s) => s.id === 'opulence')!;

describe('createLoadout', () => {
  it('무기 2종과 스킬 4개를 갖는다', () => {
    const loadout = createLoadout('sword', 'bow');
    expect(leftWeapon(loadout).name).toBe('검');
    expect(rightWeapon(loadout)?.name).toBe('활');
    expect(allSkills(loadout).map((s) => s.id)).toEqual([
      'sword-slash',
      'annihilation',
      'arrow-shot',
      'volley',
    ]);
  });

  it('초기 구간처럼 오른손 무기가 없을 수 있다', () => {
    const loadout = createLoadout('sword', null);

    expect(rightWeapon(loadout)).toBeNull();
    expect(allSkills(loadout).map((s) => s.id)).toEqual(['sword-slash', 'annihilation']);
    expect(describeByHand(loadout)[1]).toEqual({ hand: '오른손', weapon: '없음', lines: [] });
  });

  it('처음에는 장착된 보조능력이 없다', () => {
    expect(totalSupports(createLoadout('sword', 'bow'))).toBe(0);
  });
});

describe('attachSupport', () => {
  it('지정한 스킬에만 붙는다', () => {
    const loadout = attachSupport(createLoadout('sword', 'bow'), 'arrow-shot', pierce);
    expect(supportsFor(loadout, 'arrow-shot')).toEqual([pierce]);
    expect(supportsFor(loadout, 'volley')).toHaveLength(0);
  });

  it('원본을 바꾸지 않는다', () => {
    const before = createLoadout('sword', 'bow');
    attachSupport(before, 'arrow-shot', pierce);
    expect(totalSupports(before)).toBe(0);
  });

  it('같은 보조능력을 다른 스킬에 각각 붙일 수 있다', () => {
    let loadout = createLoadout('sword', 'bow');
    loadout = attachSupport(loadout, 'arrow-shot', opulence);
    loadout = attachSupport(loadout, 'sword-slash', opulence);
    expect(totalSupports(loadout)).toBe(2);
  });
});

describe('resolveFor', () => {
  it('해당 스킬에 붙은 보조능력만 반영한다', () => {
    let loadout = createLoadout('sword', 'bow');
    loadout = attachSupport(loadout, 'arrow-shot', opulence);

    const bow = rightWeapon(loadout);
    if (!bow) throw new Error('오른손 무기가 필요합니다.');
    const withSupport = resolveFor(loadout, bow.basic);
    const without = resolveFor(loadout, bow.combo);

    // 부귀는 피해 25% 증가
    expect(withSupport.stats.damage).toBeCloseTo((bow.basic.base.damage ?? 0) * 1.25, 10);
    expect(without.stats.damage).toBe(bow.combo.base.damage);
  });
});

describe('describeByHand', () => {
  it('손별로 무기와 보조능력을 묶는다', () => {
    // 스킬 이름만 나열하면 어느 손을 강화한 것인지 알 수 없다.
    let loadout = createLoadout('sword', 'bow');
    loadout = attachSupport(loadout, 'arrow-shot', pierce);

    const hands = describeByHand(loadout);
    expect(hands[0]).toEqual({ hand: '왼손', weapon: '검', lines: [] });
    expect(hands[1]).toEqual({ hand: '오른손', weapon: '활', lines: ['화살 사격: 관통'] });
  });

  it('한 스킬에 여러 개가 붙으면 함께 적는다', () => {
    let loadout = createLoadout('sword', 'bow');
    loadout = attachSupport(loadout, 'arrow-shot', pierce);
    loadout = attachSupport(loadout, 'arrow-shot', opulence);
    expect(describeByHand(loadout)[1].lines).toEqual(['화살 사격: 관통, 부귀']);
  });
});

describe('handOf', () => {
  it('스킬이 어느 손에 속하는지 알려준다', () => {
    const loadout = createLoadout('sword', 'bow');
    expect(handOf(loadout, 'sword-slash')).toBe('왼손');
    expect(handOf(loadout, 'annihilation')).toBe('왼손');
    expect(handOf(loadout, 'arrow-shot')).toBe('오른손');
    expect(handOf(loadout, 'volley')).toBe('오른손');
    expect(handOf(loadout, 'arcane-bolt')).toBeNull();
  });
});
