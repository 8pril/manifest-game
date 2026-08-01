import { describe, expect, it } from 'vitest';
import { canApplyCrowdControl } from '@/game/crowd-control';
import { createEnemy } from '@/game/enemy';
import type { Behavior } from '@/engine/support';

describe('canApplyCrowdControl', () => {
  it('일반 적은 기본적으로 CC가 적용된다', () => {
    expect(canApplyCrowdControl(createEnemy('chaser', 0, 0))).toBe(true);
  });

  it('보스는 기본적으로 CC에 면역이다', () => {
    expect(canApplyCrowdControl(createEnemy('gatekeeper', 0, 0))).toBe(false);
    expect(canApplyCrowdControl(createEnemy('collapsedDoor', 0, 0))).toBe(false);
  });

  it('bossCc 거동이 있으면 보스도 CC 대상이 된다', () => {
    const behaviors: Behavior[] = [{ kind: 'bossCc' }];
    expect(canApplyCrowdControl(createEnemy('gatekeeper', 0, 0), behaviors)).toBe(true);
  });
});
