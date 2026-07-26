import { describe, it, expect } from 'vitest';
import { rollOffer, offerCandidates, seededRandom } from '@/game/offer';
import { SUPPORTS } from '@/data/supports';
import { createLoadout, attachSupport, allSkills } from '@/game/loadout';
import { canAttach } from '@/engine/support';

/** 검(근접·중첩) + 활(투사체) 조합. 태그가 서로 달라 후보가 갈린다. */
const swordBow = createLoadout('sword', 'bow');

describe('offerCandidates', () => {
  it('로드아웃 안 모든 스킬에 대해 장착 가능한 쌍만 후보로 삼는다', () => {
    for (const item of offerCandidates(swordBow, SUPPORTS)) {
      expect(canAttach(item.skill, item.support).ok).toBe(true);
    }
  });

  it('투사체 보조능력은 활 쪽 스킬에만 붙는다', () => {
    const pierce = SUPPORTS.filter((s) => s.id === 'pierce');
    const items = offerCandidates(swordBow, pierce);

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.skill.tags).toContain('투사체');
    }
  });

  it('지대 보조능력은 검의 발동 스킬(멸검)에 붙는다', () => {
    const earthquake = SUPPORTS.filter((s) => s.id === 'earthquake');
    const items = offerCandidates(swordBow, earthquake);

    expect(items.map((i) => i.skill.id)).toContain('annihilation');
  });

  it('중첩 보조능력은 검의 기본 공격에 붙는다', () => {
    const stacks = SUPPORTS.filter((s) => s.id === 'added-stacks');
    const items = offerCandidates(swordBow, stacks);

    expect(items.map((i) => i.skill.id)).toContain('sword-slash');
  });

  it('이미 장착한 보조능력은 같은 스킬 후보에서 빠진다', () => {
    const pierce = SUPPORTS.find((s) => s.id === 'pierce')!;
    const loadout = attachSupport(swordBow, 'arrow-shot', pierce);
    const items = offerCandidates(loadout, [pierce]);

    expect(items.map((i) => i.skill.id)).not.toContain('arrow-shot');
  });
});

describe('rollOffer', () => {
  it('기본 3개를 제시한다', () => {
    expect(rollOffer(swordBow, SUPPORTS, seededRandom(1))).toHaveLength(3);
  });

  it('한 번의 추첨에 같은 보조능력이 두 번 나오지 않는다', () => {
    // 같은 보조능력이 여러 스킬에 붙을 수 있어 중복 제거가 필요하다.
    for (let seed = 1; seed <= 30; seed++) {
      const offer = rollOffer(swordBow, SUPPORTS, seededRandom(seed));
      const ids = offer.map((i) => i.support.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('제시된 항목은 모두 실제로 장착 가능하다', () => {
    // 고를 수 없는 카드가 제시되면 플레이어가 막힌다.
    for (let seed = 1; seed <= 50; seed++) {
      for (const item of rollOffer(swordBow, SUPPORTS, seededRandom(seed))) {
        expect(canAttach(item.skill, item.support).ok).toBe(true);
      }
    }
  });

  it('같은 시드는 같은 결과를 준다', () => {
    const a = rollOffer(swordBow, SUPPORTS, seededRandom(42));
    const b = rollOffer(swordBow, SUPPORTS, seededRandom(42));
    expect(a.map((i) => i.support.id)).toEqual(b.map((i) => i.support.id));
  });

  it('시드가 다르면 결과가 달라진다', () => {
    // 매 판 같은 선택지만 나오면 로그라이트가 성립하지 않는다.
    const results = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      results.add(
        rollOffer(swordBow, SUPPORTS, seededRandom(seed))
          .map((i) => i.support.id)
          .join(','),
      );
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('웨이브 3회 선택을 끝까지 진행할 수 있다', () => {
    // 스킬당 슬롯은 원안대로 2개지만, 무기 2종이면 스킬이 4개라
    // 선택 3회를 모두 소화할 수 있어야 한다.
    const random = seededRandom(11);
    let loadout = swordBow;

    for (let i = 0; i < 3; i++) {
      const offer = rollOffer(loadout, SUPPORTS, random);
      expect(offer.length, `${i + 1}번째 선택`).toBeGreaterThan(0);
      loadout = attachSupport(loadout, offer[0].skill.id, offer[0].support);
    }
  });

  it('모든 무기 조합에서 3회 선택이 가능하다', () => {
    const ids = ['sword', 'bow', 'arcane', 'shield'] as const;

    for (const left of ids) {
      for (const right of ids) {
        if (left === right) continue;
        let loadout = createLoadout(left, right);
        const random = seededRandom(3);

        for (let i = 0; i < 3; i++) {
          const offer = rollOffer(loadout, SUPPORTS, random);
          expect(offer.length, `${left}+${right} ${i + 1}번째`).toBeGreaterThan(0);
          loadout = attachSupport(loadout, offer[0].skill.id, offer[0].support);
        }
      }
    }
  });

  it('모든 슬롯이 차면 빈 배열을 준다', () => {
    let loadout = swordBow;
    // 스킬 4개 × 슬롯 2개를 전부 채운다
    for (const skill of allSkills(loadout)) {
      const attachable = SUPPORTS.filter((s) => canAttach(skill, s).ok).slice(0, 2);
      for (const support of attachable) {
        loadout = attachSupport(loadout, skill.id, support);
      }
    }
    expect(rollOffer(loadout, SUPPORTS, seededRandom(5))).toHaveLength(0);
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
