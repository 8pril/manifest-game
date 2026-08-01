import { describe, expect, it } from 'vitest';
import {
  configureManifestation,
  configuredSupports,
  createInitialProgress,
  equipFromWheel,
  hasComboSkill,
  hasSupport,
  hasWeapon,
  setWheelSlot,
  unlockSupports,
  unlockWeapons,
  unlockWeaponSwitch,
} from '@/game/progression';

describe('createInitialProgress', () => {
  it('검 하나만 보유하고 무기 교체는 잠긴 상태로 시작한다', () => {
    const progress = createInitialProgress();

    expect(progress.unlockedWeapons).toEqual(['sword']);
    expect(progress.ownedComboSkills).toEqual(['annihilation']);
    expect(progress.ownedSupports).toEqual([]);
    expect(progress.weaponSwitchUnlocked).toBe(false);
    expect(progress.active).toEqual({ left: 'sword', right: null });
    expect(progress.wheel.left).toEqual(['sword', null]);
    expect(progress.wheel.right).toEqual([null, null]);
  });

  it('무기별 기본 콤보스킬 설정을 갖는다', () => {
    const progress = createInitialProgress();

    expect(progress.configs.sword).toEqual({
      comboSkillId: 'annihilation',
      primarySupportId: null,
      synergySupportId: null,
    });
    expect(progress.configs.bow.comboSkillId).toBe('volley');
  });
});

describe('weapon unlocks', () => {
  it('보스를 잡으면 새 무기를 해금할 수 있다', () => {
    const progress = unlockWeapons(createInitialProgress(), ['bow', 'shield']);

    expect(progress.unlockedWeapons).toEqual(['sword', 'bow', 'shield']);
    expect(progress.ownedComboSkills).toEqual(['annihilation', 'volley', 'fracture-wave']);
    expect(hasWeapon(progress, 'bow')).toBe(true);
    expect(hasComboSkill(progress, 'volley')).toBe(true);
    expect(hasWeapon(progress, 'arcane')).toBe(false);
  });

  it('해금 순서는 무기 데이터 순서를 따른다', () => {
    const progress = unlockWeapons(createInitialProgress(), ['shield', 'bow']);

    expect(progress.unlockedWeapons).toEqual(['sword', 'bow', 'shield']);
    expect(progress.ownedComboSkills).toEqual(['annihilation', 'volley', 'fracture-wave']);
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
});

describe('manifestation config', () => {
  it('해금된 무기의 콤보스킬과 보조형스킬 슬롯을 바꾼다', () => {
    const progress = unlockSupports(unlockWeapons(createInitialProgress(), ['bow']), ['multiple-projectiles', 'fork']);
    const configured = configureManifestation(progress, 'bow', {
      primarySupportId: 'multi-projectile',
      synergySupportId: 'fork',
    });

    expect(configured.configs.bow).toMatchObject({
      comboSkillId: 'volley',
      primarySupportId: null,
      synergySupportId: 'fork',
    });
  });

  it('설정 슬롯에서 실제 보조능력 데이터를 읽는다', () => {
    const progress = configureManifestation(
      unlockSupports(unlockWeapons(createInitialProgress(), ['bow']), ['multiple-projectiles', 'fork']),
      'bow',
      {
        primarySupportId: 'multiple-projectiles',
        synergySupportId: 'fork',
      },
    );

    expect(configuredSupports(progress, 'bow').map((support) => support.id)).toEqual(['multiple-projectiles', 'fork']);
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

  it('미보유 콤보스킬은 설정하지 않는다', () => {
    const progress = createInitialProgress();
    const configured = configureManifestation(progress, 'sword', { comboSkillId: 'volley' });

    expect(configured.configs.sword.comboSkillId).toBe('annihilation');
  });

  it('아직 해금되지 않은 무기 설정은 바꾸지 않는다', () => {
    const progress = createInitialProgress();

    expect(configureManifestation(progress, 'bow', { primarySupportId: 'multi-projectile' })).toBe(progress);
  });
});
