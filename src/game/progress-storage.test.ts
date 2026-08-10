import { describe, expect, it } from 'vitest';
import { configureManifestation, createInitialProgress, setWheelSlot, unlockSupports, unlockWeapons, unlockWeaponSwitch } from '@/game/progression';
import {
  clearSavedProgress,
  loadProgress,
  loadRunCheckpoint,
  PROGRESS_STORAGE_KEY,
  RUN_CHECKPOINT_STORAGE_KEY,
  saveProgress,
  saveRunCheckpoint,
  serializeProgress,
  parseProgress,
  parseRunCheckpoint,
  serializeRunCheckpoint,
  type ProgressStore,
  type RunCheckpoint,
} from '@/game/progress-storage';

function memoryStore(): ProgressStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

describe('progress storage', () => {
  it('진행 상태를 JSON으로 저장하고 복원한다', () => {
    let progress = unlockWeaponSwitch(unlockWeapons(createInitialProgress(), ['bow', 'shield']));
    progress = unlockSupports(progress, ['multiple-projectiles', 'wound-seeker']);
    progress = setWheelSlot(progress, 'right', 0, 'bow');
    progress = configureManifestation(progress, 'bow', {
      primarySupportId: 'multiple-projectiles',
      synergySupportId: 'wound-seeker',
    });

    expect(parseProgress(serializeProgress(progress))).toEqual(progress);
  });

  it('스토리지 입출력을 감싼다', () => {
    const store = memoryStore();
    const progress = unlockWeapons(createInitialProgress(), ['bow']);

    saveProgress(progress, store);
    expect(store.data[PROGRESS_STORAGE_KEY]).toBeTruthy();
    expect(loadProgress(store)).toEqual(progress);

    clearSavedProgress(store);
    expect(loadProgress(store)).toBeNull();
  });

  it('현재 판 체크포인트를 JSON으로 저장하고 복원한다', () => {
    const progress = unlockWeaponSwitch(unlockWeapons(createInitialProgress(), ['bow', 'shield']));
    const checkpoint: RunCheckpoint = {
      phase: 'combat',
      roomIndex: 3,
      hp: 62,
      maxHp: 100,
      shieldEnergy: 20,
      potionCharge: 55,
      progress,
      roomStartProgress: progress,
      roomStartKills: 8,
      clearedRooms: [1, 2],
      kills: 11,
      gained: { weapons: ['bow'], basicSkills: ['scattershot'], supports: ['linked-momentum'], keys: [] },
      elapsed: 71.5,
    };

    expect(parseRunCheckpoint(serializeRunCheckpoint(checkpoint))).toEqual(checkpoint);
  });

  it('체크포인트 스토리지 입출력을 감싼다', () => {
    const store = memoryStore();
    const progress = unlockWeapons(createInitialProgress(), ['bow']);
    const checkpoint: RunCheckpoint = {
      phase: 'town',
      roomIndex: 1,
      hp: 100,
      maxHp: 100,
      shieldEnergy: 45,
      potionCharge: 70,
      progress,
      roomStartProgress: progress,
      roomStartKills: 4,
      clearedRooms: [1],
      kills: 4,
      elapsed: 22,
    };

    saveRunCheckpoint(checkpoint, store);
    expect(store.data[RUN_CHECKPOINT_STORAGE_KEY]).toBeTruthy();
    expect(loadRunCheckpoint(store)).toEqual(checkpoint);
  });

  it('처음부터 시작은 옛 progress와 새 checkpoint를 모두 지운다', () => {
    const store = memoryStore();
    const progress = createInitialProgress();
    saveProgress(progress, store);
    saveRunCheckpoint({
      phase: 'combat',
      roomIndex: 0,
      hp: 100,
      maxHp: 100,
      shieldEnergy: 45,
      potionCharge: 70,
      progress,
      roomStartProgress: progress,
      roomStartKills: 0,
      clearedRooms: [],
      kills: 0,
      elapsed: 0,
    }, store);

    clearSavedProgress(store);

    expect(loadProgress(store)).toBeNull();
    expect(loadRunCheckpoint(store)).toBeNull();
  });

  it('깨진 데이터는 무시한다', () => {
    expect(parseProgress('{')).toBeNull();
    expect(parseProgress(JSON.stringify({ version: 999, progress: {} }))).toBeNull();
    expect(parseRunCheckpoint('{')).toBeNull();
    expect(parseRunCheckpoint(JSON.stringify({ version: 1, checkpoint: {} }))).toBeNull();
  });

  it('저장 데이터에 알 수 없는 무기가 있어도 안전한 진행 상태로 복원한다', () => {
    const restored = parseProgress(JSON.stringify({
      version: 1,
      progress: {
        unlockedWeapons: ['sword', 'laser'],
        ownedComboSkills: ['annihilation'],
        ownedSupports: [],
        weaponSwitchUnlocked: true,
        active: { left: 'laser', right: 'bow' },
        wheel: { left: ['laser', 'sword'], right: ['bow', null] },
        configs: {},
      },
    }));

    expect(restored?.unlockedWeapons).toEqual(['sword']);
    expect(restored?.active).toEqual({ left: 'sword', right: null });
    expect(restored?.wheel.left).toEqual(['sword', 'sword']);
    expect(restored?.wheel.right).toEqual([null, null]);
  });

  it('없어진 강화기술 보유 필드가 남아 있어도 조용히 버린다', () => {
    // 강화기술을 따로 줍던 시절의 저장에는 `ownedComboSkills`와 `configs.*.comboSkillId`가
    // 들어 있다. 이제 강화기술은 무기에 딸려 오므로 둘 다 읽지 않는다. 남은 키 때문에
    // 복원이 실패하면 그 기록으로 플레이하던 사람의 진행이 통째로 날아간다.
    const restored = parseProgress(JSON.stringify({
      version: 1,
      progress: {
        unlockedWeapons: ['sword', 'bow'],
        ownedComboSkills: ['annihilation', 'volley'],
        ownedSupports: ['combo-imprint'],
        weaponSwitchUnlocked: true,
        active: { left: 'sword', right: 'bow' },
        wheel: { left: ['sword', null], right: ['bow', null] },
        configs: { sword: { comboSkillId: 'annihilation', primarySupportId: null, synergySupportId: 'combo-imprint' } },
      },
    }));

    expect(restored?.unlockedWeapons).toEqual(['sword', 'bow']);
    expect(restored?.ownedSupports).toEqual(['combo-imprint']);
    // 설정에서 남은 키는 사라지고 소켓 세 칸만 남는다.
    expect(restored?.configs.sword).toEqual({
      basicSkillId: null,
      primarySupportId: null,
      synergySupportId: 'combo-imprint',
    });
    expect(restored).not.toHaveProperty('ownedComboSkills');
  });
});

