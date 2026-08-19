import { describe, expect, it } from 'vitest';
import {
  configureManifestation,
  configuredSupports,
  createInitialProgress,
  equipFromWheel,
  equipFirstWheelSlots,
  hasSupport,
  hasWeapon,
  setWheelSlot,
  swapWheelSlots,
  unlockBasicSkills,
  unlockSupports,
  unlockWeapons,
  unlockWeaponSwitch,
} from '@/game/progression';

describe('createInitialProgress', () => {
  it('검 하나만 보유하고 무기 교체는 잠긴 상태로 시작한다', () => {
    const progress = createInitialProgress();

    expect(progress.unlockedWeapons).toEqual(['sword']);
    expect(progress.ownedSupports).toEqual([]);
    expect(progress.weaponSwitchUnlocked).toBe(false);
    expect(progress.active).toEqual({ left: 'sword', right: null });
    expect(progress.wheel.left).toEqual(['sword', null]);
    expect(progress.wheel.right).toEqual([null, null]);
  });

  it('무기별 설정은 소켓 세 칸이 비어 있는 상태로 시작한다', () => {
    const progress = createInitialProgress();

    // `무기 ─ 기본스킬 ─ 보조 ─ 연계`. 첫 소켓이 비면 무기 본래의 기본 공격이 나간다.
    expect(progress.configs.sword).toEqual({
      basicSkillId: null,
      primarySupportId: null,
      synergySupportId: null,
    });
  });
});

describe('weapon unlocks', () => {
  it('보스를 잡으면 새 무기를 해금할 수 있다', () => {
    const progress = unlockWeapons(createInitialProgress(), ['bow', 'shield']);

    expect(progress.unlockedWeapons).toEqual(['sword', 'bow', 'shield']);
    expect(hasWeapon(progress, 'bow')).toBe(true);
    expect(hasWeapon(progress, 'arcane')).toBe(false);
  });

  it('해금 순서는 무기 데이터 순서를 따른다', () => {
    const progress = unlockWeapons(createInitialProgress(), ['shield', 'bow']);

    expect(progress.unlockedWeapons).toEqual(['sword', 'bow', 'shield']);
  });
});

describe('owned supports', () => {
  it('보조형스킬은 id 배열로 보유한다', () => {
    const progress = unlockSupports(createInitialProgress(), ['fork', 'multiple-projectiles', 'fork']);

    expect(progress.ownedSupports).toEqual(['fork', 'multiple-projectiles']);
    expect(hasSupport(progress, 'fork')).toBe(true);
    expect(hasSupport(progress, 'earthquake')).toBe(false);
  });
});

describe('weapon wheel', () => {
  it('해금된 무기만 링 메뉴 후보에 넣을 수 있다', () => {
    const initial = createInitialProgress();
    const rejected = setWheelSlot(initial, 'right', 0, 'bow');
    expect(rejected).toBe(initial);

    const unlocked = unlockWeapons(initial, ['bow']);
    const accepted = setWheelSlot(unlocked, 'right', 0, 'bow');
    expect(accepted.wheel.right).toEqual(['bow', null]);
  });

  it('무기 교체가 해금되기 전에는 링 후보를 장착하지 않는다', () => {
    const progress = setWheelSlot(unlockWeapons(createInitialProgress(), ['bow']), 'right', 0, 'bow');

    expect(equipFromWheel(progress, 'right', 0)).toBe(progress);
  });

  it('무기 교체가 해금된 뒤 R링 후보에서 좌우 손을 교체한다', () => {
    let progress = createInitialProgress();
    progress = unlockWeapons(progress, ['bow', 'shield']);
    progress = setWheelSlot(progress, 'left', 1, 'shield');
    progress = setWheelSlot(progress, 'right', 0, 'bow');
    progress = unlockWeaponSwitch(progress);

    expect(equipFromWheel(progress, 'left', 1).active.left).toBe('shield');
    expect(equipFromWheel(progress, 'right', 0).active.right).toBe('bow');
  });

  it('같은 무기를 좌우 후보에 중복 등록하지 않는다', () => {
    let progress = createInitialProgress();
    progress = unlockWeapons(progress, ['bow']);
    progress = setWheelSlot(progress, 'right', 0, 'bow');

    const rejected = setWheelSlot(progress, 'left', 1, 'bow');

    expect(rejected).toBe(progress);
  });

  it('R링 후보 칸끼리 무기를 맞바꾼다', () => {
    let progress = createInitialProgress();
    progress = unlockWeapons(progress, ['bow', 'shield']);
    progress = setWheelSlot(progress, 'left', 1, 'shield');
    progress = setWheelSlot(progress, 'right', 0, 'bow');

    const swapped = swapWheelSlots(progress, { hand: 'left', index: 1 }, { hand: 'right', index: 0 });

    expect(swapped.wheel.left[1]).toBe('bow');
    expect(swapped.wheel.right[0]).toBe('shield');
  });

  it('마을을 나갈 때 쓸 첫 번째 좌우 후보를 active로 반영한다', () => {
    let progress = createInitialProgress();
    progress = unlockWeapons(progress, ['bow', 'shield']);
    progress = setWheelSlot(progress, 'left', 0, 'shield');
    progress = setWheelSlot(progress, 'right', 0, 'bow');
    progress = unlockWeaponSwitch(progress);

    expect(equipFirstWheelSlots(progress).active).toEqual({ left: 'shield', right: 'bow' });
  });
});

