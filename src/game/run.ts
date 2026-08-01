import { roomAt, TOTAL_ROOMS } from '@/game/rooms';
import { loadoutFromProgress, type Loadout } from '@/game/loadout';
import type { WeaponId } from '@/data/weapons';
import {
  configureManifestation,
  createInitialProgress,
  setWheelSlot,
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
  /** 무기 2종과 스킬별 보조능력. */
  loadout: Loadout;
  /** 해금된 무기와 마을 장비 설정. */
  progress: PlayerProgress;
  /** 남은 무적 시간(초). 0이면 피해를 받는다. */
  invulnerable: number;
  /** 처치한 적 수. 결과 화면에 쓴다. */
  kills: number;
  /** 경과 시간(초). */
  elapsed: number;
}

export function createRun(left: WeaponId, right: WeaponId | null): RunState {
  const progress = {
    ...unlockWeapons(createInitialProgress(), right ? [left, right] : [left]),
    active: { left, right },
  };

  return {
    phase: 'combat',
    roomIndex: 0,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
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
  const isLastRoom = run.roomIndex >= TOTAL_ROOMS - 1;
  if (isLastRoom) {
    return { ...run, phase: 'won' };
  }
  if (room?.entersTown) {
    let progress = unlockWeaponSwitch(unlockWeapons(run.progress, room.unlocksWeapons ?? []));
    progress = configureDefaultTownLoadout(progress);
    progress = setWheelSlot(progress, 'left', 0, progress.active.left);
    progress = setWheelSlot(progress, 'left', 1, progress.unlockedWeapons.includes('shield') ? 'shield' : null);
    progress = setWheelSlot(progress, 'right', 0, progress.unlockedWeapons.includes('bow') ? 'bow' : null);
    return { ...run, phase: 'town', progress, loadout: loadoutFromProgress(progress, run.loadout) };
  }
  return { ...run, roomIndex: run.roomIndex + 1 };
}

function configureDefaultTownLoadout(progress: PlayerProgress): PlayerProgress {
  let next = unlockSupports(progress, [
    'earthquake',
    'lasting-composure',
    'multiple-projectiles',
    'fork',
    'dragging-ground',
  ]);
  if (next.unlockedWeapons.includes('sword')) {
    next = configureManifestation(next, 'sword', { primarySupportId: 'earthquake', synergySupportId: 'lasting-composure' });
  }
  if (next.unlockedWeapons.includes('bow')) {
    next = configureManifestation(next, 'bow', { primarySupportId: 'multiple-projectiles', synergySupportId: 'fork' });
  }
  if (next.unlockedWeapons.includes('shield')) {
    next = configureManifestation(next, 'shield', { primarySupportId: 'earthquake', synergySupportId: 'dragging-ground' });
  }
  return next;
}

/** 마을을 나와 다음 전투 방으로 이동한다. */
export function leaveTown(run: RunState): RunState {
  if (run.phase !== 'town') return run;
  return {
    ...run,
    phase: 'combat',
    roomIndex: run.roomIndex + 1,
  };
}

/**
 * 접촉 피해를 적용한다.
 * 무적 시간이 남아 있으면 무시되고, 피해를 받으면 무적이 다시 걸린다.
 */
export function damagePlayer(run: RunState, amount: number): RunState {
  if (run.phase !== 'combat') return run;
  if (run.invulnerable > 0) return run;

  const hp = Math.max(0, run.hp - amount);
  return {
    ...run,
    hp,
    invulnerable: INVULNERABLE_SECONDS,
    phase: hp <= 0 ? 'lost' : run.phase,
  };
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
