import { describe, expect, it } from 'vitest';
import { parseDebugStart } from './debug-start';

describe('parseDebugStart', () => {
  it('URL 파라미터로 시작 무기와 방을 지정한다', () => {
    expect(parseDebugStart('?left=bow&right=arcane&wave=4', 5)).toEqual({
      left: 'bow',
      right: 'arcane',
      roomIndex: 3,
      town: false,
      combo: null,
    });
  });

  it('right=none은 오른손 비우기로 해석한다', () => {
    expect(parseDebugStart('?left=shield&right=none', 5)).toEqual({
      left: 'shield',
      right: null,
      roomIndex: undefined,
      town: false,
      combo: null,
    });
  });

  it('잘못된 값은 무시한다', () => {
    expect(parseDebugStart('?left=axe&right=laser&wave=99', 5)).toEqual({
      left: undefined,
      right: undefined,
      roomIndex: undefined,
      town: false,
      combo: null,
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
      combo: null,
    });
  });

  it('없으면 꺼진다', () => {
    expect(parseDebugStart('?wave=2', 5).town).toBe(false);
  });
});

describe('콤보 빌드 파라미터', () => {
  // 콤보는 첫 보스 보상을 마을에서 붙여야 켜진다. 콤보 유무를 비교하려면 매번
  // 방 두 개를 클리어해야 해서, 검증과 플레이 테스트 양쪽에서 비용이 크다.
  it('?combo=1 이면 기본 보조가 켜진다', () => {
    expect(parseDebugStart('?combo=1', 5).combo).toBe('combo-imprint');
  });

  it('?combo 만 있어도 켜진다', () => {
    expect(parseDebugStart('?combo', 5).combo).toBe('combo-imprint');
  });

  it('보조 id를 직접 줄 수 있다', () => {
    // 콤보 계열이 셋이고 조건이 각자 달라 어느 것을 볼지 골라야 한다.
    expect(parseDebugStart('?combo=combo-release', 5).combo).toBe('combo-release');
    expect(parseDebugStart('?combo=linked-momentum', 5).combo).toBe('linked-momentum');
  });

  it('모르는 id는 기본 보조로 떨어진다', () => {
    expect(parseDebugStart('?combo=nope', 5).combo).toBe('combo-imprint');
  });

  it('?combo=0 이면 꺼진다', () => {
    expect(parseDebugStart('?combo=0', 5).combo).toBeNull();
  });

  it('없으면 꺼진다', () => {
    expect(parseDebugStart('?wave=2', 5).combo).toBeNull();
  });

  it('다른 파라미터와 함께 쓸 수 있다', () => {
    const parsed = parseDebugStart('?wave=3&left=bow&combo=1', 5);
    expect(parsed).toEqual({ left: 'bow', right: undefined, roomIndex: 2, town: false, combo: 'combo-imprint' });
  });
});
