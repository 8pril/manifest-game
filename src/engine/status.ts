/**
 * 상태이상 엔진.
 *
 * 수치는 원안 `02. 전투시스템 초안.xlsx`의 01_실체화무기 시트를 그대로 따른다.
 * 확률 판정이 들어가므로 난수를 주입받게 하여 테스트에서 결과를 고정한다.
 */

export type StatusKind = 'wound' | 'exposed' | 'brand' | 'fracture';

export interface StatusRule {
  label: string;
  /** 명중 시 부여 확률. 1이면 항상 부여된다. */
  chance: number;
  /** 지속시간(초). */
  duration: number;
  /** 최대 중첩. 1이면 중첩하지 않는다. */
  maxStacks: number;
}

/**
 * 원안 수치:
 *  - 벌어진 상처: 명중 시 1스택, 5스택 도달 시 추가피해 후 초기화, 5초 지속
 *  - 약점 노출  : 명중 시 30% 확률, 받는 피해 10% 증가, 5초 지속
 *  - 낙인       : 명중 시 7% 확률로 부착(5초). 부착된 적 공격 시 제거되며
 *                 플레이어가 '비전 흐름'(비전 피해 25% 증폭, 5초) 획득
 *  - 균열       : 명중 시 10% 확률로 기절 2초. 한번 기절한 적은 7초간 재기절 불가
 */
export const STATUS_RULES: Record<StatusKind, StatusRule> = {
  wound: { label: '벌어진 상처', chance: 1, duration: 5, maxStacks: 5 },
  exposed: { label: '약점 노출', chance: 0.3, duration: 5, maxStacks: 1 },
  brand: { label: '낙인', chance: 0.07, duration: 5, maxStacks: 1 },
  fracture: { label: '균열', chance: 0.1, duration: 2, maxStacks: 1 },
};

/** 벌어진 상처가 최대 중첩에 도달했을 때 터지는 추가 피해. */
export const WOUND_BURST_DAMAGE = 90;
/** 약점 노출 상태의 대상이 받는 피해 증가율. */
export const EXPOSED_DAMAGE_INCREASE = 0.1;
/** 낙인 소비로 얻는 '비전 흐름'의 비전 피해 증폭률과 지속시간. */
export const ARCANE_FLOW_MORE = 0.25;
export const ARCANE_FLOW_DURATION = 5;
/** 기절한 적이 다시 기절하기까지의 면역 시간. */
export const FRACTURE_IMMUNITY = 7;

/**
 * 상처를 남긴 무기가 아닌 다른 무기로 때렸을 때, 스택 하나당 추가 피해.
 *
 * 상처 폭발은 5스택이 필요한데 사냥개(2타)와 몰이꾼(2타)은 그 전에 죽어
 * 규칙이 구조적으로 발동하지 않았다. 다른 무기가 쌓인 만큼을 소모하게 하면
 * 그 구멍이 메워지고, 동시에 무기를 두 개 고르는 선택에 의미가 생긴다.
 *
 * 4스택을 소모하면 60으로 검 한 대(46)보다 조금 크다. 5스택 폭발(90)보다는
 * 작으므로, 검이 있다면 한 대 더 때려 터뜨리는 쪽이 여전히 이득이다.
 */
export const WOUND_CONSUME_PER_STACK = 15;

export interface StatusInstance {
  kind: StatusKind;
  stacks: number;
  remaining: number;
}

/** 상태이상을 가질 수 있는 대상. 적 엔티티가 이 형태를 만족한다. */
export interface StatusHost {
  statuses: StatusInstance[];
  /** 상태별 재부여 면역 남은 시간(초). */
  immunity: Partial<Record<StatusKind, number>>;
}

export function createStatusHost(): StatusHost {
  return { statuses: [], immunity: {} };
}

export function findStatus(host: StatusHost, kind: StatusKind): StatusInstance | undefined {
  return host.statuses.find((s) => s.kind === kind);
}

export function hasStatus(host: StatusHost, kind: StatusKind): boolean {
  return findStatus(host, kind) !== undefined;
}

export interface ApplyResult {
  /** 실제로 부여됐는지. 확률 판정에 실패하거나 면역이면 false. */
  applied: boolean;
  /** 벌어진 상처가 최대 중첩에 도달해 터졌는지. */
  burst: boolean;
}

/**
 * 명중 시 상태이상을 부여한다.
 * 확률 판정과 면역을 모두 통과해야 부여된다.
 */
export function applyStatus(
  host: StatusHost,
  kind: StatusKind,
  random: () => number = Math.random,
  /** 확률 판정을 건너뛴다. 벽 충돌처럼 확정적으로 걸려야 하는 경우에 쓴다. */
  force = false,
): ApplyResult {
  const rule = STATUS_RULES[kind];

  if ((host.immunity[kind] ?? 0) > 0) return { applied: false, burst: false };
  if (!force && rule.chance < 1 && random() >= rule.chance) return { applied: false, burst: false };

  const existing = findStatus(host, kind);
  if (!existing) {
    host.statuses.push({ kind, stacks: 1, remaining: rule.duration });
    if (kind === 'fracture') host.immunity.fracture = FRACTURE_IMMUNITY;
    return { applied: true, burst: false };
  }

  existing.remaining = rule.duration;
  if (existing.stacks < rule.maxStacks) {
    existing.stacks += 1;
  }

  // 벌어진 상처는 최대 중첩에 도달하면 터지고 초기화된다.
  if (kind === 'wound' && existing.stacks >= rule.maxStacks) {
    removeStatus(host, kind);
    return { applied: true, burst: true };
  }

  return { applied: true, burst: false };
}

export function removeStatus(host: StatusHost, kind: StatusKind): void {
  const index = host.statuses.findIndex((s) => s.kind === kind);
  if (index >= 0) host.statuses.splice(index, 1);
}

/** 시간을 진행시켜 만료된 상태와 면역을 정리한다. */
export function tickStatuses(host: StatusHost, deltaSeconds: number): void {
  for (let i = host.statuses.length - 1; i >= 0; i--) {
    host.statuses[i].remaining -= deltaSeconds;
    if (host.statuses[i].remaining <= 0) host.statuses.splice(i, 1);
  }

  for (const key of Object.keys(host.immunity) as StatusKind[]) {
    const left = (host.immunity[key] ?? 0) - deltaSeconds;
    if (left <= 0) delete host.immunity[key];
    else host.immunity[key] = left;
  }
}

/** 이 대상이 받는 피해의 배수. 약점 노출이 걸려 있으면 늘어난다. */
export function incomingDamageMultiplier(host: StatusHost): number {
  return hasStatus(host, 'exposed') ? 1 + EXPOSED_DAMAGE_INCREASE : 1;
}

/** 기절 상태인지. 기절한 적은 움직이지 않는다. */
export function isStunned(host: StatusHost): boolean {
  return hasStatus(host, 'fracture');
}

/**
 * 낙인이 걸린 대상을 때렸을 때 낙인을 소비한다.
 * 소비에 성공하면 플레이어가 '비전 흐름'을 얻어야 한다.
 */
export function consumeBrand(host: StatusHost): boolean {
  if (!hasStatus(host, 'brand')) return false;
  removeStatus(host, 'brand');
  return true;
}

/**
 * 상처를 소모하고 소모한 스택 수를 돌려준다.
 * 상처가 없으면 0. 상처를 남긴 무기 본인이 때렸을 때는 호출하지 않는다.
 */
export function consumeWound(host: StatusHost): number {
  const wound = findStatus(host, 'wound');
  if (!wound) return 0;

  const stacks = wound.stacks;
  removeStatus(host, 'wound');
  return stacks;
}
