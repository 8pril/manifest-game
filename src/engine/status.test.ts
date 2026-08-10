import { describe, it, expect } from 'vitest';
import {
  createStatusHost,
  applyStatus,
  tickStatuses,
  hasStatus,
  findStatus,
  removeStatus,
  incomingDamageMultiplier,
  isStunned,
  consumeBrand,
  STATUS_RULES,
  FRACTURE_IMMUNITY,
  EXPOSED_DAMAGE_INCREASE,
  consumeWound,
  WOUND_CONSUME_PER_STACK,
  WOUND_BURST_DAMAGE,
  STUN_DURATION,
} from '@/engine/status';

/** 확률 판정을 항상 통과시키는 난수. */
const always = () => 0;
/** 확률 판정을 항상 실패시키는 난수. */
const never = () => 0.999;

describe('벌어진 상처 - 기획: 1스택씩, 5스택에서 추가피해 후 초기화, 지속시간 무한', () => {
  it('명중할 때마다 1스택씩 쌓인다', () => {
    const host = createStatusHost();
    applyStatus(host, 'wound', always);
    expect(findStatus(host, 'wound')?.stacks).toBe(1);
    applyStatus(host, 'wound', always);
    expect(findStatus(host, 'wound')?.stacks).toBe(2);
  });

  it('5스택에 도달하면 터지고 초기화된다', () => {
    const host = createStatusHost();
    for (let i = 0; i < 4; i++) {
      expect(applyStatus(host, 'wound', always).burst).toBe(false);
    }
    // 5번째에서 터진다
    expect(applyStatus(host, 'wound', always).burst).toBe(true);
    expect(hasStatus(host, 'wound')).toBe(false);
  });

  it('추가 중첩은 한 번의 명중으로 2스택을 쌓고 폭발 뒤 남은 스택을 보존한다', () => {
    const host = createStatusHost();
    expect(applyStatus(host, 'wound', always, false, 2).burst).toBe(false);
    expect(findStatus(host, 'wound')?.stacks).toBe(2);
    expect(applyStatus(host, 'wound', always, false, 2).burst).toBe(false);
    expect(findStatus(host, 'wound')?.stacks).toBe(4);

    expect(applyStatus(host, 'wound', always, false, 2).burst).toBe(true);
    expect(findStatus(host, 'wound')?.stacks).toBe(1);
  });

  it('확률이 1이라 항상 부여된다', () => {
    const host = createStatusHost();
    expect(applyStatus(host, 'wound', never).applied).toBe(true);
  });

  it('시간이 아무리 지나도 스택이 사라지지 않는다', () => {
    // 상처만 만료되지 않는다. 다른 무기로 소모하거나 5스택으로 터뜨리는 것이 유일한
    // 해소 수단이라, 시간이 먼저 지웠다면 두 규칙 다 발동 기회를 잃는다.
    const host = createStatusHost();
    applyStatus(host, 'wound', always);
    tickStatuses(host, 600);
    expect(hasStatus(host, 'wound')).toBe(true);
    expect(findStatus(host, 'wound')?.stacks).toBe(1);
  });
});

describe('약점 노출 - 기획: 30% 확률, 받는 피해 10% 증가, 3초', () => {
  it('3초가 지나면 사라진다', () => {
    const host = createStatusHost();
    applyStatus(host, 'exposed', always);
    tickStatuses(host, 2.9);
    expect(hasStatus(host, 'exposed')).toBe(true);
    tickStatuses(host, 0.2);
    expect(hasStatus(host, 'exposed')).toBe(false);
  });

  it('확률 판정에 실패하면 부여되지 않는다', () => {
    const host = createStatusHost();
    expect(applyStatus(host, 'exposed', never).applied).toBe(false);
    expect(hasStatus(host, 'exposed')).toBe(false);
  });

  it('부여되면 받는 피해가 10% 증가한다', () => {
    const host = createStatusHost();
    expect(incomingDamageMultiplier(host)).toBe(1);
    applyStatus(host, 'exposed', always);
    expect(incomingDamageMultiplier(host)).toBeCloseTo(1 + EXPOSED_DAMAGE_INCREASE, 10);
  });

  it('중첩하지 않는다', () => {
    const host = createStatusHost();
    applyStatus(host, 'exposed', always);
    applyStatus(host, 'exposed', always);
    expect(findStatus(host, 'exposed')?.stacks).toBe(1);
  });

  it('확률이 대략 30%로 나온다', () => {
    // 난수를 순차적으로 돌려 부여 비율을 확인한다.
    let applied = 0;
    for (let i = 0; i < 1000; i++) {
      const host = createStatusHost();
      const value = i / 1000;
      if (applyStatus(host, 'exposed', () => value).applied) applied++;
    }
    expect(applied).toBe(300);
  });
});

