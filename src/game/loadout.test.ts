import { describe, it, expect } from 'vitest';
import {
  createLoadout,
  supportsFor,
  allSkills,
  totalSupports,
  describeByHand,
  handOf,
  resolveFor,
  loadoutFromProgress,
  supportsFromProgress,
  leftWeapon,
  rightWeapon,
} from '@/game/loadout';
import { SUPPORTS } from '@/data/supports';
import { configureManifestation, createInitialProgress, unlockSupports, unlockWeapons } from '@/game/progression';
import { createRun, clearRoom } from '@/game/run';

const pierce = SUPPORTS.find((s) => s.id === 'pierce')!;
const opulence = SUPPORTS.find((s) => s.id === 'opulence')!;

function withSupports(skillId: string, supports: typeof SUPPORTS): ReturnType<typeof createLoadout> {
  return {
    ...createLoadout('sword', 'bow'),
    supports: { [skillId]: supports },
  };
}

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

describe('resolveFor', () => {
  it('해당 스킬에 붙은 보조능력만 반영한다', () => {
    const loadout = withSupports('arrow-shot', [opulence]);

    const bow = rightWeapon(loadout);
    if (!bow) throw new Error('오른손 무기가 필요합니다.');
    const withSupport = resolveFor(loadout, bow.basic);
    const without = resolveFor(loadout, bow.combo);

    // 부귀는 피해 25% 증가
    expect(withSupport.stats.damage).toBeCloseTo((bow.basic.base.damage ?? 0) * 1.25, 10);
    expect(without.stats.damage).toBe(bow.combo.base.damage);
  });
});

describe('loadoutFromProgress', () => {
  it('마을 설정의 보조1/보조2를 무기 콤보스킬에 반영한다', () => {
    let progress = unlockWeapons(createInitialProgress(), ['bow']);
    progress = unlockSupports(progress, ['multiple-projectiles', 'fork']);
    progress = { ...progress, active: { left: 'sword', right: 'bow' } };
    progress = configureManifestation(progress, 'bow', {
      primarySupportId: 'multiple-projectiles',
      synergySupportId: 'fork',
    });

    const loadout = loadoutFromProgress(progress);
    expect(supportsFor(loadout, 'volley').map((support) => support.id)).toEqual(['multiple-projectiles', 'fork']);
    expect(resolveFor(loadout, rightWeapon(loadout)!.combo).stats.projectileCount).toBe(7);
  });
});

describe('describeByHand', () => {
  it('손별로 무기와 보조능력을 묶는다', () => {
    // 스킬 이름만 나열하면 어느 손을 강화한 것인지 알 수 없다.
    const loadout = withSupports('arrow-shot', [pierce]);

    const hands = describeByHand(loadout);
    expect(hands[0]).toEqual({ hand: '왼손', weapon: '검', lines: [] });
    expect(hands[1]).toEqual({ hand: '오른손', weapon: '활', lines: ['화살 사격: 관통'] });
  });

  it('한 스킬에 여러 개가 붙으면 함께 적는다', () => {
    const loadout = withSupports('arrow-shot', [pierce, opulence]);
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

describe('supportsFromProgress', () => {
  it('첫 보스 뒤 기본 세팅이 전부 유효하게 붙는다', () => {
    // 마을 진입 시 자동 장착되는 기본 세팅이 태그 규칙을 어기면
    // 조용히 버려져 성장이 사라진다. 붙은 개수로 그것을 고정한다.
    let run = createRun('sword', null);
    run = clearRoom(run); // 흐린 입구
    run = clearRoom(run); // 첫 문지기 → 마을

    expect(run.phase).toBe('town');
    const bySkill = run.loadout.supports;
    // 검·활·방패가 해금되고 각각 콤보스킬에 보조형 2개가 붙는다.
    expect(Object.keys(bySkill).sort()).toEqual(['annihilation', 'fracture-wave', 'volley']);
    for (const [skillId, list] of Object.entries(bySkill)) {
      expect(list.length, skillId).toBe(2);
    }
  });

  it('태그가 맞지 않는 보조능력은 붙지 않는다', () => {
    // 다중투사체는 투사체 스킬에만 붙는다. 검의 멸검은 지대라 거부돼야 한다.
    const progress = configureManifestation(
      unlockSupports(unlockWeapons(createInitialProgress(), ['sword']), ['multiple-projectiles']),
      'sword',
      { primarySupportId: 'multiple-projectiles', synergySupportId: null },
    );
    expect(supportsFromProgress(progress)).toEqual({});
  });

  it('설정에 남아 있어도 미보유 보조능력은 붙지 않는다', () => {
    const progress = {
      ...unlockWeapons(createInitialProgress(), ['bow']),
      configs: {
        ...createInitialProgress().configs,
        bow: {
          comboSkillId: 'volley',
          primarySupportId: 'multiple-projectiles',
          synergySupportId: 'fork',
        },
      },
    };

    expect(supportsFromProgress(progress)).toEqual({});
  });
});
