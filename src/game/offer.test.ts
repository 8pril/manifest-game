import { describe, it, expect } from 'vitest';
import { rollOffer, offerCandidates, seededRandom } from '@/game/offer';
import { SUPPORTS } from '@/data/supports';
import { ARROW_SHOT, ANNIHILATION } from '@/data/skills';
import { canAttach } from '@/engine/support';

describe('offerCandidates', () => {
  it('장착 가능한 보조능력만 후보로 삼는다', () => {
    const candidates = offerCandidates(ARROW_SHOT, [], SUPPORTS);
    for (const candidate of candidates) {
      expect(canAttach(ARROW_SHOT, candidate).ok).toBe(true);
    }
  });

  it('스킬의 태그에 맞지 않는 보조능력은 후보에서 빠진다', () => {
    const candidates = offerCandidates(ARROW_SHOT, [], SUPPORTS).map((s) => s.id);
    // 지대 보조능력은 화살 사격에 붙지 않는다
    expect(candidates).not.toContain('earthquake');
    expect(candidates).toContain('multiple-projectiles');
  });

  it('멸검에는 지대 보조능력이 후보로 나온다', () => {
    const candidates = offerCandidates(ANNIHILATION, [], SUPPORTS).map((s) => s.id);
    expect(candidates).toContain('earthquake');
    expect(candidates).not.toContain('pierce');
  });

  it('이미 장착한 보조능력은 후보에서 빠진다', () => {
    const pierce = SUPPORTS.find((s) => s.id === 'pierce')!;
    const candidates = offerCandidates(ARROW_SHOT, [pierce], SUPPORTS).map((s) => s.id);
    expect(candidates).not.toContain('pierce');
  });
});

describe('rollOffer', () => {
  it('기본 3개를 제시한다', () => {
    expect(rollOffer(ARROW_SHOT, [], SUPPORTS, seededRandom(1))).toHaveLength(3);
  });

  it('중복 없이 제시한다', () => {
    const offer = rollOffer(ARROW_SHOT, [], SUPPORTS, seededRandom(7));
    expect(new Set(offer.map((s) => s.id)).size).toBe(offer.length);
  });

  it('제시된 항목은 모두 실제로 장착 가능하다', () => {
    // 고를 수 없는 카드가 제시되면 플레이어가 막힌다.
    for (let seed = 1; seed <= 50; seed++) {
      const offer = rollOffer(ARROW_SHOT, [], SUPPORTS, seededRandom(seed));
      for (const support of offer) {
        expect(canAttach(ARROW_SHOT, support).ok).toBe(true);
      }
    }
  });

  it('같은 시드는 같은 결과를 준다', () => {
    const a = rollOffer(ARROW_SHOT, [], SUPPORTS, seededRandom(42));
    const b = rollOffer(ARROW_SHOT, [], SUPPORTS, seededRandom(42));
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
  });

  it('시드가 다르면 결과가 달라진다', () => {
    // 매 판 같은 선택지만 나오면 로그라이트가 성립하지 않는다.
    const results = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      results.add(
        rollOffer(ARROW_SHOT, [], SUPPORTS, seededRandom(seed))
          .map((s) => s.id)
          .join(','),
      );
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('후보가 모자라면 있는 만큼만 준다', () => {
    const twoOnly = SUPPORTS.filter((s) => ['pierce', 'chain'].includes(s.id));
    expect(rollOffer(ARROW_SHOT, [], twoOnly, seededRandom(3))).toHaveLength(2);
  });

  it('슬롯이 다 차면 빈 배열을 준다', () => {
    const full = offerCandidates(ARROW_SHOT, [], SUPPORTS).slice(0, ARROW_SHOT.supportSlots);
    expect(rollOffer(ARROW_SHOT, full, SUPPORTS, seededRandom(5))).toHaveLength(0);
  });

  it('웨이브 3회 선택을 끝까지 진행할 수 있다', () => {
    // 슬롯 수와 선택 횟수가 맞지 않으면 마지막 선택이 죽는다.
    const random = seededRandom(11);
    const attached = [];
    for (let i = 0; i < 3; i++) {
      const offer = rollOffer(ARROW_SHOT, attached, SUPPORTS, random);
      expect(offer.length, `${i + 1}번째 선택`).toBeGreaterThan(0);
      attached.push(offer[0]);
    }
    expect(attached).toHaveLength(3);
  });
});

describe('seededRandom', () => {
  it('0 이상 1 미만의 값을 준다', () => {
    const random = seededRandom(123);
    for (let i = 0; i < 500; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
