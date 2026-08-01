import { describe, it, expect } from 'vitest';
import {
  createRun,
  clearRoom,
  leaveTown,
  damagePlayer,
  addKill,
  advanceTime,
  isOver,
  isVulnerable,
  PLAYER_MAX_HP,
  INVULNERABLE_SECONDS,
} from '@/game/run';
import { TOTAL_ROOMS } from '@/game/rooms';
import { totalSupports, supportsFor } from '@/game/loadout';

const newRun = () => createRun('sword', 'bow');

/** 방을 n번 정리한다. 마을은 다음 전투로 나간다. */
function advanceWaves(count: number) {
  let run = newRun();
  for (let i = 0; i < count; i++) {
    run = clearRoom(run);
    if (run.phase === 'town') run = leaveTown(run);
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

  it('활성 무기를 진행 상태의 보유 무기로 기록한다', () => {
    const run = newRun();
    expect(run.progress.unlockedWeapons).toEqual(['sword', 'bow']);
  });
});

describe('clearRoom', () => {
  it('방을 정리하면 선택 없이 다음 전투로 간다', () => {
    const run = clearRoom(newRun());
    expect(run.phase).toBe('combat');
    expect(run.roomIndex).toBe(1);
  });

  it('첫 보스를 정리하면 활/방패와 무기 교체를 해금하고 마을로 들어간다', () => {
    const atFirstBoss = clearRoom(newRun());
    const town = clearRoom(atFirstBoss);

    expect(town.phase).toBe('town');
    expect(town.roomIndex).toBe(1);
    expect(town.progress.unlockedWeapons).toEqual(['sword', 'bow', 'shield']);
    expect(town.progress.ownedComboSkills).toEqual(['annihilation', 'volley', 'fracture-wave']);
    expect(town.progress.ownedSupports).toEqual([
      'earthquake',
      'wound-resonance',
      'multiple-projectiles',
      'wound-seeker',
      'dragging-ground',
      'fracture-resonance',
    ]);
    expect(town.progress.weaponSwitchUnlocked).toBe(true);
    expect(town.progress.wheel.left).toEqual(['sword', 'shield']);
    expect(town.progress.wheel.right).toEqual(['bow', null]);
    expect(supportsFor(town.loadout, 'volley')).toEqual([]);
    expect(supportsFor(town.loadout, 'annihilation')).toEqual([]);
    expect(supportsFor(town.loadout, 'fracture-wave')).toEqual([]);
  });

  it('마지막 웨이브를 정리하면 승리한다', () => {
    const run = clearRoom(advanceWaves(TOTAL_ROOMS - 1));
    expect(run.phase).toBe('won');
  });

  it('마지막 보스 보상은 승리 상태의 보유 목록에 남는다', () => {
    const run = clearRoom(advanceWaves(TOTAL_ROOMS - 1));

    expect(run.phase).toBe('won');
    expect(run.progress.unlockedWeapons).toContain('arcane');
    expect(run.progress.ownedComboSkills).toContain('arcane-daggers');
    expect(run.progress.ownedSupports).toEqual([
      'earthquake',
      'wound-resonance',
      'multiple-projectiles',
      'wound-seeker',
      'dragging-ground',
      'fracture-resonance',
      'chain',
      'crackling-ground',
    ]);
  });

  it('전투 중이 아니면 아무 일도 하지 않는다', () => {
    const town = clearRoom(clearRoom(newRun()));
    expect(clearRoom(town)).toBe(town);
  });
});

describe('leaveTown', () => {
  it('마을을 나와 다음 전투 방으로 간다', () => {
    const town = clearRoom(clearRoom(newRun()));
    const next = leaveTown(town);

    expect(next.phase).toBe('combat');
    expect(next.roomIndex).toBe(2);
  });

  it('마을이 아니면 아무 일도 하지 않는다', () => {
    const run = newRun();
    expect(leaveTown(run)).toBe(run);
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

  it('이미 패배한 뒤에는 상태가 바뀌지 않는다', () => {
    const lost = damagePlayer(newRun(), PLAYER_MAX_HP);
    expect(damagePlayer(lost, 10)).toBe(lost);
  });
});

describe('advanceTime', () => {
  it('전투 중에만 시간이 흐른다', () => {
    expect(advanceTime(newRun(), 1.5).elapsed).toBe(1.5);
    const town = clearRoom(clearRoom(newRun()));
    expect(advanceTime(town, 1.5)).toBe(town);
  });
});

describe('addKill / isOver', () => {
  it('처치 수가 누적된다', () => {
    expect(addKill(addKill(newRun())).kills).toBe(2);
  });

  it('승리와 패배만 종료 상태다', () => {
    expect(isOver(newRun())).toBe(false);
    expect(isOver(clearRoom(newRun()))).toBe(false);
    expect(isOver(damagePlayer(newRun(), PLAYER_MAX_HP))).toBe(true);
    expect(isOver(clearRoom(advanceWaves(TOTAL_ROOMS - 1)))).toBe(true);
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
