import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SUPPORTS } from '@/data/supports';
import { WEAPON_IDS, basicSkillsOf, weaponOf } from '@/data/weapons';

/**
 * 문서가 데이터를 빠짐없이 싣고 있는지 고정한다.
 *
 * `docs/game-scope.md`는 제출 문서의 근거 자료다. 그런데 데이터는 코드에서 늘고
 * 문서는 손으로 쓰다 보니 조용히 어긋난다. 실제로 연계 6종 중 `상처 추적`과
 * `상처 공명`이 문서 어디에도 없는 채로 남아 있었고, 같은 문서가 다른 줄에서는
 * `보조 15 + 연계 6`이라고 세고 있었다. 세는 곳과 적는 곳이 따로 놀았다.
 *
 * **표의 문구까지 검사하지는 않는다.** 이름이 문서에 등장하는지만 본다.
 * 문장을 고칠 때마다 테스트가 깨지면 문서를 안 고치게 된다.
 */
const scope = readFileSync(new URL('../../docs/game-scope.md', import.meta.url), 'utf8');
const supportReference = readFileSync(new URL('../../docs/support-skill-reference.md', import.meta.url), 'utf8');

describe('docs/game-scope.md', () => {
  it('보조형스킬 21종이 전부 실려 있다', () => {
    const missing = SUPPORTS.filter((support) => !scope.includes(support.name)).map((s) => s.name);

    expect(missing).toEqual([]);
  });

  it('무기와 강화기술 이름이 전부 실려 있다', () => {
    const missing = WEAPON_IDS.flatMap((id) => {
      const weapon = weaponOf(id);
      return [weapon.name, weapon.basic.name, ...basicSkillsOf(weapon).map((skill) => skill.name)]
        .filter((name) => !scope.includes(name));
    });

    expect(missing).toEqual([]);
  });

  it('문서가 세는 종수와 실제 종수가 같다', () => {
    const primary = SUPPORTS.filter((s) => s.slotType === 'primary').length;
    const synergy = SUPPORTS.length - primary;

    // 문서에 적어 둔 `보조 15 + 연계 6` 같은 문장이 데이터와 어긋나면 여기서 걸린다.
    expect(scope).toContain(`보조형스킬 ${SUPPORTS.length}종`);
    expect(scope).toContain(`보조 ${primary} + 연계 ${synergy}`);
  });
});

describe('docs/support-skill-reference.md', () => {
  it('보조형스킬 21종이 전부 실려 있다', () => {
    const missing = SUPPORTS.filter((support) => !supportReference.includes(support.name)).map((s) => s.name);

    expect(missing).toEqual([]);
  });

  it('무기와 강화기술 이름이 전부 실려 있다', () => {
    const missing = WEAPON_IDS.flatMap((id) => {
      const weapon = weaponOf(id);
      return [weapon.name, ...basicSkillsOf(weapon).map((skill) => skill.name)]
        .filter((name) => !supportReference.includes(name));
    });

    expect(missing).toEqual([]);
  });
});
