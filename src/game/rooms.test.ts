import { describe, expect, it } from 'vitest';
import { isBossKind } from '@/game/enemy';
import { enemyCount, ROOMS } from '@/game/rooms';

describe('room composition', () => {
  it('초반 두 방은 적 수를 낮춰 조작과 첫 보스 학습에 집중하게 한다', () => {
    expect(enemyCount(ROOMS[0])).toBeLessThanOrEqual(6);
    expect(enemyCount(ROOMS[1])).toBeLessThanOrEqual(5);
  });

  it('보상 방은 빈 방이 아니다', () => {
    const rewardRooms = ROOMS.filter((room) => room.reward);

    for (const room of rewardRooms) {
      expect(enemyCount(room), room.label).toBeGreaterThan(0);
    }
  });

  it('첫 보스와 최종 보스는 서로 다른 종류다', () => {
    const bossKinds = ROOMS
      .map((room) => room.spawns.find((spawn) => isBossKind(spawn.kind) && spawn.count > 0)?.kind)
      .filter(Boolean);

    expect(bossKinds).toEqual(['gatekeeper', 'collapsedDoor']);
    expect(new Set(bossKinds).size).toBe(bossKinds.length);
  });
});
