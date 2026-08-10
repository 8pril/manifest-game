import type { Skill } from '@/engine/support';
import { WEAPON_LIST } from '@/data/weapons';

/**
 * 스킬 목록.
 *
 * 스킬은 무기에 속하므로 `weapons.ts`가 유일한 정의처다.
 * 여기서는 무기 정의에서 스킬만 펼쳐 놓아, 데이터 무결성 검사처럼
 * 전체 스킬을 훑어야 하는 곳에서 쓰게 한다.
 */

export const SKILLS: readonly Skill[] = WEAPON_LIST.flatMap((weapon) => [
  weapon.basic,
  ...weapon.basicSkills,
]);

export function findSkill(id: string): Skill | undefined {
  return SKILLS.find((skill) => skill.id === id);
}
