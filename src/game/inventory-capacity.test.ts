import { describe, expect, it } from 'vitest';
import { INVENTORY_SIZE, ownedItems, reconcileLayout, createEmptyLayout } from '@/game/inventory';
import { createInitialProgress, unlockWeapons, unlockBasicSkills, unlockSupports, unlockKeys } from '@/game/progression';
import { WEAPON_IDS, basicSkillsOf } from '@/data/weapons';
import { SUPPORTS } from '@/data/supports';
import { KEYS } from '@/data/keys';

/**
 * 인벤토리 칸이 모자라지 않는지 고정한다.
 *
 * **버리는 기능이 없다.** 기획 판단으로 아이템을 버리거나 파괴할 수 없게 했고,
 * 페이지도 두지 않았다. 그 전제는 "게임에 있는 것을 다 모아도 칸이 남는다"이다.
 *
 * 지금은 여유가 있지만 보조형스킬이 늘면 언젠가 넘친다. 그때 `reconcileLayout`은
 * **조용히 건너뛴다** — 보유 목록에는 있는데 격자에 안 보이고, 그래서 장착도 못 한다.
 * 화면에 아무 말도 안 뜨므로 버그로 보이지도 않는다.
 *
 * 그 순간을 런타임이 아니라 **여기서** 걸리게 한다. 이 테스트가 깨지면 칸을 늘리거나
 * 페이지를 넣을 때가 온 것이다.
 */
describe('인벤토리 수용량', () => {
  const everything = () => {
    let progress = unlockWeapons(createInitialProgress(), [...WEAPON_IDS]);
    progress = unlockBasicSkills(progress, WEAPON_IDS.flatMap((id) => basicSkillsOf(id).map((skill) => skill.id)));
    progress = unlockSupports(progress, SUPPORTS.map((s) => s.id));
    return unlockKeys(progress, KEYS.map((k) => k.id));
  };

  it('전부 모아도 칸이 남는다', () => {
    const items = ownedItems(everything());

    expect(items.length, `보유 가능한 최대 ${items.length}개 > 칸 ${INVENTORY_SIZE}개`)
      .toBeLessThanOrEqual(INVENTORY_SIZE);
  });

  it('전부 모으면 하나도 빠짐없이 격자에 들어간다', () => {
    const progress = everything();
    const layout = reconcileLayout(progress, createEmptyLayout());
    const placed = new Set(layout.filter((id): id is string => id !== null));

    const missing = ownedItems(progress).filter((item) => !placed.has(item.id)).map((i) => i.name);
    expect(missing, '격자에 못 들어간 항목이 있다').toEqual([]);
  });
});
