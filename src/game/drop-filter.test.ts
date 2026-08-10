import { describe, expect, it } from 'vitest';
import { ROOMS } from '@/game/rooms';
import { SUPPORTS } from '@/data/supports';
import { WEAPON_LIST, basicSkillsOf, weaponOf } from '@/data/weapons';
import { canAttach, supportSlotType } from '@/engine/support';

/**
 * 무기 전용 랜덤 드랍이 실제로 뽑을 것이 있는지 고정한다.
 *
 * `forWeapon`/`forSkillId`는 태그로 거른다. 거르고 나서 후보가 0개면 그 보스는
 * 아무것도 안 떨어뜨리는데, 데이터만 봐서는 알 수 없다. 보스를 잡았는데 보상이
 * 없으면 버그로 보인다.
 */
describe('무기 전용 랜덤 드랍', () => {
  const skillById = (id: string) => WEAPON_LIST
    .flatMap((weapon) => [weapon.basic, ...basicSkillsOf(weapon)])
    .find((skill) => skill.id === id);

  it('겨누는 스킬 id는 실제 스킬이어야 한다', () => {
    for (const room of ROOMS) {
      const rule = room.reward?.randomSupports;
      if (!rule?.forSkillId) continue;
      expect(skillById(rule.forSkillId), `${room.label}의 드랍 대상`).toBeTruthy();
    }
  });

  for (const room of ROOMS) {
    const rule = room.reward?.randomSupports;
    if (!rule?.forWeapon) continue;

    it(`${room.label}은 뽑을 후보가 있다`, () => {
      const weapon = weaponOf(rule.forWeapon!);
      const target = rule.forSkillId ? skillById(rule.forSkillId)! : weapon.basic;
      for (const slot of ['primary', 'synergy'] as const) {
        if (!rule[slot]) continue;
        const candidates = SUPPORTS.filter(
          (s) => supportSlotType(s) === slot && canAttach(target, s, []).ok,
        );
        expect(candidates.length, `${weapon.name} ${target.name} ${slot}`).toBeGreaterThan(0);
      }
    });
  }
});
