import { roomAt, TOTAL_ROOMS, type RoomReward } from '@/game/rooms';
import { loadoutFromProgress, type Loadout } from '@/game/loadout';
import type { WeaponId } from '@/data/weapons';
import {
  createInitialProgress,
  equipFirstWheelSlots,
  setWheelSlot,
  unlockComboSkills,
  unlockSupports,
  unlockWeapons,
  unlockWeaponSwitch,
  type PlayerProgress,
} from '@/game/progression';

/**
 * 한 판(run)의 상태 기계.
 *
 * 렌더링과 분리해 두어 승패 판정과 진행 규칙을 테스트로 고정한다.
 * 상태를 직접 바꾸지 않고 새 상태를 돌려주는 방식이라,
 * 어떤 입력이 어떤 전이를 일으키는지 한눈에 드러난다.
 */

export type RunPhase =
  /** 방 안에서 전투 중. */
  | 'combat'
  /** 비전투 거점에서 장비를 설정하는 중. */
  | 'town'
  /** 보스까지 정리함. */
  | 'won'
  /** 체력이 0이 됨. */
  | 'lost';

export const PLAYER_MAX_HP = 100;
export const SHIELD_ENERGY_MAX = 45;

/**
 * 피격 후 무적 시간(초).
 *
 * 적마다 접촉 쿨다운이 따로 돌면 여러 마리가 동시에 붙었을 때
 * 피해가 그대로 합산되어, 적 5마리에 둘러싸이면 2초 만에 죽는다.
 * 피격 시 짧은 무적을 주어 들어오는 피해의 상한을 만든다.
 */
export const INVULNERABLE_SECONDS = 0.6;

export interface RunState {
  phase: RunPhase;
  /** 현재 방 인덱스. 0부터 시작한다. */
  roomIndex: number;
  hp: number;
  maxHp: number;
  /** 방패 공격으로 보호가 활성화됐을 때 체력보다 먼저 소모되는 방별 보호막. */
  shieldEnergy: number;
  /** 무기 2종과 스킬별 보조능력. */
  loadout: Loadout;
  /** 해금된 무기와 마을 장비 설정. */
  progress: PlayerProgress;
  /** 남은 무적 시간(초). 0이면 피해를 받는다. */
  invulnerable: number;
  /** 처치한 적 수. 결과 화면에 쓴다. */
  kills: number;
  /**
   * 방금 정리한 방에서 **실제로 새로 얻은 것**. 이미 갖고 있던 것은 빠진다.
   * 연출이 방의 `reward`를 그대로 읽으면 두 번째 판에서 거짓말을 하게 된다.
   */
  gained?: RoomReward;
  /** 경과 시간(초). */
  elapsed: number;
}

/**
 * 한 판을 시작한다.
 *
 * 저장된 진행에서 **보유와 세팅은 이어받되 손에 든 무기는 이어받지 않는다.**
 * 이 게임의 도입부는 "검 1종으로 시작해 첫 보스에서 무기를 얻는다"인데,
 * 손에 든 것까지 복원하면 두 번째 판부터 그 구조가 통째로 사라진다.
 * 심사자가 새로고침 한 번만 해도 다른 게임을 보게 된다.
 *
 * 해금·보조형·마을 세팅·링 후보는 그대로 남으므로 영구 성장은 유지된다.
 *
 * 다만 `weaponSwitchUnlocked`까지 이어받으므로, 두 번째 판은 1번 방에서 R 한 번이면
 * 해금된 무기를 바로 꺼낼 수 있다. 손에 든 무기만 초기화한 것으로는 도입부가
 * 반만 지켜진다. 저장 범위를 어디까지 둘지는 `docs/action-tracker.md`의 D1에서
 * 기획 결정을 기다리는 중이다.
 */
export function createRun(left: WeaponId, right: WeaponId | null, savedProgress?: PlayerProgress): RunState {
  const base = savedProgress ?? createInitialProgress();
  const progress = {
    ...unlockWeapons(base, right ? [left, right] : [left]),
    active: { left, right },
  };

  return {
    phase: 'combat',
    roomIndex: 0,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    shieldEnergy: SHIELD_ENERGY_MAX,
    loadout: loadoutFromProgress(progress),
    progress,
    invulnerable: 0,
    kills: 0,
    elapsed: 0,
  };
}

/**
 * 현재 방의 적을 모두 정리했을 때.
 * 마지막 방이었다면 승리, 아니면 다음 방이나 마을로 넘어간다.
 */
export function clearRoom(run: RunState): RunState {
  if (run.phase !== 'combat') return run;

  const room = roomAt(run.roomIndex);
  // 적용 전 상태와 비교해야 실제로 늘어난 것을 알 수 있다. 순서를 바꾸면 안 된다.
  const gained = newPartsOfReward(run.progress, room?.reward) ?? (room?.reward ? run.gained : undefined);
  const rewarded = applyRoomReward(run.progress, room?.reward);
  const isLastRoom = run.roomIndex >= TOTAL_ROOMS - 1;
  if (isLastRoom) {
    return {
      ...run,
      phase: 'won',
      shieldEnergy: SHIELD_ENERGY_MAX,
      progress: rewarded,
      loadout: loadoutFromProgress(rewarded, run.loadout),
      gained,
    };
  }
  if (room?.entersTown) {
    let progress = unlockWeaponSwitch(rewarded);
    progress = setWheelSlot(progress, 'left', 0, progress.active.left);
    progress = setWheelSlot(progress, 'left', 1, progress.unlockedWeapons.includes('shield') ? 'shield' : null);
    progress = setWheelSlot(progress, 'right', 0, progress.unlockedWeapons.includes('bow') ? 'bow' : null);
    return { ...run, phase: 'town', shieldEnergy: SHIELD_ENERGY_MAX, progress, loadout: loadoutFromProgress(progress, run.loadout), gained };
  }
  return {
    ...run,
    roomIndex: run.roomIndex + 1,
    shieldEnergy: SHIELD_ENERGY_MAX,
    progress: rewarded,
    loadout: loadoutFromProgress(rewarded, run.loadout),
    gained,
  };
}

