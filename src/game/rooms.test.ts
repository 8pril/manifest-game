import { describe, expect, it } from 'vitest';
import { isBossKind } from '@/game/enemy';
import { enemyCount, ROOMS } from '@/game/rooms';

describe('room composition', () => {
  it('보상 방은 빈 방이 아니며 보스를 포함한다', () => {
    const rewardRooms = ROOMS.filter((room) => room.reward);

    for (const room of rewardRooms) {
      expect(enemyCount(room), room.label).toBeGreaterThan(0);
      expect(room.spawns.some((spawn) => isBossKind(spawn.kind) && spawn.count > 0), room.label).toBe(true);
    }
  });

  it('첫 보스와 최종 보스는 서로 다른 종류다', () => {
    const bossKinds = ROOMS.filter((room) => room.reward).map((room) => room.spawns.find((spawn) => isBossKind(spawn.kind))?.kind);

    expect(bossKinds).toEqual(['gatekeeper', 'collapsedDoor']);
    expect(new Set(bossKinds).size).toBe(bossKinds.length);
  });
});
