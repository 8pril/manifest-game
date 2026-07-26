import type { Target, Vec2 } from '@/engine/projectile';

/**
 * 근접 판정.
 *
 * 검과 방패의 기본 공격은 투사체가 아니라 전방 부채꼴을 훑는다.
 * 판정만 순수 함수로 두고, 휘두르는 연출은 씬이 맡는다.
 */

export interface MeleeSwing {
  origin: Vec2;
  /** 휘두르는 방향(라디안). */
  angle: number;
  range: number;
  /** 부채꼴의 전체 각도(라디안). */
  arc: number;
}

/** 부채꼴 안에 들어온 대상을 모두 돌려준다. */
export function targetsInArc(swing: MeleeSwing, targets: readonly Target[]): Target[] {
  return targets.filter((target) => {
    const dx = target.x - swing.origin.x;
    const dy = target.y - swing.origin.y;
    if (Math.hypot(dx, dy) > swing.range) return false;

    const toTarget = Math.atan2(dy, dx);
    return Math.abs(angleDifference(toTarget, swing.angle)) <= swing.arc / 2;
  });
}

/** 두 각도의 차이를 -π..π 범위로 정규화한다. */
export function angleDifference(a: number, b: number): number {
  let diff = (a - b) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}