/** 전투 방 안에서 바닥 드랍을 주웠을 때 보상만 먼저 적용한다. */
export function collectRoomReward(run: RunState, reward?: RoomReward): RunState {
  if (run.phase !== 'combat') return run;
  const gained = mergeRoomRewards(run.gained, newPartsOfReward(run.progress, reward));
  const rewarded = applyRoomReward(run.progress, reward);
  return {
    ...run,
    progress: rewarded,
    loadout: loadoutFromProgress(rewarded, run.loadout),
    gained,
  };
}

function mergeRoomRewards(a?: RoomReward, b?: RoomReward): RoomReward | undefined {
  if (!a) return b;
  if (!b) return a;

  return {
    weapons: orderedUnique([...(a.weapons ?? []), ...(b.weapons ?? [])]),
    comboSkills: orderedUnique([...(a.comboSkills ?? []), ...(b.comboSkills ?? [])]),
    supports: orderedUnique([...(a.supports ?? []), ...(b.supports ?? [])]),
  };
}

function orderedUnique<T extends string>(items: readonly T[]): readonly T[] {
  return [...new Set(items)];
}

/**
 * 보상 중 **아직 안 가진 것만** 남긴다. 전부 이미 가졌으면 undefined.
 *
 * 해금은 집합 연산이라 이미 가진 것을 또 줘도 상태가 바뀌지 않는다.
 * 그런데 연출은 방의 `reward`를 그대로 읽어서, 저장이 있는 두 번째 판에는
 * 이미 들고 있는 활/방패를 다시 `획득`이라고 띄웠다.
 * 실제로 늘어난 것만 보여주려면 적용 전 상태와 비교해야 한다.
 */
export function newPartsOfReward(progress: PlayerProgress, reward?: RoomReward): RoomReward | undefined {
  if (!reward) return undefined;

  const weapons = reward.weapons?.filter((id) => !progress.unlockedWeapons.includes(id)) ?? [];
  const comboSkills = reward.comboSkills?.filter((id) => !progress.ownedComboSkills.includes(id)) ?? [];
  const supports = reward.supports?.filter((id) => !progress.ownedSupports.includes(id)) ?? [];

  if (!weapons.length && !comboSkills.length && !supports.length) return undefined;
  return { weapons, comboSkills, supports };
}

function applyRoomReward(progress: PlayerProgress, reward?: RoomReward): PlayerProgress {
  if (!reward) return progress;
  let next = progress;
  if (reward.weapons?.length) next = unlockWeapons(next, reward.weapons);
  if (reward.comboSkills?.length) next = unlockComboSkills(next, reward.comboSkills);
  if (reward.supports?.length) next = unlockSupports(next, reward.supports);
  return next;
}

/** 마을을 나와 다음 전투 방으로 이동한다. */
export function leaveTown(run: RunState): RunState {
  if (run.phase !== 'town') return run;
  const progress = equipFirstWheelSlots(run.progress);
  return {
    ...run,
    phase: 'combat',
    roomIndex: run.roomIndex + 1,
    shieldEnergy: SHIELD_ENERGY_MAX,
    progress,
    loadout: loadoutFromProgress(progress, run.loadout),
  };
}

/**
 * 접촉 피해를 적용한다.
 * 무적 시간이 남아 있으면 무시되고, 피해를 받으면 무적이 다시 걸린다.
 */
export function damagePlayer(run: RunState, amount: number, shieldActive = false): RunState {
  if (run.phase !== 'combat') return run;
  if (run.invulnerable > 0) return run;

  const absorbed = shieldActive ? Math.min(run.shieldEnergy, amount) : 0;
  const shieldEnergy = run.shieldEnergy - absorbed;
  const hp = Math.max(0, run.hp - (amount - absorbed));
  return {
    ...run,
    hp,
    shieldEnergy,
    invulnerable: INVULNERABLE_SECONDS,
    phase: hp <= 0 ? 'lost' : run.phase,
  };
}

export function hasActiveShield(run: RunState): boolean {
  return run.loadout.left === 'shield' || run.loadout.right === 'shield';
}

/** 지금 피해를 받을 수 있는 상태인지. 씬이 피격 연출을 결정할 때 쓴다. */
export function isVulnerable(run: RunState): boolean {
  return run.phase === 'combat' && run.invulnerable <= 0;
}

export function addKill(run: RunState): RunState {
  return { ...run, kills: run.kills + 1 };
}

export function advanceTime(run: RunState, deltaSeconds: number): RunState {
  if (run.phase !== 'combat') return run;
  return {
    ...run,
    elapsed: run.elapsed + deltaSeconds,
    invulnerable: Math.max(0, run.invulnerable - deltaSeconds),
  };
}

export function isOver(run: RunState): boolean {
  return run.phase === 'won' || run.phase === 'lost';
}
