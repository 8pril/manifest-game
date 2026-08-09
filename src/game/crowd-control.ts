import type { Behavior } from '@/engine/support';
import { findBehavior } from '@/engine/support';
import { isBossKind, type Enemy } from '@/game/enemy';

/**
 * 보스는 기본적으로 자세가 흐트러지거나 느려지지 않는다.
 * 나중에 연계 시너지 스킬이 `bossCc` 거동을 제공하면 그 스킬만 예외가 된다.
 */
export function canApplyCrowdControl(enemy: Enemy, behaviors: readonly Behavior[] = []): boolean {
  return !isBossKind(enemy.kind) || findBehavior(behaviors, 'bossCc') !== undefined;
}
