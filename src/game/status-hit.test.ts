import { describe, expect, it } from 'vitest';
import { SUPPORTS } from '@/data/supports';
import { applyStatus, createStatusHost, findStatus } from '@/engine/status';
import { resolveStatusHit } from '@/game/status-hit';

const woundResonance = SUPPORTS.find((support) => support.id === 'wound-resonance')!.behaviors ?? [];

function targetWithWounds(stacks: number) {
  const target = createStatusHost();
  applyStatus(target, 'wound', () => 0, false, stacks);
  return target;
}

describe('resolveStatusHit - 상처 공명과 교차 소모', () => {
  it('0 피해 상태 부여 경로는 상처를 소모하지 않는다', () => {
    const target = targetWithWounds(2);
    const result = resolveStatusHit(0, target, 'brand', woundResonance);

    expect(result).toEqual({ damage: 0, woundStacksConsumed: 0, woundBonus: 0 });
    expect(findStatus(target, 'wound')?.stacks).toBe(2);
  });

  it.each([
    ['비전 개화', 'brand'],
    ['균열 파동', 'fracture'],
  ] as const)('%s의 실제 첫 피해는 상처 공명을 적용한 뒤 상처를 소모한다', (_skill, sourceStatus) => {
    const target = targetWithWounds(2);
    const result = resolveStatusHit(40, target, sourceStatus, woundResonance);

    expect(result.damage).toBeCloseTo(54, 10);
    expect(result.woundStacksConsumed).toBe(2);
    expect(result.woundBonus).toBe(30);
    expect(findStatus(target, 'wound')).toBeUndefined();
  });

  it('상처를 부여하는 검 피해는 공명을 적용해도 상처를 소모하지 않는다', () => {
    const target = targetWithWounds(2);
    const result = resolveStatusHit(40, target, 'wound', woundResonance);

    expect(result.damage).toBeCloseTo(54, 10);
    expect(result.woundStacksConsumed).toBe(0);
    expect(findStatus(target, 'wound')?.stacks).toBe(2);
  });
});
