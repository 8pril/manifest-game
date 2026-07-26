import type { Support } from '@/engine/support';
import { TOTAL_WAVES } from '@/game/waves';

/**
 * 한 판(run)의 상태 기계.
 *
 * 렌더링과 분리해 두어 승패 판정과 진행 규칙을 테스트로 고정한다.
 * 상태를 직접 바꾸지 않고 새 상태를 돌려주는 방식이라,
 * 어떤 입력이 어떤 전이를 일으키는지 한눈에 드러난다.
 */

export type RunPhase =
  /** 웨이브 진행 중. */
  | 'combat'
  /** 웨이브를 정리하고 보조능력을 고르는 중. */
  | 'offer'
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
  /** 현재 웨이브 인덱스. 0부터 시작한다. */
  waveIndex: number;
  hp: number;
  maxHp: number;
  attached: readonly Support[];
  /** 남은 무적 시간(초). 0이면 피해를 받는다. */
  invulnerable: number;
  /** 처치한 적 수. 결과 화면에 쓴다. */
  kills: number;
  /** 경과 시간(초). */
  elapsed: number;
}

export function createRun(): RunState {
  return {
    phase: 'combat',
    waveIndex: 0,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    attached: [],
    invulnerable: 0,
    kills: 0,
    elapsed: 0,
  };
}

/**
 * 현재 웨이브의 적을 모두 정리했을 때.
 * 마지막 웨이브였다면 승리, 아니면 보조능력 선택으로 넘어간다.
 */
export function clearWave(run: RunState, offersSupport: boolean): RunState {
  if (run.phase !== 'combat') return run;

  const isLastWave = run.waveIndex >= TOTAL_WAVES - 1;
  if (isLastWave) {
    return { ...run, phase: 'won' };
  }
  // 고를 보조능력이 없으면 선택 단계를 건너뛰고 바로 다음 웨이브로 간다.
  if (!offersSupport) {
    return { ...run, waveIndex: run.waveIndex + 1 };
  }
  return { ...run, phase: 'offer' };
}

/** 보조능력을 골랐을 때. 고르지 않고 넘기려면 support에 undefined를 준다. */
export function pickSupport(run: RunState, support: Support | undefined): RunState {
  if (run.phase !== 'offer') return run;

  return {
    ...run,
    phase: 'combat',
    waveIndex: run.waveIndex + 1,
    attached: support ? [...run.attached, support] : run.attached,
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
