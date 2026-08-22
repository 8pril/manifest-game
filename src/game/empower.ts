import type { Hand } from '@/game/combo';

/**
 * 손 강화.
 *
 * `콤보를 소모해 반대쪽 무기를 몇 회 또는 몇 초간 강화한다` 같은 연계가 만드는
 * 한시적 상태다. 콤보와 별개로 관리하는 이유는 **소모한 뒤에도 남아 있어야** 하기
 * 때문이다. 콤보를 털어서 강화로 바꾸는 것이므로 둘의 수명이 다르다.
 *
 * 횟수와 시간은 **둘 다 상한**이고 먼저 닿는 쪽에서 끝난다. 둘 중 하나만 있는
 * 보조도 있어서 각각 없을 수 있다.
 */
export interface EmpowerState {
  /** 공격 생성 뒤 같은 손에 새 강화가 덮여도 서로의 횟수를 소비하지 않게 구분한다. */
  id: number;
  /** 피해 증폭 배율. 0.5면 50% 증폭. */
  more: number;
  /** 화면에 표시할 강화의 출처. 예: 연결 가속. */
  source?: string;
  /** 남은 사용 횟수. 없으면 횟수 제한이 없다. */
  hitsLeft?: number;
  /** 남은 시간(초). 없으면 시간 제한이 없다. */
  secondsLeft?: number;
}

export type EmpowerByHand = Partial<Record<Hand, EmpowerState>>;

let nextEmpowerId = 1;

export function grantEmpower(
  current: EmpowerByHand,
  hand: Hand,
  grant: { more: number; hits?: number; seconds?: number; source?: string },
): EmpowerByHand {
  // 이미 걸려 있으면 덮어쓴다. 겹쳐 쌓으면 콤보를 모아뒀다가 한 번에 터뜨리는 것이
  // 항상 이득이 되어, 조건을 채우는 재미가 아니라 참는 재미가 된다.
  return {
    ...current,
    [hand]: {
      id: nextEmpowerId++,
      more: grant.more,
      source: grant.source,
      hitsLeft: grant.hits,
      secondsLeft: grant.seconds,
    },
  };
}

/** 이 손에 걸린 증폭 배율. 없으면 0이다. */
export function empowerMore(current: EmpowerByHand, hand: Hand): number {
  return current[hand]?.more ?? 0;
}

/** 공격이 생성될 때 잡아 둔 강화와 지금 남은 강화가 같은 경우에만 반환한다. */
export function empowerForAttack(
  current: EmpowerByHand,
  hand: Hand,
  empowerId: number | undefined,
): EmpowerState | undefined {
  if (empowerId === undefined) return undefined;
  const state = current[hand];
  return state?.id === empowerId ? state : undefined;
}

/** 강화된 손으로 한 대 때렸을 때. 횟수를 하나 쓴다. */
export function spendEmpower(current: EmpowerByHand, hand: Hand): EmpowerByHand {
  const state = current[hand];
  if (!state || state.hitsLeft === undefined) return current;

  const hitsLeft = state.hitsLeft - 1;
  if (hitsLeft <= 0) {
    const next = { ...current };
    delete next[hand];
    return next;
  }
  return { ...current, [hand]: { ...state, hitsLeft } };
}

export function tickEmpower(current: EmpowerByHand, deltaSeconds: number): EmpowerByHand {
  let changed = false;
  const next: EmpowerByHand = { ...current };

  for (const hand of ['left', 'right'] as const) {
    const state = next[hand];
    if (!state || state.secondsLeft === undefined) continue;

    const secondsLeft = state.secondsLeft - deltaSeconds;
    changed = true;
    if (secondsLeft <= 0) delete next[hand];
    else next[hand] = { ...state, secondsLeft };
  }
  return changed ? next : current;
}
