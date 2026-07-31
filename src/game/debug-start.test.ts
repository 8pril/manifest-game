import { describe, expect, it } from 'vitest';
import { parseDebugStart } from './debug-start';

describe('parseDebugStart', () => {
  it('URL 파라미터로 시작 무기와 방을 지정한다', () => {
    expect(parseDebugStart('?left=bow&right=arcane&wave=4', 5)).toEqual({
      left: 'bow',
      right: 'arcane',
      roomIndex: 3,
    });
  });

  it('right=none은 오른손 비우기로 해석한다', () => {
    expect(parseDebugStart('?left=shield&right=none', 5)).toEqual({
      left: 'shield',
      right: null,
      roomIndex: undefined,
    });
  });

  it('잘못된 값은 무시한다', () => {
    expect(parseDebugStart('?left=axe&right=laser&wave=99', 5)).toEqual({
      left: undefined,
      right: undefined,
      roomIndex: undefined,
    });
  });
});
