import { describe, expect, it } from 'vitest';
import { parseDebugStart } from './debug-start';

describe('parseDebugStart', () => {
  it('URL 파라미터로 시작 무기와 방을 지정한다', () => {
    expect(parseDebugStart('?left=bow&right=arcane&wave=4', 5)).toEqual({
      left: 'bow',
      right: 'arcane',
      roomIndex: 3,
      town: false,
    });
  });

  it('right=none은 오른손 비우기로 해석한다', () => {
    expect(parseDebugStart('?left=shield&right=none', 5)).toEqual({
      left: 'shield',
      right: null,
      roomIndex: undefined,
      town: false,
    });
  });

  it('잘못된 값은 무시한다', () => {
    expect(parseDebugStart('?left=axe&right=laser&wave=99', 5)).toEqual({
      left: undefined,
      right: undefined,
      roomIndex: undefined,
      town: false,
    });
  });
});

describe('마을 진입 파라미터', () => {
  it('?town=1 이면 마을에서 시작한다', () => {
    expect(parseDebugStart('?town=1', 5).town).toBe(true);
  });

  it('?town 만 있어도 켜진다', () => {
    expect(parseDebugStart('?town', 5).town).toBe(true);
  });

  it('?town=0 이면 꺼진다', () => {
    expect(parseDebugStart('?town=0', 5).town).toBe(false);
  });

  it('?town=1 이면 wave보다 마을 진입을 우선한다', () => {
    expect(parseDebugStart('?town=1&wave=4', 5)).toEqual({
      left: undefined,
      right: undefined,
      roomIndex: undefined,
      town: true,
    });
  });

  it('없으면 꺼진다', () => {
    expect(parseDebugStart('?wave=2', 5).town).toBe(false);
  });
});
