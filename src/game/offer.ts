import { canAttach, type Skill, type Support } from '@/engine/support';

/**
 * 웨이브 사이 보조능력 3택1 추첨.
 *
 * 장착 불가능한 선택지가 제시되면 플레이어는 고를 수 없는 카드를 보게 되므로,
 * 태그와 슬롯 조건을 모두 통과한 후보만 추첨 대상으로 삼는다.
 * 난수를 주입받아 테스트에서 결과를 고정할 수 있게 했다.
 */

export type Random = () => number;

export function offerCandidates(
  skill: Skill,
  attached: readonly Support[],
  pool: readonly Support[],
): Support[] {
  return pool.filter((support) => canAttach(skill, support, attached).ok);
}

/**
 * 후보 중 최대 count개를 중복 없이 고른다.
 * 후보가 모자라면 있는 만큼만 돌려준다. 슬롯이 다 찬 경우 빈 배열이 된다.
 */
export function rollOffer(
  skill: Skill,
  attached: readonly Support[],
  pool: readonly Support[],
  random: Random = Math.random,
  count = 3,
): Support[] {
  const candidates = offerCandidates(skill, attached, pool);
  return shuffle(candidates, random).slice(0, count);
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
