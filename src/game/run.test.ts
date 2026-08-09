import { describe, it, expect } from 'vitest';
import {
  createRun,
  clearRoom,
  collectRoomReward,
  leaveTown,
  damagePlayer,
  retryCurrentRoom,
  addKill,
  advanceTime,
  isOver,
  isVulnerable,
  PLAYER_MAX_HP,
  SHIELD_ENERGY_MAX,
  INVULNERABLE_SECONDS,
} from '@/game/run';
import { TOTAL_ROOMS } from '@/game/rooms';
import { totalSupports, supportsFor } from '@/game/loadout';
import { createLoadout } from '@/game/loadout';
import { configureManifestation, createInitialProgress, setWheelSlot, unlockBasicSkills, unlockSupports, unlockWeaponSwitch, unlockWeapons } from '@/game/progression';

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

  it('저장된 진행이 있으면 보유는 이어받고 손은 초기값으로 시작한다', () => {
    // 예전에는 저장된 active 까지 그대로 이어받았다. 그러면 두 번째 판부터
    // "검 1종으로 시작해 첫 보스에서 무기를 얻는다"는 도입부가 사라진다.
    const progress = {
      ...unlockWeaponSwitch(unlockWeapons(createInitialProgress(), ['bow', 'shield'])),
      active: { left: 'shield' as const, right: 'bow' as const },
    };
    const run = createRun('sword', null, progress);

    expect(run.progress.unlockedWeapons).toEqual(['sword', 'bow', 'shield']);
    expect(run.progress.weaponSwitchUnlocked).toBe(true);
    expect(run.loadout.left).toBe('sword');
    expect(run.loadout.right).toBeNull();
  });

  it('방패 보호막은 최대치로 시작한다', () => {
    expect(createRun('shield', null).shieldEnergy).toBe(SHIELD_ENERGY_MAX);
  });
});

describe('clearRoom', () => {
  it('방을 정리하면 선택 없이 다음 전투로 간다', () => {
    const damaged = damagePlayer(createRun('shield', null), 20);
    const run = clearRoom(damaged);
    expect(run.phase).toBe('combat');
    expect(run.roomIndex).toBe(1);
    // 기획상 아이템 드랍은 보스킬에만 있다. 첫 방은 조작 학습만 맡는다.
    expect(run.progress.ownedSupports).toEqual([]);
    expect(run.shieldEnergy).toBe(SHIELD_ENERGY_MAX);
  });

  it('첫 보스를 정리하면 활/방패와 무기 교체를 해금하고 마을로 들어간다', () => {
    const atFirstBoss = clearRoom(createRun('sword', null));
    const town = clearRoom(atFirstBoss);

    expect(town.phase).toBe('town');
    expect(town.roomIndex).toBe(1);
    expect(town.progress.unlockedWeapons).toEqual(['sword', 'bow', 'shield']);
    // `강화 개방`은 강화기술 전환을 여는 열쇠라 첫 보스가 준다. 나머지 보조형스킬은 여전히 없다.
    // 확정 보조형스킬은 없다. 무작위 드랍은 주워야 들어온다.
    expect(town.progress.ownedSupports).toEqual([]);
    expect(town.progress.weaponSwitchUnlocked).toBe(true);
    expect(town.progress.wheel.left).toEqual(['sword', 'shield']);
    expect(town.progress.wheel.right).toEqual([null, null]);
    expect(town.progress.active).toEqual({ left: 'sword', right: null });
    expect(supportsFor(town.loadout, 'volley')).toEqual([]);
    expect(supportsFor(town.loadout, 'annihilation')).toEqual([]);
    expect(supportsFor(town.loadout, 'fracture-wave')).toEqual([]);
  });

  it('마지막 웨이브를 정리하면 승리한다', () => {
    const run = clearRoom(advanceWaves(TOTAL_ROOMS - 1));
    expect(run.phase).toBe('won');
  });

  it('마지막 보스 무기 보상은 승리 상태의 보유 목록에 남는다', () => {
    const run = clearRoom(advanceWaves(TOTAL_ROOMS - 1));

    expect(run.phase).toBe('won');
    expect(run.progress.unlockedWeapons).toContain('arcane');
    // 보조/연계 랜덤 드랍은 화면 드랍 생성 시점에 확정된다.
    expect(run.progress.ownedSupports).toEqual([]);
  });

  it('전투 중이 아니면 아무 일도 하지 않는다', () => {
    const town = clearRoom(clearRoom(newRun()));
    expect(clearRoom(town)).toBe(town);
  });
});

