import { describe, expect, it } from 'vitest';
import {
  createEmptyLayout,
  reconcileLayout,
  autoSortLayout,
  swapCells,
  cellsOf,
  ownedItems,
  INVENTORY_SIZE,
} from './inventory';
import { createInitialProgress, unlockWeapons, unlockSupports, unlockBasicSkills } from './progression';

const withAll = () =>
  unlockSupports(
    unlockBasicSkills(unlockWeapons(createInitialProgress(), ['bow', 'shield']), [
      'thrust',
      'scattershot',
      'shield-slam',
    ]),
    ['multiple-projectiles', 'fracture-resonance'],
  );

describe('보유 항목', () => {
  it('시작에는 검 하나뿐이다', () => {
    // **기본스킬은 무기에 딸려 오지 않는다.** 검을 들고 시작해도 찌르기는 첫 보스가
    // 떨어뜨린 것을 주워야 생긴다.
    const items = ownedItems(createInitialProgress());

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'weapon', id: 'sword' });
  });

  it('무기만 얻고 기본스킬을 안 주웠으면 인벤토리에 없다', () => {
    const items = ownedItems(unlockWeapons(createInitialProgress(), ['bow']));

    expect(items.filter((i) => i.kind === 'skill')).toEqual([]);
  });

  it('무기 → 기본스킬 → 보조형스킬 순서로 온다', () => {
    const items = ownedItems(withAll());

    expect(items.map((i) => i.kind)).toEqual([
      'weapon', 'weapon', 'weapon',
      'skill', 'skill', 'skill',
      'support', 'support',
    ]);
  });

  it('보조형스킬은 보조/연계 구분을 들고 온다', () => {
    const items = ownedItems(withAll());
    const synergy = items.find((i) => i.id === 'fracture-resonance');
    const multi = items.find((i) => i.id === 'multiple-projectiles');

    expect(synergy).toMatchObject({ kind: 'support', slot: 'synergy' });
    expect(multi).toMatchObject({ kind: 'support', slot: 'primary' });
  });
});

describe('배치 정리', () => {
  it('빈 배치에 보유한 것을 앞에서부터 채운다', () => {
    const layout = reconcileLayout(withAll(), createEmptyLayout());

    // 무기 → 기본스킬 → 보조형스킬. 보조형 안에서는 `data/supports.ts` 정의 순서다.
    expect(layout.slice(0, 8)).toEqual([
      'sword', 'bow', 'shield',
      'thrust', 'scattershot', 'shield-slam',
      'multiple-projectiles', 'fracture-resonance',
    ]);
    expect(layout).toHaveLength(INVENTORY_SIZE);
  });

  it('사람이 옮겨 놓은 위치는 유지한다', () => {
    // 드래그앤드롭으로 옮긴 자리가 보상 하나 받았다고 흐트러지면 안 된다.
    const saved = [...createEmptyLayout()];
    saved[20] = 'sword';
    const layout = reconcileLayout(withAll(), saved);

    expect(layout[20]).toBe('sword');
    expect(layout.indexOf('bow')).toBe(0);
  });

  it('보유하지 않은 것은 지운다', () => {
    const saved = [...createEmptyLayout()];
    saved[0] = 'arcane';
    const layout = reconcileLayout(createInitialProgress(), saved);

    expect(layout).not.toContain('arcane');
  });

  it('중복은 하나만 남긴다', () => {
    // 저장이 손상돼 같은 것이 두 칸에 보이면 드래그가 꼬인다.
    const saved = [...createEmptyLayout()];
    saved[0] = 'sword';
    saved[5] = 'sword';
    const layout = reconcileLayout(createInitialProgress(), saved);

    expect(layout.filter((id) => id === 'sword')).toHaveLength(1);
  });
});

describe('자동정렬', () => {
  it('표준 순서로 앞에서부터 다시 채운다', () => {
    const layout = autoSortLayout(withAll());

    expect(layout.slice(0, 8)).toEqual([
      'sword', 'bow', 'shield',
      'thrust', 'scattershot', 'shield-slam',
      'multiple-projectiles', 'fracture-resonance',
    ]);
    expect(layout[8]).toBeNull();
  });
});

describe('기본스킬', () => {
  it('주운 기본스킬만 격자에 나타난다', () => {
    const progress = withAll();
    const cells = cellsOf(progress, reconcileLayout(progress, createEmptyLayout()), 'skill');

    expect(cells.filter((c) => c.item !== null && c.matchesFilter).map((c) => c.item!.id)).toEqual([
      'thrust',
      'scattershot',
      'shield-slam',
    ]);
  });

  it('기본스킬은 어느 무기 것인지를 들고 온다', () => {
    // 첫 소켓은 자기 무기 것만 받는다. 활에서 멸검이 나가면 그림도 소리도 안 맞는다.
    const item = ownedItems(withAll()).find((i) => i.id === 'scattershot');

    expect(item).toMatchObject({ kind: 'skill', weapon: 'bow', name: '산탄' });
  });
});

describe('칸 이동', () => {
  it('두 칸을 맞바꾼다', () => {
    const layout = reconcileLayout(withAll(), createEmptyLayout());
    const moved = swapCells(layout, 0, 30);

    expect(moved[30]).toBe('sword');
    expect(moved[0]).toBeNull();
  });

  it('범위 밖이면 아무 일도 없다', () => {
    const layout = reconcileLayout(withAll(), createEmptyLayout());

    expect(swapCells(layout, 0, -1)).toBe(layout);
    expect(swapCells(layout, 0, INVENTORY_SIZE)).toBe(layout);
    expect(swapCells(layout, 3, 3)).toBe(layout);
  });
});

describe('필터', () => {
  it('무기만 남긴다', () => {
    const progress = withAll();
    const cells = cellsOf(progress, reconcileLayout(progress, createEmptyLayout()), 'weapon');

    expect(cells.filter((c) => c.matchesFilter && c.item !== null).map((c) => c.item!.id)).toEqual(['sword', 'bow', 'shield']);
    expect(cells.find((c) => c.item?.id === 'thrust')?.matchesFilter).toBe(false);
  });

  it('보조형스킬만 남긴다', () => {
    const progress = withAll();
    const cells = cellsOf(progress, reconcileLayout(progress, createEmptyLayout()), 'support');

    expect(cells.filter((c) => c.matchesFilter && c.item !== null).map((c) => c.item!.id)).toEqual([
      'multiple-projectiles',
      'fracture-resonance',
    ]);
    expect(cells.find((c) => c.item?.id === 'sword')?.matchesFilter).toBe(false);
  });

  it('필터가 걸려도 칸 위치는 그대로다', () => {
    // 필터는 자리를 유지하고 일치 여부만 표시한다. 자리를 당겨오면 드래그 대상이 어긋난다.
    const progress = withAll();
    const layout = reconcileLayout(progress, createEmptyLayout());
    const cells = cellsOf(progress, layout, 'support');

    expect(cells[0]).toMatchObject({ item: { id: 'sword' }, matchesFilter: false });
    expect(cells[6]).toMatchObject({ item: { id: 'multiple-projectiles' }, matchesFilter: true });
  });
});
