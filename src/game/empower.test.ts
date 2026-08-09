import { describe, expect, it } from 'vitest';
import { grantEmpower, empowerMore, spendEmpower, tickEmpower } from './empower';

describe('손 강화', () => {
  it('건 손에만 걸린다', () => {
    const state = grantEmpower({}, 'right', { more: 0.8, hits: 3 });

    expect(empowerMore(state, 'right')).toBe(0.8);
    expect(empowerMore(state, 'left')).toBe(0);
  });

  it('횟수를 다 쓰면 사라진다', () => {
    let state = grantEmpower({}, 'right', { more: 0.8, hits: 2 });
    state = spendEmpower(state, 'right');
    expect(empowerMore(state, 'right')).toBe(0.8);

    state = spendEmpower(state, 'right');
    expect(empowerMore(state, 'right')).toBe(0);
  });

  it('시간이 다하면 사라진다', () => {
    let state = grantEmpower({}, 'left', { more: 0.3, seconds: 6 });
    state = tickEmpower(state, 5);
    expect(empowerMore(state, 'left')).toBe(0.3);

    state = tickEmpower(state, 1.1);
    expect(empowerMore(state, 'left')).toBe(0);
  });

  it('횟수와 시간이 둘 다 있으면 먼저 닿는 쪽에서 끝난다', () => {
    // 3회 또는 6초인데 2초 만에 3대를 쳤다면 거기서 끝나야 한다.
    let state = grantEmpower({}, 'right', { more: 0.8, hits: 3, seconds: 6 });
    state = tickEmpower(state, 2);
    for (let i = 0; i < 3; i++) state = spendEmpower(state, 'right');

    expect(empowerMore(state, 'right')).toBe(0);
  });

  it('횟수 제한이 없으면 때려도 줄지 않는다', () => {
    // `합계 N 이상인 동안` 같은 지속형은 조건이 깨질 때 꺼지지 횟수로 닳지 않는다.
    let state = grantEmpower({}, 'left', { more: 0.3 });
    state = spendEmpower(state, 'left');
    state = spendEmpower(state, 'left');

    expect(empowerMore(state, 'left')).toBe(0.3);
  });

  it('다시 걸면 덮어쓴다', () => {
    // 겹쳐 쌓이면 콤보를 모아뒀다가 한 번에 터뜨리는 것이 항상 이득이 되어,
    // 조건을 채우는 재미가 아니라 참는 재미가 된다.
    let state = grantEmpower({}, 'right', { more: 0.8, hits: 1 });
    state = grantEmpower(state, 'right', { more: 0.8, hits: 3 });

    expect(state.right?.hitsLeft).toBe(3);
    expect(empowerMore(state, 'right')).toBe(0.8);
  });
});
