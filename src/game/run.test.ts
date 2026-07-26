import { describe, it, expect } from 'vitest';
import {
  createRun,
  clearWave,
  pickSupport,
  damagePlayer,
  addKill,
  advanceTime,
  isOver,
  isVulnerable,
  PLAYER_MAX_HP,
  INVULNERABLE_SECONDS,
} from '@/game/run';
import { TOTAL_WAVES } from '@/game/waves';
import { SUPPORTS } from '@/data/supports';

const anySupport = SUPPORTS[0];

/** 웨이브를 n번 정리하고 매번 보조능력을 골라 진행시킨다. */
function advanceWaves(count: number) {
  let run = createRun();
  for (let i = 0; i < count; i++) {
    run = clearWave(run, true);
    if (run.phase === 'offer') run = pickSupport(run, anySupport);
  }
  return run;
}

describe('createRun', () => {
  it('첫 웨이브 전투 상태로 시작한다', () => {
    const run = createRun();
    expect(run.phase).toBe('combat');
    expect(run.waveIndex).toBe(0);
    expect(run.hp).toBe(PLAYER_MAX_HP);
    expect(run.attached).toHaveLength(0);
  });
});

describe('clearWave', () => {
  it('웨이브를 정리하면 보조능력 선택으로 넘어간다', () => {
    const run = clearWave(createRun(), true);
    expect(run.phase).toBe('offer');
    // 선택하기 전에는 웨이브가 넘어가지 않는다
    expect(run.waveIndex).toBe(0);
  });

  it('보조능력을 주지 않는 웨이브는 선택 없이 다음으로 간다', () => {
    const run = clearWave(createRun(), false);
    expect(run.phase).toBe('combat');
    expect(run.waveIndex).toBe(1);
  });

  it('마지막 웨이브를 정리하면 승리한다', () => {
    const run = clearWave(advanceWaves(TOTAL_WAVES - 1), false);
    expect(run.phase).toBe('won');
  });

  it('전투 중이 아니면 아무 일도 하지 않는다', () => {
    const offering = clearWave(createRun(), true);
    expect(clearWave(offering, true)).toBe(offering);
  });
});

describe('pickSupport', () => {
  it('고른 보조능력이 장착되고 다음 웨이브로 넘어간다', () => {
    const run = pickSupport(clearWave(createRun(), true), anySupport);
    expect(run.phase).toBe('combat');
    expect(run.waveIndex).toBe(1);
    expect(run.attached).toEqual([anySupport]);
  });

  it('고르지 않고 넘기면 장착 없이 진행한다', () => {
    const run = pickSupport(clearWave(createRun(), true), undefined);
    expect(run.phase).toBe('combat');
    expect(run.waveIndex).toBe(1);
    expect(run.attached).toHaveLength(0);
  });

  it('선택 단계가 아니면 아무 일도 하지 않는다', () => {
    const run = createRun();
    expect(pickSupport(run, anySupport)).toBe(run);
  });

  it('웨이브를 진행하는 동안 보조능력이 누적된다', () => {
    const run = advanceWaves(3);
    expect(run.attached).toHaveLength(3);
    expect(run.waveIndex).toBe(3);
  });
});

describe('damagePlayer', () => {
  it('체력이 깎인다', () => {
    expect(damagePlayer(createRun(), 30).hp).toBe(PLAYER_MAX_HP - 30);
  });

  it('체력이 0이 되면 패배한다', () => {
    const run = damagePlayer(createRun(), PLAYER_MAX_HP);
    expect(run.hp).toBe(0);
    expect(run.phase).toBe('lost');
  });

  it('체력은 음수가 되지 않는다', () => {
    expect(damagePlayer(createRun(), 9999).hp).toBe(0);
  });

  it('보조능력 선택 중에는 피해를 받지 않는다', () => {
    const offering = clearWave(createRun(), true);
    expect(damagePlayer(offering, 50)).toBe(offering);
  });

  it('이미 패배한 뒤에는 상태가 바뀌지 않는다', () => {
    const lost = damagePlayer(createRun(), PLAYER_MAX_HP);
    expect(damagePlayer(lost, 10)).toBe(lost);
  });
});

describe('advanceTime', () => {
  it('전투 중에만 시간이 흐른다', () => {
    expect(advanceTime(createRun(), 1.5).elapsed).toBe(1.5);
    const offering = clearWave(createRun(), true);
    expect(advanceTime(offering, 1.5)).toBe(offering);
  });
});

describe('addKill / isOver', () => {
  it('처치 수가 누적된다', () => {
    expect(addKill(addKill(createRun())).kills).toBe(2);
  });

  it('승리와 패배만 종료 상태다', () => {
    expect(isOver(createRun())).toBe(false);
    expect(isOver(clearWave(createRun(), true))).toBe(false);
    expect(isOver(damagePlayer(createRun(), PLAYER_MAX_HP))).toBe(true);
    expect(isOver(clearWave(advanceWaves(TOTAL_WAVES - 1), false))).toBe(true);
  });
});

describe('무적 시간', () => {
  it('피격 직후에는 추가 피해를 받지 않는다', () => {
    // 적 여러 마리가 동시에 붙어도 한 번의 피해만 들어가야 한다.
    let run = damagePlayer(createRun(), 8);
    expect(run.hp).toBe(PLAYER_MAX_HP - 8);

    run = damagePlayer(run, 8);
    run = damagePlayer(run, 8);
    expect(run.hp).toBe(PLAYER_MAX_HP - 8);
  });

  it('무적 시간이 지나면 다시 피해를 받는다', () => {
    let run = damagePlayer(createRun(), 8);
    run = advanceTime(run, INVULNERABLE_SECONDS);
    run = damagePlayer(run, 8);
    expect(run.hp).toBe(PLAYER_MAX_HP - 16);
  });

  it('적 5마리가 계속 붙어 있어도 즉사하지 않는다', () => {
    // 무적이 없으면 접촉 쿨다운이 적마다 따로 돌아 초당 50 피해가 들어간다.
    let run = createRun();
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
    expect(isVulnerable(createRun())).toBe(true);
    expect(isVulnerable(damagePlayer(createRun(), 8))).toBe(false);
  });
});
