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
import { basicSkillsOf } from '@/data/weapons';
import { configureManifestation, createInitialProgress, unlockBasicSkills, unlockSupports, unlockWeapons } from '@/game/progression';
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
      'thrust',
      'annihilation',
      'arrow-shot',
      'scattershot',
      'volley',
    ]);
  });

  it('초기 구간처럼 오른손 무기가 없을 수 있다', () => {
    const loadout = createLoadout('sword', null);

    expect(rightWeapon(loadout)).toBeNull();
    expect(allSkills(loadout).map((s) => s.id)).toEqual(['sword-slash', 'thrust', 'annihilation']);
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
    const volley = basicSkillsOf(bow).find((skill) => skill.id === 'volley')!;
    const without = resolveFor(loadout, volley);

    // 부귀는 피해 25% 증가
    expect(withSupport.stats.damage).toBeCloseTo((bow.basic.base.damage ?? 0) * 1.25, 10);
    expect(without.stats.damage).toBe(volley.base.damage);
  });
});

describe('loadoutFromProgress', () => {
  it('첫 소켓을 채우면 보조가 그 기본스킬로 간다', () => {
    // 기본스킬을 끼우면 그것이 곧 기본 공격이다. 보조는 실제로 나가는 쪽에 붙는다.
    let progress = unlockWeapons(createInitialProgress(), ['bow']);
    progress = unlockBasicSkills(progress, ['scattershot']);
    progress = unlockSupports(progress, ['multiple-projectiles']);
    progress = { ...progress, active: { left: 'sword', right: 'bow' } };
    progress = configureManifestation(progress, 'bow', {
      basicSkillId: 'scattershot',
      primarySupportId: 'multiple-projectiles',
    });

    const loadout = loadoutFromProgress(progress);
    expect(supportsFor(loadout, 'scattershot').map((s) => s.id)).toEqual(['multiple-projectiles']);
    expect(supportsFor(loadout, 'arrow-shot')).toEqual([]);
    const scattershot = basicSkillsOf(rightWeapon(loadout)!).find((skill) => skill.id === 'scattershot')!;
    expect(resolveFor(loadout, scattershot).stats.projectileCount).toBe(5);
  });

  it('첫 소켓이 비면 보조가 무기 본래의 기본 공격으로 간다', () => {
    let progress = unlockWeapons(createInitialProgress(), ['bow']);
    progress = unlockSupports(progress, ['multiple-projectiles', 'wound-seeker']);
    progress = { ...progress, active: { left: 'sword', right: 'bow' } };
    progress = configureManifestation(progress, 'bow', {
      primarySupportId: 'multiple-projectiles',
      synergySupportId: 'wound-seeker',
    });

    const loadout = loadoutFromProgress(progress);
    expect(supportsFor(loadout, 'volley')).toEqual([]);
    expect(supportsFor(loadout, 'arrow-shot').map((s) => s.id)).toEqual([
      'multiple-projectiles',
      'wound-seeker',
    ]);
    expect(resolveFor(loadout, rightWeapon(loadout)!.basic).stats.projectileCount).toBe(3);
  });

  it('첫 소켓이 무엇을 붙일 수 있는지까지 바꾼다', () => {
    // `상처 공명`은 `지대`를 요구한다. 비전 탄은 투사체라 안 붙지만, 비전 개화를
    // 끼우면 기본 공격이 지대가 되므로 그때부터 붙는다.
    let progress = unlockBasicSkills(unlockWeapons(createInitialProgress(), ['arcane']), ['arcane-bloom']);
    progress = unlockSupports(progress, ['wound-resonance']);
    progress = configureManifestation(progress, 'arcane', { synergySupportId: 'wound-resonance' });
    expect(supportsFor(loadoutFromProgress(progress), 'arcane-bolt')).toEqual([]);
    expect(supportsFor(loadoutFromProgress(progress), 'arcane-bloom')).toEqual([]);

    progress = configureManifestation(progress, 'arcane', { basicSkillId: 'arcane-bloom' });
    expect(supportsFor(loadoutFromProgress(progress), 'arcane-bloom').map((s) => s.id)).toEqual([
      'wound-resonance',
    ]);
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
  it('첫 마을에서는 아무것도 자동 장착되지 않는다', () => {
    // 기본스킬은 무기와 함께 오지만 소켓은 비어 있다. 끼우는 것은 사람이 한다.
    let run = createRun('sword', null);
    run = clearRoom(run); // 흐린 입구
    run = clearRoom(run); // 첫 문지기 → 마을

    expect(run.phase).toBe('town');
    expect(run.loadout.supports).toEqual({});
    for (const weapon of run.progress.unlockedWeapons) {
      expect(run.progress.configs[weapon].basicSkillId).toBeNull();
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
          basicSkillId: null,
          primarySupportId: 'multiple-projectiles',
          synergySupportId: 'wound-seeker',
        },
      },
    };

    expect(supportsFromProgress(progress)).toEqual({});
  });

  it('옛 저장에 같은 보조형스킬이 여러 소켓에 남아 있어도 한 번만 적용한다', () => {
    const base = unlockSupports(unlockWeapons(createInitialProgress(), ['bow']), ['bold-resolve']);
    const progress = {
      ...base,
      configs: {
        ...base.configs,
        sword: { ...base.configs.sword, primarySupportId: 'bold-resolve' },
        bow: { ...base.configs.bow, primarySupportId: 'bold-resolve' },
      },
    };

    const supports = supportsFromProgress(progress);

    expect(Object.values(supports).flat().map((support) => support.id)).toEqual(['bold-resolve']);
    expect(supports['sword-slash']?.map((support) => support.id)).toEqual(['bold-resolve']);
    expect(supports['arrow-shot']).toBeUndefined();
  });
});
