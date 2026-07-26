import type { AreaKind, Behavior } from '@/engine/support';
import { findBehavior } from '@/engine/support';
import type { StatBlock } from '@/engine/modifiers';
import type { Vec2 } from '@/engine/projectile';

/**
 * 지대 엔진.
 *
 * 지대는 위치·반경·지속시간·틱 간격·피해 타입을 가진 엔티티다.
 * 보조능력이 지대의 성질(점화/감전/냉각/탈진)과 수치를 바꾸며,
 * 이 하나의 엔진에서 원안 보조능력 여러 종이 파생된다.
 */

export interface Area extends Vec2 {
  id: number;
  radius: number;
  kind: AreaKind;
  /** 생성 시점의 총 지속시간(초). 남은 비율 계산에 쓴다. */
  duration: number;
  /** 남은 지속시간(초). */
  remaining: number;
  /** 지속피해 간격(초). */
  tickInterval: number;
  /** 다음 틱까지 누적된 시간. */
  elapsedSinceTick: number;
  damagePerTick: number;
  /** 지속피해를 줄 때마다 적의 이동을 방해하는지. */
  hinders: boolean;
  /** 생성 후 일정 시간 뒤 폭발하는 지대라면 남은 시간, 아니면 undefined. */
  detonateIn?: number;
}

let nextId = 1;
export function resetAreaIds(): void {
  nextId = 1;
}

export function createArea(
  stats: StatBlock,
  behaviors: readonly Behavior[],
  at: Vec2,
): Area {
  const kindBehavior = findBehavior(behaviors, 'areaKind');
  const hinder = findBehavior(behaviors, 'hinder');
  const duration = stats.duration ?? 2;

  return {
    id: nextId++,
    x: at.x,
    y: at.y,
    radius: stats.areaRadius ?? 64,
    kind: kindBehavior?.value ?? 'plain',
    duration,
    remaining: duration,
    tickInterval: stats.tickInterval ?? 0.5,
    elapsedSinceTick: 0,
    damagePerTick: stats.damage ?? 0,
    hinders: hinder !== undefined,
  };
}

export interface AreaTickResult {
  /** 이번 프레임에 지속피해가 발생했는지. */
  ticked: boolean;
  /** 지속시간이 끝나 제거해야 하는지. */
  expired: boolean;
}

/**
 * 지대의 시간을 진행시킨다.
 *
 * 한 프레임이 틱 간격보다 길 수 있으므로 누적 시간을 남겨두고,
 * 프레임 저하가 곧 피해량 손실이 되지 않게 한다.
 */
export function tickArea(area: Area, deltaSeconds: number): AreaTickResult {
  area.remaining -= deltaSeconds;
  area.elapsedSinceTick += deltaSeconds;

  let ticked = false;
  if (area.elapsedSinceTick >= area.tickInterval) {
    area.elapsedSinceTick -= area.tickInterval;
    ticked = true;
  }

  return { ticked, expired: area.remaining <= 0 };
}

export function containsPoint(area: Area, point: Vec2): boolean {
  return Math.hypot(point.x - area.x, point.y - area.y) <= area.radius;
}

/** 남은 지속시간 비율(1 → 0). 렌더러가 페이드아웃에 쓴다. */
export function remainingRatio(area: Area): number {
  if (area.duration <= 0) return 0;
  return Math.max(0, Math.min(1, area.remaining / area.duration));
}

/** 지대 종류별 표시 색상. 렌더러가 참조한다. */
export const AREA_COLORS: Record<AreaKind, number> = {
  plain: 0x8b90a3,
  ignite: 0xff6b3d,
  shock: 0xffd23d,
  chill: 0x6ec8ff,
  freeze: 0xa8e6ff,
  wither: 0xb06bff,
};
