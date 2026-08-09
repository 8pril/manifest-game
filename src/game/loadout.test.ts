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
  it('콤보 개방을 붙이면 보조가 강화기술로 간다', () => {
    // 강화기술이 실제로 발동하는 빌드이므로 보조는 그쪽을 강화한다.
    // 연계(`콤보 개방`)은 기본 공격에 붙어야 전환을 열 수 있다.
    let progress = unlockWeapons(createInitialProgress(), ['bow']);
    progress = unlockSupports(progress, ['multiple-projectiles', 'combo-imprint']);
    progress = { ...progress, active: { left: 'sword', right: 'bow' } };
    progress = configureManifestation(progress, 'bow', {
      primarySupportId: 'multiple-projectiles',
      synergySupportId: 'combo-imprint',
    });

    const loadout = loadoutFromProgress(progress);
    expect(supportsFor(loadout, 'volley').map((s) => s.id)).toEqual(['multiple-projectiles']);
    expect(supportsFor(loadout, 'arrow-shot').map((s) => s.id)).toEqual(['combo-imprint']);
    expect(resolveFor(loadout, rightWeapon(loadout)!.combo).stats.projectileCount).toBe(7);
  });

  it('콤보 개방이 없으면 보조가 기본 공격으로 간다', () => {
    // 콤보를 안 쓰는 빌드에서는 강화기술이 발동할 일이 없다. 거기에 보조를
    // 붙이면 칸이 통째로 죽으므로 평소 쓰는 기본 공격을 강화한다.
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

  it('기본 공격에 태그가 안 맞는 연계는 강화기술로 넘어간다', () => {
    // `상처 공명`은 `지대`를 요구하는데 검의 기본 공격 베기에는 지대가 없다.
    // 붙을 곳이 없다고 버리지 않고 강화기술 멸검으로 넘긴다.
    let progress = unlockSupports(createInitialProgress(), ['wound-resonance']);
    progress = configureManifestation(progress, 'sword', { synergySupportId: 'wound-resonance' });

    const loadout = loadoutFromProgress(progress);
    expect(supportsFor(loadout, 'sword-slash')).toEqual([]);
    expect(supportsFor(loadout, 'annihilation').map((s) => s.id)).toEqual(['wound-resonance']);
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
  it('첫 보스 뒤에 얻는 보조형스킬은 콤보 개방 하나뿐이다', () => {
    // 원래는 첫 마을 시점 보유 0개였다(기획 확인, D6). 그런데 콤보를 기본 규칙에서
    // 빼면서 `콤보 개방`이 강화기술 전환을 여는 **유일한 열쇠**가 됐다.
    //
    // 마을은 첫 보스 뒤 딱 한 번 나오고 보조형스킬 설정은 마을에서만 되므로,
    // 첫 보스보다 뒤에 주면 1회차에는 장착할 방법이 아예 없다. 그러면 멸검·연사·
    // 비전단검·균열 파동을 한 번도 못 보고 판이 끝난다.
    //
    // 그래서 이 하나만 예외로 첫 보스 보상에 둔다. 나머지는 여전히 0개다.
    let run = createRun('sword', null);
    run = clearRoom(run); // 흐린 입구
    run = clearRoom(run); // 첫 문지기 → 마을

    expect(run.phase).toBe('town');
    expect(run.progress.ownedSupports).toEqual(['combo-imprint']);
    // 얻기만 했을 뿐 자동 장착되지는 않는다. 마을에서 직접 골라야 한다.
    expect(run.loadout.supports).toEqual({});
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
          synergySupportId: 'wound-seeker',
        },
      },
    };

    expect(supportsFromProgress(progress)).toEqual({});
  });
});
