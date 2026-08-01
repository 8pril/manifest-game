import { describe, expect, it } from 'vitest';
import { configureManifestation, createInitialProgress, setWheelSlot, unlockSupports, unlockWeapons, unlockWeaponSwitch } from '@/game/progression';
import { clearSavedProgress, loadProgress, PROGRESS_STORAGE_KEY, saveProgress, serializeProgress, parseProgress, type ProgressStore } from '@/game/progress-storage';

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

  it('깨진 데이터는 무시한다', () => {
    expect(parseProgress('{')).toBeNull();
    expect(parseProgress(JSON.stringify({ version: 999, progress: {} }))).toBeNull();
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
});
