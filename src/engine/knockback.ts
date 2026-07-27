import type { Vec2 } from '@/engine/projectile';

/**
 * 넉백.
 *
 * 방패의 '밀치기'가 이름값을 하도록 적을 실제로 밀어낸다.
 * 벽까지 밀리면 부딪힌 것으로 보고, 씬이 추가 피해와 기절을 준다.
 * 무기 차이를 사거리·피해 같은 수치가 아니라 동작으로 드러내기 위한 장치다.
 */

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface KnockbackResult {
  x: number;
  y: number;
  /** 벽에 부딪혀 더 밀려나지 못했는지. */
  hitWall: boolean;
}

/**
 * origin에서 멀어지는 방향으로 target을 distance만큼 민다.
 * 경계를 넘어가면 경계에 붙이고 벽 충돌로 표시한다.
 */
export function applyKnockback(
  origin: Vec2,
  target: Vec2,
  distance: number,
  bounds: Bounds,
): KnockbackResult {
  if (distance <= 0) {
    return { x: target.x, y: target.y, hitWall: false };
  }

  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);

  // 완전히 겹쳐 있으면 방향을 정할 수 없다. 밀지 않는다.
  if (length === 0) {
    return { x: target.x, y: target.y, hitWall: false };
  }

  const desiredX = target.x + (dx / length) * distance;
  const desiredY = target.y + (dy / length) * distance;

  const x = clamp(desiredX, bounds.minX, bounds.maxX);
  const y = clamp(desiredY, bounds.minY, bounds.maxY);

  // 원하는 위치와 실제 위치가 다르면 벽에 막힌 것이다.
  const hitWall = x !== desiredX || y !== desiredY;

  return { x, y, hitWall };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