describe('collectRoomReward', () => {
  it('방 이동 없이 보상만 먼저 적용한다', () => {
    const run = createRun('sword', null);
    const reward = { weapons: ['bow' as const], supports: ['multiple-projectiles'] };
    const collected = collectRoomReward(run, reward);

    expect(collected.phase).toBe('combat');
    expect(collected.roomIndex).toBe(0);
    expect(collected.progress.unlockedWeapons).toContain('bow');
    expect(collected.progress.ownedSupports).toContain('multiple-projectiles');
    expect(collected.gained).toEqual({ weapons: ['bow'], basicSkills: [], supports: ['multiple-projectiles'], keys: [] });
  });

  it('이미 가진 보상은 gained에 다시 표시하지 않는다', () => {
    let run = createRun('sword', null);
    const reward = { weapons: ['bow' as const] };
    run = collectRoomReward(run, reward);
    const again = collectRoomReward(run, reward);

    expect(again.gained).toEqual({ weapons: ['bow'], basicSkills: [], supports: [], keys: [] });
    expect(again.progress.unlockedWeapons.filter((id) => id === 'bow')).toHaveLength(1);
  });

  it('여러 드랍 아이템을 따로 주워도 gained를 누적한다', () => {
    let run = createRun('sword', null);
    run = collectRoomReward(run, { weapons: ['bow'] });
    run = collectRoomReward(run, { supports: ['multiple-projectiles'] });

    expect(run.gained).toEqual({ weapons: ['bow'], basicSkills: [], supports: ['multiple-projectiles'], keys: [] });
  });
});

