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
} from '@/engine/status';

/** 확률 판정을 항상 통과시키는 난수. */
const always = () => 0;
/** 확률 판정을 항상 실패시키는 난수. */
const never = () => 0.999;

describe('벌어진 상처 - 원안: 1스택씩, 5스택에서 추가피해 후 초기화, 5초 지속', () => {
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

  it('확률이 1이라 항상 부여된다', () => {
    const host = createStatusHost();
    expect(applyStatus(host, 'wound', never).applied).toBe(true);
  });

  it('5초가 지나면 사라진다', () => {
    const host = createStatusHost();
    applyStatus(host, 'wound', always);
    tickStatuses(host, 4.9);
    expect(hasStatus(host, 'wound')).toBe(true);
    tickStatuses(host, 0.2);
    expect(hasStatus(host, 'wound')).toBe(false);
  });

  it('다시 명중하면 지속시간이 갱신된다', () => {
    const host = createStatusHost();
    applyStatus(host, 'wound', always);
    tickStatuses(host, 4);
    applyStatus(host, 'wound', always);
    expect(findStatus(host, 'wound')?.remaining).toBe(STATUS_RULES.wound.duration);
  });
});

describe('약점 노출 - 원안: 30% 확률, 받는 피해 10% 증가, 5초', () => {
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

describe('균열 - 원안: 10% 확률로 기절 2초, 이후 7초간 재기절 불가', () => {
  it('부여되면 기절한다', () => {
    const host = createStatusHost();
    expect(isStunned(host)).toBe(false);
    applyStatus(host, 'fracture', always);
    expect(isStunned(host)).toBe(true);
  });

  it('2초 뒤 기절이 풀린다', () => {
    const host = createStatusHost();
    applyStatus(host, 'fracture', always);
    tickStatuses(host, 2.1);
    expect(isStunned(host)).toBe(false);
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

    // 균열(2초)만 먼저 만료된다
    tickStatuses(host, 2.1);
    expect(hasStatus(host, 'fracture')).toBe(false);
    expect(hasStatus(host, 'wound')).toBe(true);
    expect(hasStatus(host, 'exposed')).toBe(true);
  });

  it('removeStatus로 직접 제거할 수 있다', () => {
    const host = createStatusHost();
    applyStatus(host, 'wound', always);
    removeStatus(host, 'wound');
    expect(hasStatus(host, 'wound')).toBe(false);
  });
});