describe('인벤토리 배치 복원', () => {
  it('`inventory` 필드가 없던 옛 저장도 격자가 채워진다', () => {
    // 필드를 추가하기 전에 저장된 기록에는 배치가 통째로 없다. 그대로 읽으면
    // 활·방패를 보유하고 있어도 마을 인벤토리가 텅 빈 채로 보인다.
    const old = JSON.stringify({
      version: 1,
      progress: {
        unlockedWeapons: ['sword', 'bow', 'shield'],
        ownedBasicSkills: ['thrust', 'scattershot', 'shield-slam'],
        ownedSupports: ['multiple-projectiles'],
        weaponSwitchUnlocked: true,
        active: { left: 'sword', right: null },
      },
    });

    const restored = parseProgress(old);

    // 무기 → 각 무기의 기본스킬 → 보조형스킬 순서로 채워진다.
    expect(restored?.inventory.filter((id) => id !== null)).toEqual([
      'sword',
      'bow',
      'shield',
      'thrust',
      'scattershot',
      'shield-slam',
      'multiple-projectiles',
    ]);
  });

  it('보유하지 않은 것이 배치에 남아 있으면 지운다', () => {
    const broken = JSON.stringify({
      version: 1,
      progress: {
        unlockedWeapons: ['sword'],
        active: { left: 'sword', right: null },
        inventory: ['arcane', 'sword'],
      },
    });

    const restored = parseProgress(broken);

    expect(restored?.inventory).not.toContain('arcane');
    expect(restored?.inventory).toContain('sword');
  });
});
