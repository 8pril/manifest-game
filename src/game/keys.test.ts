import { describe, expect, it } from 'vitest';
import { ROOMS, TOTAL_ROOMS } from '@/game/rooms';
import { KEYS, SEAL_KEYS, missingKeys } from '@/data/keys';
import { createInitialProgress, unlockKeys, hasAllKeys } from '@/game/progression';
import { createRun, exitUnlocked } from '@/game/run';

/**
 * 봉인된 문.
 *
 * 열쇠를 다 모으기 전에 지나가 버리면 뒤에 있는 방을 볼 수 없다. 규칙으로 막고,
 * 무엇이 없는지 화면에서 말해 줘야 한다.
 */
describe('열쇠', () => {
  it('봉인을 여는 열쇠는 전부 어느 방에선가 떨어진다', () => {
    const dropped = new Set(ROOMS.flatMap((room) => room.reward?.keys ?? []));

    for (const id of SEAL_KEYS) {
      expect(dropped, `${id}를 주는 방이 없다`).toContain(id);
    }
  });

  it('열쇠를 주는 방은 봉인된 방보다 앞에 있다', () => {
    // 뒤에 있으면 영원히 못 연다. 방 순서가 바뀌면 여기서 걸린다.
    const sealedAt = ROOMS.findIndex((room) => (room.requiresKeys?.length ?? 0) > 0);
    expect(sealedAt).toBeGreaterThan(-1);

    for (const id of ROOMS[sealedAt].requiresKeys!) {
      const from = ROOMS.findIndex((room) => room.reward?.keys?.includes(id));
      expect(from, `${id}는 봉인된 방보다 뒤에 있다`).toBeLessThan(sealedAt);
    }
  });

  it('하나라도 없으면 출구가 열리지 않는다', () => {
    const sealedAt = ROOMS.findIndex((room) => (room.requiresKeys?.length ?? 0) > 0);
    const run = { ...createRun('sword', null), roomIndex: sealedAt };

    expect(exitUnlocked(run)).toBe(false);

    const partial = { ...run, progress: unlockKeys(run.progress, [SEAL_KEYS[0]]) };
    expect(exitUnlocked(partial)).toBe(false);

    const all = { ...run, progress: unlockKeys(run.progress, SEAL_KEYS) };
    expect(exitUnlocked(all)).toBe(true);
  });

  it('봉인이 없는 방은 그냥 열린다', () => {
    const plain = ROOMS.findIndex((room) => !room.requiresKeys?.length);
    expect(exitUnlocked({ ...createRun('sword', null), roomIndex: plain })).toBe(true);
  });

  it('못 모은 열쇠만 알려준다', () => {
    expect(missingKeys([]).map((k) => k.id)).toEqual(KEYS.map((k) => k.id));
    expect(missingKeys(SEAL_KEYS)).toEqual([]);
  });

  it('열쇠는 소모되지 않는다', () => {
    // 문을 열고 나서도 인벤토리에 남아야 한다. 어디서 얻은 것인지가 기록이다.
    const progress = unlockKeys(createInitialProgress(), SEAL_KEYS);

    expect(hasAllKeys(progress, SEAL_KEYS)).toBe(true);
    expect(progress.inventory.filter((id) => SEAL_KEYS.includes(id ?? ''))).toHaveLength(SEAL_KEYS.length);
  });

  it('방 수가 늘어도 마지막 방은 보스가 지킨다', () => {
    expect(ROOMS[TOTAL_ROOMS - 1].label).toBe('무너진 문');
  });
});
