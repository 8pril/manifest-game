import { describe, it, expect } from 'vitest';
import {
  createRun,
  clearRoom,
  pickSupport,
  damagePlayer,
  addKill,
  advanceTime,
  isOver,
  isVulnerable,
  PLAYER_MAX_HP,
  INVULNERABLE_SECONDS,
} from '@/game/run';
import { TOTAL_ROOMS } from '@/game/rooms';
import { SUPPORTS } from '@/data/supports';
import { totalSupports, supportsFor } from '@/game/loadout';

const pierce = SUPPORTS.find((s) => s.id === 'pierce')!;
const anyPick = { support: pierce, skillId: 'arrow-shot' };

const newRun = () => createRun('sword', 'bow');

/** 웨이브를 n번 정리하고 매번 보조능력을 골라 진행시킨다. */
function advanceWaves(count: number) {
  let run = newRun();
  for (let i = 0; i < count; i++) {
    run = clearRoom(run, true);
    if (run.phase === 'offer') run = pickSupport(run, undefined);
  }
  return run;
}

describe('createRun', () => {
  it('첫 웨이브 전투 상태로 시작한다', () => {
    const run = newRun();
    expect(run.phase).toBe('combat');
    expect(run.roomIndex).toBe(0);
    expect(run.hp).toBe(PLAYER_MAX_HP);
    expect(totalSupports(run.loadout)).toBe(0);
  });
});

describe('clearRoom', () => {
  it('웨이브를 정리하면 보조능력 선택으로 넘어간다', () => {
    const run = clearRoom(newRun(), true);
    expect(run.phase).toBe('offer');
    // 선택하기 전에는 웨이브가 넘어가지 않는다
    expect(run.roomIndex).toBe(0);
  });

  it('보조능력을 주지 않는 웨이브는 선택 없이 다음으로 간다', () => {
    const run = clearRoom(newRun(), false);
    expect(run.phase).toBe('combat');
    expect(run.roomIndex).toBe(1);
  });

  it('마지막 웨이브를 정리하면 승리한다', () => {
    const run = clearRoom(advanceWaves(TOTAL_ROOMS - 1), false);
    expect(run.phase).toBe('won');
  });

  it('전투 중이 아니면 아무 일도 하지 않는다', () => {
    const offering = clearRoom(newRun(), true);
    expect(clearRoom(offering, true)).toBe(offering);
  });
});

describe('pickSupport', () => {
  it('고른 보조능력이 지정한 스킬에 장착되고 다음 웨이브로 넘어간다', () => {
    const run = pickSupport(clearRoom(newRun(), true), anyPick);
    expect(run.phase).toBe('combat');
    expect(run.roomIndex).toBe(1);
    expect(supportsFor(run.loadout, 'arrow-shot')).toEqual([pierce]);
    // 다른 스킬에는 붙지 않는다
    expect(supportsFor(run.loadout, 'sword-slash')).toHaveLength(0);
  });

  it('고르지 않고 넘기면 장착 없이 진행한다', () => {
    const run = pickSupport(clearRoom(newRun(), true), undefined);
    expect(run.phase).toBe('combat');
    expect(run.roomIndex).toBe(1);
    expect(totalSupports(run.loadout)).toBe(0);
  });

  it('선택 단계가 아니면 아무 일도 하지 않는다', () => {
    const run = newRun();
    expect(pickSupport(run, anyPick)).toBe(run);
  });

  it('웨이브를 진행하는 동안 보조능력이 누적된다', () => {
    let run = newRun();
    const picks = [
      { support: pierce, skillId: 'arrow-shot' },
      { support: SUPPORTS.find((s) => s.id === 'earthquake')!, skillId: 'annihilation' },
      { support: SUPPORTS.find((s) => s.id === 'added-stacks')!, skillId: 'sword-slash' },
    ];
    for (const pick of picks) {
      run = clearRoom(run, true);
      run = pickSupport(run, pick);
    }
    expect(totalSupports(run.loadout)).toBe(3);
    expect(run.roomIndex).toBe(3);
  });
});

describe('damagePlayer', () => {
  it('체력이 깎인다', () => {
    expect(damagePlayer(newRun(), 30).hp).toBe(PLAYER_MAX_HP - 30);
  });

  it('체력이 0이 되면 패배한다', () => {
    const run = damagePlayer(newRun(), PLAYER_MAX_HP);
    expect(run.hp).toBe(0);
    expect(run.phase).toBe('lost');
  });

  it('체력은 음수가 되지 않는다', () => {
    expect(damagePlayer(newRun(), 9999).hp).toBe(0);
  });

  it('보조능력 선택 중에는 피해를 받지 않는다', () => {
    const offering = clearRoom(newRun(), true);
    expect(damagePlayer(offering, 50)).toBe(offering);
  });

  it('이미 패배한 뒤에는 상태가 바뀌지 않는다', () => {
    const lost = damagePlayer(newRun(), PLAYER_MAX_HP);
    expect(damagePlayer(lost, 10)).toBe(lost);
  });
});

describe('advanceTime', () => {
  it('전투 중에만 시간이 흐른다', () => {
    expect(advanceTime(newRun(), 1.5).elapsed).toBe(1.5);
    const offering = clearRoom(newRun(), true);
    expect(advanceTime(offering, 1.5)).toBe(offering);
  });
});

describe('addKill / isOver', () => {
  it('처치 수가 누적된다', () => {
    expect(addKill(addKill(newRun())).kills).toBe(2);
  });

  it('승리와 패배만 종료 상태다', () => {
    expect(isOver(newRun())).toBe(false);
    expect(isOver(clearRoom(newRun(), true))).toBe(false);
    expect(isOver(damagePlayer(newRun(), PLAYER_MAX_HP))).toBe(true);
    expect(isOver(clearRoom(advanceWaves(TOTAL_ROOMS - 1), false))).toBe(true);
  });
});

describe('무적 시간', () => {
  it('피격 직후에는 추가 피해를 받지 않는다', () => {
    // 적 여러 마리가 동시에 붙어도 한 번의 피해만 들어가야 한다.
    let run = damagePlayer(newRun(), 8);
    expect(run.hp).toBe(PLAYER_MAX_HP - 8);

    run = damagePlayer(run, 8);
    run = damagePlayer(run, 8);
    expect(run.hp).toBe(PLAYER_MAX_HP - 8);
  });

  it('무적 시간이 지나면 다시 피해를 받는다', () => {
    let run = damagePlayer(newRun(), 8);
    run = advanceTime(run, INVULNERABLE_SECONDS);
    run = damagePlayer(run, 8);
    expect(run.hp).toBe(PLAYER_MAX_HP - 16);
  });

  it('적 5마리가 계속 붙어 있어도 즉사하지 않는다', () => {
    // 무적이 없으면 접촉 쿨다운이 적마다 따로 돌아 초당 50 피해가 들어간다.
    let run = newRun();
    const stepSeconds = 1 / 60;

    for (let frame = 0; frame < 60 * 3; frame++) {
      run = advanceTime(run, stepSeconds);
      for (let enemy = 0; enemy < 5; enemy++) {
        run = damagePlayer(run, 8);
      }
    }
    // 3초 동안 최대 5회 피격 = 40 피해
    expect(run.hp).toBeGreaterThan(PLAYER_MAX_HP - 50);
    expect(run.phase).toBe('combat');
  });

  it('isVulnerable이 무적 상태를 알려준다', () => {
    expect(isVulnerable(newRun())).toBe(true);
    expect(isVulnerable(damagePlayer(newRun(), 8))).toBe(false);
  });
});
