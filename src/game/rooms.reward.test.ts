import { describe, it, expect } from 'vitest';
import { ROOMS } from '@/game/rooms';
import { weaponOf, WEAPON_IDS } from '@/data/weapons';
import { findSupport } from '@/data/supports';

/**
 * 방 보상이 화면 문구로 풀리는지 고정한다.
 *
 * 보상은 id 문자열이라 오타가 나도 타입이 잡아주지 않는다. 화면에서는 이름을
 * 찾지 못한 항목이 조용히 사라지거나 id가 그대로 노출된다. 획득한 것이 보이지
 * 않으면 파밍이 성립하지 않으므로 여기서 막는다.
 */
describe('방 보상', () => {
  const rewards = ROOMS.flatMap((room) => (room.reward ? [{ label: room.label, reward: room.reward }] : []));

  it('보상이 있는 방이 존재한다', () => {
    expect(rewards.map((r) => r.label)).toEqual(['첫 문지기', '윗길 제단', '아랫길 굴', '무너진 문']);
  });

  for (const { label, reward } of rewards) {
    it(`${label}의 보상 id가 전부 이름으로 풀린다`, () => {
      for (const id of reward.weapons ?? []) {
        expect(WEAPON_IDS, `무기 ${id}`).toContain(id);
        expect(weaponOf(id).name).toBeTruthy();
      }
      for (const id of reward.supports ?? []) {
        expect(findSupport(id), `보조형 ${id}`).toBeTruthy();
      }
    });
  }

  it('첫 방은 아이템을 드랍하지 않는다', () => {
    expect(ROOMS[0].reward).toBeUndefined();
  });

  it('첫 보스는 무기 2종과 기본스킬 3종을 준다', () => {
    const r = ROOMS[1].reward!;
    expect(r.weapons?.map((id) => weaponOf(id).name).join(' / ')).toBe('활 / 방패');
    // **검의 것까지 준다.** 기본스킬은 무기에 딸려 오지 않으므로, 여기서 주지 않으면
    // 시작 무기인 검은 소켓을 영영 채울 수 없다.
    expect(r.basicSkills).toEqual(['thrust', 'scattershot', 'shield-slam']);
    // **보조형스킬은 두 번째 보스 몫이다.** 확정도 랜덤도 여기서는 주지 않는다.
    expect(r.supports ?? []).toEqual([]);
    expect(r.randomSupports).toBeUndefined();
  });

  it('기본스킬 보상 id가 전부 무기의 것과 맞는다', () => {
    const owned = new Set(WEAPON_IDS.map((id) => weaponOf(id).basicSkill.id));
    for (const room of ROOMS) {
      for (const id of room.reward?.basicSkills ?? []) {
        expect(owned, `기본스킬 ${id}`).toContain(id);
      }
    }
  });

  it('최종 보스는 보조와 연계를 1종씩 랜덤으로 준다', () => {
    const r = ROOMS[ROOMS.length - 1].reward!;
    expect(r.weapons?.map((id) => weaponOf(id).name).join(' / ')).toBe('비전');
    expect(r.supports ?? []).toEqual([]);
    // 보조 1종과 연계 1종을 랜덤으로. 보조형스킬의 유일한 출처다.
    expect(r.randomSupports).toEqual({ primary: 1, synergy: 1 });
    expect(r.supports ?? []).toEqual([]);
  });
});
