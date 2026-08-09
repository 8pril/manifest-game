import { describe, it, expect } from 'vitest';
import { ROOMS } from '@/game/rooms';
import { weaponOf, WEAPON_IDS } from '@/data/weapons';
import { findSupport } from '@/data/supports';
import { findSkill } from '@/data/skills';

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
    expect(rewards.map((r) => r.label)).toEqual(['흐린 입구', '첫 문지기', '무너진 문']);
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
      for (const id of reward.comboSkills ?? []) {
        expect(findSkill(id), `강화기술 ${id}`).toBeTruthy();
      }
    });
  }

  it('흐린 입구 보상 문구', () => {
    const r = ROOMS[0].reward!;
    expect(r.comboSkills?.map((id) => findSkill(id)!.name).join(' / ')).toBe('멸검');
  });

  it('첫 문지기 보상 문구', () => {
    const r = ROOMS[1].reward!;
    expect(r.weapons?.map((id) => weaponOf(id).name).join(' / ')).toBe('활 / 방패');
    expect(r.comboSkills?.map((id) => findSkill(id)!.name).join(' / ')).toBe('연사 / 균열 파동');
    expect(r.supports ?? []).toEqual(['combo-imprint']);
  });

  it('최종 보스 보상 문구', () => {
    const r = ROOMS[ROOMS.length - 1].reward!;
    expect(r.weapons?.map((id) => weaponOf(id).name).join(' / ')).toBe('비전');
    expect(r.supports?.map((id) => findSupport(id)!.name).join(' / ')).toBe('연쇄 / 찌릿거리는 지대');
  });
});