describe('manifestation config', () => {
  it('해금된 무기의 보조형스킬 슬롯을 바꾼다', () => {
    const progress = unlockSupports(unlockWeapons(createInitialProgress(), ['bow']), ['multiple-projectiles', 'wound-seeker']);
    const configured = configureManifestation(progress, 'bow', {
      primarySupportId: 'multiple-projectiles',
      synergySupportId: 'wound-seeker',
    });

    expect(configured.configs.bow).toMatchObject({
      primarySupportId: 'multiple-projectiles',
      synergySupportId: 'wound-seeker',
    });
  });

  it('설정 슬롯에서 실제 보조능력 데이터를 읽는다', () => {
    const progress = configureManifestation(
      unlockSupports(unlockWeapons(createInitialProgress(), ['bow']), ['multiple-projectiles', 'wound-seeker']),
      'bow',
      {
        primarySupportId: 'multiple-projectiles',
        synergySupportId: 'wound-seeker',
      },
    );

    expect(configuredSupports(progress, 'bow').map((support) => support.id)).toEqual(['multiple-projectiles', 'wound-seeker']);
  });

  it('미보유 보조형스킬은 설정과 읽기 경로에서 적용하지 않는다', () => {
    const progress = unlockWeapons(createInitialProgress(), ['bow']);
    const configured = configureManifestation(progress, 'bow', {
      primarySupportId: 'multiple-projectiles',
      synergySupportId: 'fork',
    });

    expect(configured.configs.bow.primarySupportId).toBeNull();
    expect(configured.configs.bow.synergySupportId).toBeNull();
    expect(configuredSupports(configured, 'bow')).toEqual([]);
  });

  it('보유했더라도 슬롯 유형이 다르면 설정하지 않는다', () => {
    const progress = unlockSupports(
      unlockWeapons(createInitialProgress(), ['bow']),
      ['multiple-projectiles', 'wound-seeker'],
    );
    const configured = configureManifestation(progress, 'bow', {
      primarySupportId: 'wound-seeker',
      synergySupportId: 'multiple-projectiles',
    });

    expect(configured.configs.bow.primarySupportId).toBeNull();
    expect(configured.configs.bow.synergySupportId).toBeNull();
    expect(configuredSupports(configured, 'bow')).toEqual([]);
  });

  it('보조형스킬 한 개는 한 소켓에만 장착된다', () => {
    const progress = unlockSupports(unlockWeapons(createInitialProgress(), ['bow']), ['bold-resolve']);
    const sword = configureManifestation(progress, 'sword', { primarySupportId: 'bold-resolve' });
    const bow = configureManifestation(sword, 'bow', { primarySupportId: 'bold-resolve' });

    expect(bow.configs.sword.primarySupportId).toBeNull();
    expect(bow.configs.bow.primarySupportId).toBe('bold-resolve');
    expect(configuredSupports(bow, 'sword')).toEqual([]);
    expect(configuredSupports(bow, 'bow').map((support) => support.id)).toEqual(['bold-resolve']);
  });

  it('기본스킬 변경 후 호환되지 않는 보조와 연계만 해제한다', () => {
    let progress = unlockWeapons(createInitialProgress(), ['arcane']);
    progress = unlockBasicSkills(progress, ['arcane-bloom', 'arcane-daggers']);
    progress = unlockSupports(progress, ['explosive-ground', 'wound-resonance']);
    progress = configureManifestation(progress, 'arcane', {
      basicSkillId: 'arcane-bloom',
      primarySupportId: 'explosive-ground',
      synergySupportId: 'wound-resonance',
    });

    const changed = configureManifestation(progress, 'arcane', { basicSkillId: 'arcane-daggers' });

    expect(changed.configs.arcane).toEqual({
      basicSkillId: 'arcane-daggers',
      primarySupportId: null,
      synergySupportId: null,
    });
    expect(changed.ownedSupports).toEqual(expect.arrayContaining(['explosive-ground', 'wound-resonance']));
    expect(changed.inventory).toEqual(expect.arrayContaining(['explosive-ground', 'wound-resonance']));
  });

  it('새 기본스킬에도 호환되는 보조와 연계는 유지한다', () => {
    let progress = unlockWeapons(createInitialProgress(), ['bow']);
    progress = unlockBasicSkills(progress, ['scattershot']);
    progress = unlockSupports(progress, ['multiple-projectiles', 'wound-seeker']);
    progress = configureManifestation(progress, 'bow', {
      primarySupportId: 'multiple-projectiles',
      synergySupportId: 'wound-seeker',
    });

    const changed = configureManifestation(progress, 'bow', { basicSkillId: 'scattershot' });

    expect(changed.configs.bow).toEqual({
      basicSkillId: 'scattershot',
      primarySupportId: 'multiple-projectiles',
      synergySupportId: 'wound-seeker',
    });
  });

  it('아직 해금되지 않은 무기 설정은 바꾸지 않는다', () => {
    const progress = createInitialProgress();

    expect(configureManifestation(progress, 'bow', { primarySupportId: 'multi-projectile' })).toBe(progress);
  });
});