describe('낙인 - 원안: 7% 확률, 공격 시 소비되며 비전 흐름 부여', () => {
  it('낙인이 없으면 소비할 수 없다', () => {
    expect(consumeBrand(createStatusHost())).toBe(false);
  });

  it('낙인을 소비하면 제거된다', () => {
    const host = createStatusHost();
    applyStatus(host, 'brand', always);
    expect(consumeBrand(host)).toBe(true);
    expect(hasStatus(host, 'brand')).toBe(false);
    expect(consumeBrand(host)).toBe(false);
  });

  it('확률이 대략 7%로 나온다', () => {
    let applied = 0;
    for (let i = 0; i < 1000; i++) {
      const host = createStatusHost();
      const value = i / 1000;
      if (applyStatus(host, 'brand', () => value).applied) applied++;
    }
    expect(applied).toBe(70);
  });
});

describe('균열 - 기획: 10% 확률로 균열 3초, 균열이 기절 2초를 유발, 이후 7초간 재기절 불가', () => {
  it('부여되면 기절한다', () => {
    const host = createStatusHost();
    expect(isStunned(host)).toBe(false);
    applyStatus(host, 'fracture', always);
    expect(isStunned(host)).toBe(true);
  });

  it('기절이 균열보다 먼저 풀린다', () => {
    // **균열과 기절은 다른 것이다.** 기절 2초가 끝나 적이 다시 움직여도 균열은
    // 1초 더 붙어 있고, 그 1초 동안 `균열 공명`의 피해 증폭이 산다.
    const host = createStatusHost();
    applyStatus(host, 'fracture', always);

    tickStatuses(host, STUN_DURATION + 0.1);
    expect(isStunned(host)).toBe(false);
    expect(hasStatus(host, 'fracture')).toBe(true);

    tickStatuses(host, STATUS_RULES.fracture.duration - STUN_DURATION);
    expect(hasStatus(host, 'fracture')).toBe(false);
  });

  it('기절이 풀려도 7초 동안은 다시 기절하지 않는다', () => {
    const host = createStatusHost();
    applyStatus(host, 'fracture', always);
    tickStatuses(host, 2.1);

    expect(applyStatus(host, 'fracture', always).applied).toBe(false);
    expect(isStunned(host)).toBe(false);
  });

  it('면역이 끝나면 다시 기절할 수 있다', () => {
    const host = createStatusHost();
    applyStatus(host, 'fracture', always);
    tickStatuses(host, FRACTURE_IMMUNITY + 0.1);

    expect(applyStatus(host, 'fracture', always).applied).toBe(true);
    expect(isStunned(host)).toBe(true);
  });
});

describe('tickStatuses', () => {
  it('여러 상태를 동시에 관리한다', () => {
    const host = createStatusHost();
    applyStatus(host, 'wound', always);
    applyStatus(host, 'exposed', always);
    applyStatus(host, 'fracture', always);
    expect(host.statuses).toHaveLength(3);

    // 약점(3초)과 균열(3초)은 만료되고 상처는 남는다.
    tickStatuses(host, 3.1);
    expect(hasStatus(host, 'fracture')).toBe(false);
    expect(hasStatus(host, 'exposed')).toBe(false);
    expect(hasStatus(host, 'wound')).toBe(true);
  });

  it('removeStatus로 직접 제거할 수 있다', () => {
    const host = createStatusHost();
    applyStatus(host, 'wound', always);
    removeStatus(host, 'wound');
    expect(hasStatus(host, 'wound')).toBe(false);
  });
});

describe('상처 소모 - 다른 무기로 때렸을 때', () => {
  it('쌓인 스택 수를 돌려주고 상처를 제거한다', () => {
    const host = createStatusHost();
    applyStatus(host, 'wound', always);
    applyStatus(host, 'wound', always);
    applyStatus(host, 'wound', always);

    expect(consumeWound(host)).toBe(3);
    expect(hasStatus(host, 'wound')).toBe(false);
  });

  it('상처가 없으면 0을 돌려준다', () => {
    expect(consumeWound(createStatusHost())).toBe(0);
  });

  it('연달아 소모하면 두 번째는 0이다', () => {
    const host = createStatusHost();
    applyStatus(host, 'wound', always);
    expect(consumeWound(host)).toBe(1);
    expect(consumeWound(host)).toBe(0);
  });

  it('5스택 폭발이 소모보다 이득이다', () => {
    // 검이 있다면 한 대 더 때려 터뜨리는 쪽이 낫도록 값을 잡았다.
    const maxConsume = 4 * WOUND_CONSUME_PER_STACK;
    expect(maxConsume).toBeLessThan(WOUND_BURST_DAMAGE);
  });

  it('사냥개가 죽기 전에도 반응할 수 있다', () => {
    // 사냥개는 검 2타에 죽어 5스택에 도달하지 못한다.
    // 2스택 시점에 다른 무기로 소모하면 30의 추가 피해가 나온다.
    const host = createStatusHost();
    applyStatus(host, 'wound', always);
    applyStatus(host, 'wound', always);

    expect(consumeWound(host) * WOUND_CONSUME_PER_STACK).toBe(30);
  });
});
