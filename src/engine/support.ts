import type { Tag, Tagged } from '@/engine/tags';
import type { Modifier, StatBlock } from '@/engine/modifiers';
import { resolveStats } from '@/engine/modifiers';
import type { StatusKind } from '@/engine/status';

/**
 * 스킬과 보조능력.
 *
 * 보조능력은 코드가 아니라 데이터다. 새 보조능력을 추가하는 일은
 * 이 파일을 고치는 게 아니라 데이터 배열에 항목을 하나 더 넣는 일이어야 한다.
 */

/** 투사체·지대의 거동을 바꾸는 규칙. 수치 변화가 아닌 동작 변화를 표현한다. */
export type Behavior =
  /** 관통. count가 'all'이면 모든 대상을 관통한다. */
  | { kind: 'pierce'; count: number | 'all' }
  /** 연쇄. 명중 후 다른 대상으로 튄다. damageFalloff는 연쇄마다 누적 적용된다. */
  | { kind: 'chain'; count: number; sameTargetLimit: number; damageFalloff: number }
  /** 갈래. 명중 지점에서 새 투사체로 갈라진다. */
  | { kind: 'fork'; count: number }
  /** 튕겨쏘기. 지형에 부딪히면 튕긴다. */
  | { kind: 'ricochet'; count: number }
  /** 피해 타입 전환. 물리 피해의 일부를 다른 속성으로 바꾼다. */
  | { kind: 'convert'; to: Tag; ratio: number }
  /** 지대 성질 전환. */
  | { kind: 'areaKind'; value: AreaKind }
  /** 지대가 지속피해를 줄 때마다 적의 이동을 방해한다. */
  | { kind: 'hinder' }
  /** 특정 상태이상이 걸린 대상에게 추가 피해를 준다. */
  | { kind: 'statusDamage'; status: StatusKind; more: number }
  /** 보스에게도 넉백, 기절, 이동 방해 같은 CC를 적용할 수 있게 한다. */
  | { kind: 'bossCc' }
  /**
   * 콤보 규칙.
   *
   * **조건과 효과를 연계가 각자 들고 있다.** 콤보를 모든 무기의 기본 규칙에서
   * 빼고 연계으로 옮긴 결과다. 어떤 것은 손을 번갈아 쳤는지를 보고, 어떤 것은
   * 양손 합계를 보고, 어떤 것은 쌓인 콤보를 소모해 반대손을 강화한다.
   *
   * 새 콤보 규칙을 만드는 일이 코드가 아니라 데이터 한 줄이 되도록 이 모양으로 뒀다.
   */
  | { kind: 'combo'; trigger: ComboTrigger; effect: ComboEffect };

/**
 * 콤보 조건. 무엇을 보고 성립을 판정하는가.
 *
 * `self`와 `other`는 이 보조가 붙어 있는 무기를 기준으로 갈린다.
 */
export type ComboTrigger =
  /** 직전 명중이 반대손이면 성립. 세지 않고 직전 한 번만 본다. */
  /** 이 무기 자신의 콤보가 기준 이상. */
  | { reads: 'self'; required: number }
  /** 반대손의 콤보가 기준 이상. */
  | { reads: 'other'; required: number }
  /** 양손 합계가 기준 이상. */
  | { reads: 'total'; required: number };

/** 콤보 조건이 성립했을 때 일어나는 일. */
export type ComboEffect =
  /** 이 무기의 공격이 강화기술로 나간다. */
  /**
   * 콤보를 소모하고 지정한 손을 한동안 강화한다.
   *
   * `hits`와 `seconds`는 둘 다 상한이며, 먼저 닿는 쪽에서 끝난다.
   * 둘 중 하나만 적어도 된다.
   */
  | {
      kind: 'empower';
      hand: 'self' | 'other';
      /** 피해 증폭 배율. 0.5면 50% 증폭. */
      more: number;
      hits?: number;
      seconds?: number;
      /** 발동하며 소모할 범위. 생략하면 소모하지 않는다. */
      consumes?: 'total' | 'self' | 'other';
    };

export type AreaKind = 'plain' | 'ignite' | 'shock' | 'chill' | 'freeze' | 'wither';