describe('마을에서 R링 1번 칸을 바꿨을 때', () => {
  const townProgress = () =>
    unlockWeaponSwitch(unlockWeapons(createInitialProgress(), ['bow', 'shield']));

  it('1번 칸을 바꾸면 손에 드는 무기도 같이 바뀐다', () => {
    // 마을 패널에는 `왼손 1: 방패`라고 떠 있는데 캐릭터는 검을 든 채로 남으면
    // 설정과 화면이 어긋난다. 설정하는 순간 손에 들려야 한다.
    const before = townProgress();
    const after = equipFirstWheelSlots(setWheelSlot(before, 'left', 0, 'shield'));

    expect(after.wheel.left[0]).toBe('shield');
    expect(after.active.left).toBe('shield');
  });

  it('2번 칸은 후보일 뿐이라 손에 든 무기를 바꾸지 않는다', () => {
    const before = equipFirstWheelSlots(setWheelSlot(townProgress(), 'left', 0, 'sword'));
    const after = equipFirstWheelSlots(setWheelSlot(before, 'left', 1, 'shield'));

    expect(after.wheel.left[1]).toBe('shield');
    expect(after.active.left).toBe('sword');
  });

  it('오른손 1번 칸을 비우면 오른손이 빈손이 된다', () => {
    const before = equipFirstWheelSlots(setWheelSlot(townProgress(), 'right', 0, 'bow'));
    expect(before.active.right).toBe('bow');

    const after = equipFirstWheelSlots(setWheelSlot(before, 'right', 0, null));
    expect(after.active.right).toBeNull();
  });
});

describe('해금하면 인벤토리에 들어간다', () => {
  // 호출하는 쪽이 따로 챙기게 하면 빠뜨리는 경로가 생긴다. 실제로 마을 UI를
  // 새로 만들면서 저장 복원 경로에서 이 동기화가 빠져 격자가 비어 보였다.
  it('무기를 해금하면 배치에 나타난다', () => {
    const progress = unlockWeapons(createInitialProgress(), ['bow']);

    expect(progress.inventory).toContain('bow');
  });

  it('보조형스킬을 해금하면 배치에 나타난다', () => {
    const progress = unlockSupports(createInitialProgress(), ['multiple-projectiles']);

    expect(progress.inventory).toContain('multiple-projectiles');
  });
});
