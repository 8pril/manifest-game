import { describe, it, expect } from 'vitest';
import { ROOMS } from '@/game/rooms';
import { basicSkillsOf, weaponOf, WEAPON_IDS } from '@/data/weapons';
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

  it('첫 보스는 무기 2종과 기본스킬 3종만 준다', () => {
    const r = ROOMS[1].reward!;
    expect(r.weapons?.map((id) => weaponOf(id).name).join(' / ')).toBe('활 / 방패');
    // **검의 것까지 준다.** 기존 콤보스킬 4종은 첫 소켓의 추가 기본스킬 후보가 됐다.
    // 첫 보스는 현재 보유 무기인 검과 새로 얻는 활/방패의 옛 콤보스킬 3종을 준다.
    expect(r.basicSkills).toEqual(['annihilation', 'volley', 'fracture-wave']);
    expect(r.supports ?? []).toEqual([]);
    expect(r.randomSupports).toBeUndefined();
  });

  it('윗길 보스는 검 기본 공격 전용 보조를 1종 랜덤으로 준다', () => {
    const room = ROOMS.find((candidate) => candidate.label === '윗길 제단')!;

    expect(room.reward?.keys).toEqual(['key-upper']);
    expect(room.reward?.randomSupports).toEqual({ primary: 1, forWeapon: 'sword', forSkillId: 'sword-slash' });
  });

  it('아랫길 보스는 검 멸검에 붙는 연계를 1종 랜덤으로 준다', () => {
    // 멸검은 이제 기본스킬 소켓의 추가 후보다. 따라서 지대 연계가 떨어져도
    // 마을에서 검 첫 소켓에 멸검을 끼운 뒤 실제로 쓸 수 있다.
    const room = ROOMS.find((candidate) => candidate.label === '아랫길 굴')!;

    expect(room.reward?.keys).toEqual(['key-lower']);
    expect(room.reward?.randomSupports).toEqual({
      synergy: 1,
      forWeapon: 'sword',
      forSkillId: 'annihilation',
    });
  });

  it('기본스킬 보상 id가 전부 무기의 것과 맞는다', () => {
    const owned = new Set(WEAPON_IDS.flatMap((id) => basicSkillsOf(id).map((skill) => skill.id)));
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