describe('leaveTown', () => {
  it('마을을 나와 다음 전투 방으로 간다', () => {
    const town = clearRoom(clearRoom(createRun('sword', null)));
    const next = leaveTown(town);

    expect(next.phase).toBe('combat');
    expect(next.roomIndex).toBe(2);
    expect(next.progress.active).toEqual({ left: 'sword', right: null });
    expect(next.loadout.left).toBe('sword');
    expect(next.loadout.right).toBeNull();
  });

  it('마을에서 오른손 1번 후보를 고르면 다음 전투에서 오른손에 든다', () => {
    const town = clearRoom(clearRoom(createRun('sword', null)));
    const configured = { ...town, progress: setWheelSlot(town.progress, 'right', 0, 'bow') };
    const next = leaveTown(configured);

    expect(next.progress.active).toEqual({ left: 'sword', right: 'bow' });
    expect(next.loadout.right).toBe('bow');
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

  it('방패 보호가 활성화되어 있으면 보호막이 체력보다 먼저 소모된다', () => {
    const run = damagePlayer(createRun('shield', null), 30, true);

    expect(run.hp).toBe(PLAYER_MAX_HP);
    expect(run.shieldEnergy).toBe(SHIELD_ENERGY_MAX - 30);
  });

  it('방패를 들고 있어도 보호가 활성화되지 않았으면 체력으로 피해를 받는다', () => {
    const run = damagePlayer(createRun('shield', null), 30);

    expect(run.hp).toBe(PLAYER_MAX_HP - 30);
    expect(run.shieldEnergy).toBe(SHIELD_ENERGY_MAX);
  });

  it('방패 보호막이 부족하면 남은 피해만 체력에 들어간다', () => {
    let run = damagePlayer(createRun('shield', null), SHIELD_ENERGY_MAX - 5, true);
    run = advanceTime(run, INVULNERABLE_SECONDS);
    run = damagePlayer(run, 20, true);

    expect(run.shieldEnergy).toBe(0);
    expect(run.hp).toBe(PLAYER_MAX_HP - 15);
  });

  it('방패를 내려놓으면 남은 보호막이 있어도 체력으로 피해를 받는다', () => {
    let run = damagePlayer(createRun('shield', null), 20, true);
    run = advanceTime(run, INVULNERABLE_SECONDS);
    run = { ...run, loadout: createLoadout('sword', 'bow') };
    const withoutShield = damagePlayer(run, 10, false);

    expect(withoutShield.hp).toBe(PLAYER_MAX_HP - 10);
    expect(withoutShield.shieldEnergy).toBe(SHIELD_ENERGY_MAX - 20);
  });

  it('방패를 다시 들어도 보호막은 자동으로 차지 않는다', () => {
    let run = damagePlayer(createRun('shield', null), 20, true);
    run = advanceTime(run, INVULNERABLE_SECONDS);
    run = { ...run, loadout: createLoadout('sword', 'bow') };
    run = damagePlayer(run, 10);
    run = advanceTime(run, INVULNERABLE_SECONDS);
    run = { ...run, loadout: createLoadout('shield', 'bow') };
    const backToShield = damagePlayer(run, 10, true);

    expect(backToShield.hp).toBe(PLAYER_MAX_HP - 10);
    expect(backToShield.shieldEnergy).toBe(SHIELD_ENERGY_MAX - 30);
  });
});

describe('retryCurrentRoom', () => {
  it('사망하면 같은 방 시작 상태로 되돌린다', () => {
    let run = { ...createRun('sword', null), roomIndex: 4 };
    run = collectRoomReward(run, { keys: ['key-upper'] });
    run = addKill(run);
    run = damagePlayer(run, PLAYER_MAX_HP);

    const retried = retryCurrentRoom(run);

    expect(retried.phase).toBe('combat');
    expect(retried.roomIndex).toBe(4);
    expect(retried.hp).toBe(PLAYER_MAX_HP);
    expect(retried.shieldEnergy).toBe(SHIELD_ENERGY_MAX);
    expect(retried.progress.ownedKeys).toEqual([]);
    expect(retried.kills).toBe(0);
    expect(retried.gained).toBeUndefined();
  });

  it('이미 클리어한 분기 보스 보상은 다음 방에서 죽어도 유지한다', () => {
    let run = { ...createRun('sword', null), roomIndex: 4 };
    run = clearRoom(collectRoomReward(run, { keys: ['key-upper'] }));
    expect(run.roomIndex).toBe(5);
    expect(run.progress.ownedKeys).toContain('key-upper');

    run = collectRoomReward(run, { keys: ['key-lower'] });
    run = damagePlayer(run, PLAYER_MAX_HP);
    const retried = retryCurrentRoom(run);

    expect(retried.roomIndex).toBe(5);
    expect(retried.progress.ownedKeys).toEqual(['key-upper']);
    expect(retried.progress.ownedKeys).not.toContain('key-lower');
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

describe('저장된 진행으로 새 판을 시작할 때', () => {
  it('보유와 세팅은 이어받는다', () => {
    const saved = configureManifestation(
      unlockWeaponSwitch(unlockSupports(unlockWeapons(createInitialProgress(), ['bow', 'shield']), ['earthquake'])),
      'sword',
      { primarySupportId: 'earthquake', synergySupportId: null },
    );

    const run = createRun('sword', null, saved);

    expect(run.progress.unlockedWeapons).toEqual(['sword', 'bow', 'shield']);
    expect(run.progress.ownedSupports).toContain('earthquake');
    expect(run.progress.weaponSwitchUnlocked).toBe(true);
    expect(run.progress.configs.sword.primarySupportId).toBe('earthquake');
  });

  it('손에 든 무기는 이어받지 않는다', () => {
    // 도입부가 "검 1종으로 시작해 첫 보스에서 무기를 얻는다"이므로,
    // 저장된 장착까지 복원하면 두 번째 판부터 그 구조가 사라진다.
    const saved = {
      ...unlockWeapons(createInitialProgress(), ['bow', 'shield']),
      active: { left: 'bow' as const, right: 'shield' as const },
    };

    const run = createRun('sword', null, saved);

    expect(run.progress.active).toEqual({ left: 'sword', right: null });
    expect(run.loadout.left).toBe('sword');
    expect(run.loadout.right).toBeNull();
  });

  it('개발 파라미터로 준 무기는 저장이 있어도 그대로 들린다', () => {
    // 저장된 진행이 인자를 덮어써서 ?left=, ?right= 가 먹지 않던 회귀가 있었다.
    const saved = unlockWeapons(createInitialProgress(), ['bow']);

    const run = createRun('arcane', 'shield', saved);

    expect(run.progress.active).toEqual({ left: 'arcane', right: 'shield' });
    expect(run.progress.unlockedWeapons).toContain('arcane');
    expect(run.progress.unlockedWeapons).toContain('shield');
  });
});

describe('이미 가진 보상은 다시 획득으로 세지 않는다', () => {
  const firstBossIndex = 1;
  const atFirstBoss = (progress: ReturnType<typeof createInitialProgress>) => ({
    ...createRun('sword', null, progress),
    roomIndex: firstBossIndex,
  });

  it('처음 만나면 새로 얻은 것으로 집계된다', () => {
    const run = clearRoom(atFirstBoss(createInitialProgress()));

    expect(run.gained?.weapons).toEqual(['bow', 'shield']);
    expect(run.gained?.supports).toEqual([]);
  });

  it('이미 다 가지고 있으면 새로 얻은 것이 없다', () => {
    // 저장이 있는 두 번째 판. 같은 보상을 또 받지만 실제로 늘어나는 것은 없다.
    const owned = unlockBasicSkills(unlockWeapons(createInitialProgress(), ['bow', 'shield']), [
      'thrust',
      'scattershot',
      'shield-slam',
    ]);

    const run = clearRoom(atFirstBoss(owned));

    expect(run.gained).toBeUndefined();
  });

  it('일부만 가진 경우 나머지만 남는다', () => {
    const owned = unlockWeapons(createInitialProgress(), ['bow']);

    const run = clearRoom(atFirstBoss(owned));

    expect(run.gained?.weapons).toEqual(['shield']);
  });

  it('보상이 없는 방은 새로 얻은 것도 없다', () => {
    const run = clearRoom({ ...createRun('sword', null), roomIndex: 2 });

    expect(run.gained).toBeUndefined();
  });
});
