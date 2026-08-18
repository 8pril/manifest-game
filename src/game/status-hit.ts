import { findBehavior, type Behavior } from '@/engine/support';
import {
  consumeWound,
  hasStatus,
  WOUND_CONSUME_PER_STACK,
  type StatusHost,
  type StatusKind,
} from '@/engine/status';

export interface StatusHitResult {
  /** 상태 조건부 증폭까지 적용했지만 약점·손 강화 같은 전역 배율은 적용하기 전 피해. */
  damage: number;
  woundStacksConsumed: number;
  /** 상처 소모로 더해지는 고정 피해. 다른 피해 배율의 영향을 받지 않는다. */
  woundBonus: number;
}

/**
 * 기존 상태를 읽는 피해 보조와 상처 소모의 순서를 한 곳에서 처리한다.
 * 상처 공명은 상처가 사라지기 전 현재 명중을 증폭하고, 실제 피해가 있을 때만 소모한다.
 */
export function resolveStatusHit(
  rawDamage: number,
  target: StatusHost,
  sourceStatus: StatusKind | undefined,
  behaviors: readonly Behavior[],
): StatusHitResult {
  const statusDamage = findBehavior(behaviors, 'statusDamage');
  const damage = statusDamage && hasStatus(target, statusDamage.status)
    ? rawDamage * (1 + statusDamage.more)
    : rawDamage;

  const woundStacksConsumed = rawDamage > 0 && sourceStatus !== undefined && sourceStatus !== 'wound'
    ? consumeWound(target)
    : 0;

  return {
    damage,
    woundStacksConsumed,
    woundBonus: woundStacksConsumed * WOUND_CONSUME_PER_STACK,
  };
}