/**
 * 투사체 거동의 적용 우선순위.
 * 원안 보조 시트의 메모 `관통>연쇄>갈래>튕겨쏘기`를 그대로 따른다.
 * 여러 거동이 동시에 붙었을 때 어느 것이 먼저 판정되는지를 정한다.
 */
export const PROJECTILE_BEHAVIOR_PRIORITY = ['pierce', 'chain', 'fork', 'ricochet'] as const;

export interface Skill extends Tagged {
  id: string;
  name: string;
  base: StatBlock;
  /** 장착 가능한 보조능력 슬롯 수. 원안은 스킬당 보조젬 2개. */
  supportSlots: number;
}

export interface Support extends Tagged {
  id: string;
  name: string;
  /** 1형은 성능 보강, 2형은 조건/시너지. 생략하면 1형이다. */
  slotType?: 'primary' | 'synergy';
  /** 이 태그를 모두 가진 스킬에만 장착할 수 있다. */
  requires: readonly Tag[];
  modifiers: readonly Modifier[];
  behaviors?: readonly Behavior[];
  /** UI 표시용 한 줄 설명. */
  description: string;
}

export type AttachResult = { ok: true } | { ok: false; reason: string };

/**
 * 보조능력을 스킬에 장착할 수 있는지 검사한다.
 * 3택1 선택 화면에서 불가능한 선택지를 걸러내는 데 쓴다.
 */
export function canAttach(
  skill: Skill,
  support: Support,
  attached: readonly Support[] = [],
): AttachResult {
  const missing = support.requires.filter((tag) => !skill.tags.includes(tag));
  if (missing.length > 0) {
    return { ok: false, reason: `${skill.name}에 없는 태그가 필요합니다: ${missing.join(', ')}` };
  }
  if (attached.some((s) => s.id === support.id)) {
    return { ok: false, reason: '이미 장착된 보조능력입니다.' };
  }
  if (attached.length >= skill.supportSlots) {
    return { ok: false, reason: `보조능력 슬롯이 가득 찼습니다. (${skill.supportSlots}개)` };
  }
  return { ok: true };
}

export function supportSlotType(support: Support): 'primary' | 'synergy' {
  return support.slotType ?? 'primary';
}

export interface ResolvedSkill {
  skill: Skill;
  supports: readonly Support[];
  stats: StatBlock;
  behaviors: readonly Behavior[];
}

/**
 * 스킬에 보조능력을 적용한 최종 형태를 만든다.
 *
 * 장착 불가능한 보조능력은 조용히 무시하지 않고 제외 목록으로 돌려준다.
 * 데이터 오류를 개발 중에 드러내기 위해서다.
 */
export function resolveSkill(
  skill: Skill,
  supports: readonly Support[],
): ResolvedSkill & { rejected: readonly { support: Support; reason: string }[] } {
  const accepted: Support[] = [];
  const rejected: { support: Support; reason: string }[] = [];

  for (const support of supports) {
    const result = canAttach(skill, support, accepted);
    if (result.ok) {
      accepted.push(support);
    } else {
      rejected.push({ support, reason: result.reason });
    }
  }

  const modifiers: Modifier[] = accepted.flatMap((s) => [...s.modifiers]);
  const behaviors = sortBehaviors(accepted.flatMap((s) => [...(s.behaviors ?? [])]));

  return {
    skill,
    supports: accepted,
    stats: resolveStats(skill.base, modifiers),
    behaviors,
    rejected,
  };
}

/** 투사체 거동을 원안의 우선순위대로 정렬한다. 우선순위 밖의 거동은 뒤에 붙는다. */
export function sortBehaviors(behaviors: readonly Behavior[]): Behavior[] {
  const rank = (b: Behavior): number => {
    const index = (PROJECTILE_BEHAVIOR_PRIORITY as readonly string[]).indexOf(b.kind);
    return index === -1 ? PROJECTILE_BEHAVIOR_PRIORITY.length : index;
  };
  return [...behaviors].sort((a, b) => rank(a) - rank(b));
}

/** 특정 종류의 거동을 찾는다. 여러 개면 첫 번째(우선순위가 가장 높은 것)를 준다. */
export function findBehavior<K extends Behavior['kind']>(
  behaviors: readonly Behavior[],
  kind: K,
): Extract<Behavior, { kind: K }> | undefined {
  return behaviors.find((b) => b.kind === kind) as Extract<Behavior, { kind: K }> | undefined;
}
