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
 * 이미 보조능력이 붙은 스킬에 더 붙을 확률을 얼마나 높일지.
 *
 * 선택 기회가 3번인데 스킬은 4개라, 균등 추첨이면 보조능력이 흩어져
 * 어느 스킬도 눈에 띄게 달라지지 않는다. 이 게임에서 가장 볼 만한 장면은
 * 한 스킬에 여러 개가 겹칠 때 나온다. 예를 들어 연사(투사체 5)에
 * 다중투사체와 갈래가 겹치면 7발이 21발로 갈라진다.
 *
 * 선택 횟수를 늘리면 한 판이 길어지므로, 대신 이미 투자한 쪽으로
 * 선택지를 기울여 같은 횟수 안에서 빌드가 모이게 한다.
 */
const CONCENTRATION_BIAS = 2;

/**
 * 후보 중 최대 count개를 고른다.
 *
 * 같은 보조능력이 여러 스킬에 붙을 수 있으므로, 한 번의 추첨에서는
 * 보조능력 기준으로 중복을 제거한다. 같은 이름의 카드가 두 장 뜨면
 * 플레이어가 차이를 알기 어렵기 때문이다.
 *
 * 이미 보조능력이 붙은 스킬의 후보에 가중치를 준다.
 */
export function rollOffer(
  loadout: Loadout,
  pool: readonly Support[],
  random: Random = Math.random,
  count = 3,
): OfferItem[] {
  const weighted = weightedShuffle(
    offerCandidates(loadout, pool),
    (item) => 1 + supportsFor(loadout, item.skill.id).length * CONCENTRATION_BIAS,
    random,
  );

  const picked: OfferItem[] = [];
  const seen = new Set<string>();

  for (const item of weighted) {
    if (seen.has(item.support.id)) continue;
    seen.add(item.support.id);
    picked.push(item);
    if (picked.length >= count) break;
  }
  return picked;
}

/**
 * 가중치를 반영해 섞는다. 원본을 바꾸지 않는다.
 *
 * 각 항목에 `난수^(1/가중치)`를 키로 주고 큰 순으로 정렬한다.
 * 가중치가 클수록 키가 1에 가까워져 앞으로 나올 확률이 높아지며,
 * 가중치가 모두 같으면 결과는 균등 섞기와 같다.
 */
function weightedShuffle<T>(items: readonly T[], weightOf: (item: T) => number, random: Random): T[] {
  return items
    .map((item) => ({ item, key: random() ** (1 / Math.max(0.0001, weightOf(item))) }))
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.item);
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
