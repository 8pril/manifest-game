/**
 * 범용 수정자 파이프라인.
 *
 * 원안(`01. 기획초안.xlsx` - 보조 시트)의 계산 규칙을 그대로 구현한다.
 *
 *   "'증가/감소'를 먼저 계산 후 '증폭/감폭'을 마지막에 계산"
 *   "증가/증폭은 곱하기, 감소/감폭은 나누기"
 *
 * 즉 증가와 감소는 각각 합산되어 한 번씩만 적용되고,
 * 증폭과 감폭은 개별적으로 곱해진다. Path of Exile의
 * increased / more 구분과 같은 구조이되, 감소·감폭이 뺄셈이 아니라
 * 나눗셈이라는 점이 원안 고유의 규칙이다.
 *
 * 검증 예시 (원안 '지진' 항목의 메모):
 *   기본 지대 지속피해 간격 0.5초에 50% 가속 → 0.5 / 1.5 = 0.34초
 */

export type Stat =
  | 'damage'
  | 'projectileCount'
  | 'projectileSpeed'
  | 'duration'
  | 'areaRadius'
  | 'meleeRange'
  | 'meleeArc'
  | 'knockback'
  | 'tickInterval'
  | 'maxStacks'
  | 'comboGain'
  | 'comboDuration'
  | 'pierceCount'
  | 'chainCount'
  | 'forkCount'
  | 'ricochetCount'
  | 'cooldown';

/**
 * flat    : 고정 수치 가감. 다른 모든 계산보다 먼저 더해진다. (예: 투사체 수 +2)
 * increase: 증가. 합산 후 한 번 곱해진다.
 * reduce  : 감소. 합산 후 한 번 나눠진다.
 * more    : 증폭. 개별적으로 곱해진다.
 * less    : 감폭. 개별적으로 나눠진다.
 */
export type ModifierMode = 'flat' | 'increase' | 'reduce' | 'more' | 'less';

export interface Modifier {
  stat: Stat;
  mode: ModifierMode;
  /** 비율 모드에서는 0.4가 40%를 뜻한다. flat에서는 절대값. */
  value: number;
}

/** 스탯별 기본값 묶음. */
export type StatBlock = Partial<Record<Stat, number>>;

/**
 * 하나의 스탯에 대해 수정자를 적용한 최종값을 구한다.
 *
 * 계산 순서:
 *   (base + Σflat) × (1 + Σincrease) ÷ (1 + Σreduce) × Π(1 + more) ÷ Π(1 + less)
 */
export function resolveStat(base: number, stat: Stat, modifiers: readonly Modifier[]): number {
  let flat = 0;
  let increase = 0;
  let reduce = 0;
  let moreMultiplier = 1;
  let lessDivisor = 1;

  for (const mod of modifiers) {
    if (mod.stat !== stat) continue;

    switch (mod.mode) {
      case 'flat':
        flat += mod.value;
        break;
      case 'increase':
        increase += mod.value;
        break;
      case 'reduce':
        reduce += mod.value;
        break;
      case 'more':
        moreMultiplier *= 1 + mod.value;
        break;
      case 'less':
        lessDivisor *= 1 + mod.value;
        break;
    }
  }

  const additive = (base + flat) * (1 + increase);
  return (additive / (1 + reduce)) * (moreMultiplier / lessDivisor);
}

/** StatBlock 전체에 수정자를 적용한 새 StatBlock을 만든다. */
export function resolveStats(base: StatBlock, modifiers: readonly Modifier[]): StatBlock {
  const result: StatBlock = {};
  const stats = new Set<Stat>([
    ...(Object.keys(base) as Stat[]),
    ...modifiers.map((m) => m.stat),
  ]);

  for (const stat of stats) {
    result[stat] = resolveStat(base[stat] ?? 0, stat, modifiers);
  }
  return result;
}

/**
 * 개수처럼 정수여야 하는 스탯을 읽을 때 쓴다.
 * 투사체 수가 3.4개가 되는 것을 막는다.
 */
export function resolveCount(base: number, stat: Stat, modifiers: readonly Modifier[]): number {
  return Math.max(0, Math.round(resolveStat(base, stat, modifiers)));
}
