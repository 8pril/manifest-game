import { canAttach, type Skill, type Support } from '@/engine/support';
import { allSkills, supportsFor, type Loadout } from '@/game/loadout';

/**
 * 웨이브 사이 보조능력 3택1 추첨.
 *
 * 보조능력은 스킬 단위로 붙으므로 선택지는 (보조능력, 붙일 스킬) 쌍이다.
 * 장착 불가능한 선택지가 제시되면 플레이어가 고를 수 없는 카드를 보게 되므로,
 * 태그와 슬롯 조건을 모두 통과한 쌍만 추첨 대상으로 삼는다.
 * 난수를 주입받아 테스트에서 결과를 고정할 수 있게 했다.
 */

export type Random = () => number;

export interface OfferItem {
  support: Support;
  skill: Skill;
}

/** 지금 장착 가능한 모든 (보조능력, 스킬) 쌍. */
export function offerCandidates(
  loadout: Loadout,
  pool: readonly Support[],
): OfferItem[] {
  const items: OfferItem[] = [];

  for (const skill of allSkills(loadout)) {
    const attached = supportsFor(loadout, skill.id);
    for (const support of pool) {
      if (canAttach(skill, support, attached).ok) {
        items.push({ support, skill });
      }
    }
  }
  return items;
}

/**
 * 후보 중 최대 count개를 고른다.
 *
 * 같은 보조능력이 여러 스킬에 붙을 수 있으므로, 한 번의 추첨에서는
 * 보조능력 기준으로 중복을 제거한다. 같은 이름의 카드가 두 장 뜨면
 * 플레이어가 차이를 알기 어렵기 때문이다.
 */
export function rollOffer(
  loadout: Loadout,
  pool: readonly Support[],
  random: Random = Math.random,
  count = 3,
): OfferItem[] {
  const candidates = shuffle(offerCandidates(loadout, pool), random);
  const picked: OfferItem[] = [];
  const seen = new Set<string>();

  for (const item of candidates) {
    if (seen.has(item.support.id)) continue;
    seen.add(item.support.id);
    picked.push(item);
    if (picked.length >= count) break;
  }
  return picked;
}

/** Fisher-Yates. 원본을 바꾸지 않는다. */
function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** 테스트용 결정적 난수. 같은 시드는 항상 같은 수열을 준다. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}
