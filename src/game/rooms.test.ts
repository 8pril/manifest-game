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

  it('보스는 방마다 서로 다른 종류다', () => {
    const bossKinds = ROOMS
      .map((room) => room.spawns.find((spawn) => isBossKind(spawn.kind) && spawn.count > 0)?.kind)
      .filter(Boolean);

    // 보스 4종이 전부 다른 종류다. 같은 패턴을 두 번 보여 주면 방이 늘어난 의미가 없다.
    expect(bossKinds).toEqual(['gatekeeper', 'warden', 'glutton', 'collapsedDoor']);
    expect(new Set(bossKinds).size).toBe(bossKinds.length);
  });
});
