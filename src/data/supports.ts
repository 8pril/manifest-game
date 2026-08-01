import type { Support } from '@/engine/support';

/**
 * 보조능력 데이터.
 *
 * 원안 `01. 기획초안.xlsx`의 보조 시트에서 가져왔다.
 * 여기에 있는 어떤 항목도 전용 코드를 갖지 않는다. 전부 아래 세 엔진의 조합이다.
 *
 *   - 투사체 조합 엔진 (`engine/projectile.ts`)
 *   - 지대 엔진 (`engine/area.ts`)
 *   - 범용 수정자 파이프라인 (`engine/modifiers.ts`)
 *
 * 새 보조능력을 추가하는 일은 이 배열에 항목을 하나 더 넣는 일이다.
 */

// ─────────────────────────────────────────────
// 투사체 조합 엔진에서 파생 (7종)
// ─────────────────────────────────────────────

const PROJECTILE_SUPPORTS: Support[] = [
  {
    id: 'multiple-projectiles',
    name: '다중투사체',
    slotType: 'primary',
    tags: ['투사체'],
    requires: ['투사체'],
    modifiers: [
      { stat: 'projectileCount', mode: 'flat', value: 2 },
      { stat: 'damage', mode: 'reduce', value: 0.4 },
    ],
    description: '발사하는 투사체 수 +2, 투사체 피해 40% 감소',
  },
  {
    id: 'fork',
    name: '갈래',
    slotType: 'primary',
    tags: ['투사체'],
    requires: ['투사체'],
    modifiers: [{ stat: 'damage', mode: 'reduce', value: 0.4 }],
    behaviors: [{ kind: 'fork', count: 3 }],
    description: '갈라지는 투사체 수 +3, 투사체 피해 40% 감소',
  },
  {
    id: 'pierce',
    name: '관통',
    slotType: 'primary',
    tags: ['투사체'],
    requires: ['투사체'],
    modifiers: [],
    behaviors: [{ kind: 'pierce', count: 2 }],
    description: '투사체가 관통함. 관통 횟수 2회',
  },
  {
    id: 'greater-pierce',
    name: '상위 관통',
    slotType: 'primary',
    tags: ['투사체'],
    requires: ['투사체'],
    modifiers: [],
    behaviors: [{ kind: 'pierce', count: 'all' }],
    description: '투사체가 모든 대상을 관통함',
  },
  {
    id: 'chain',
    name: '연쇄',
    slotType: 'primary',
    tags: ['투사체'],
    requires: ['투사체'],
    modifiers: [],
    behaviors: [{ kind: 'chain', count: 2, sameTargetLimit: 2, damageFalloff: 0.2 }],
    description: '연쇄 추가 +2, 연쇄될 때마다 투사체 피해 20% 감소',
  },
  {
    id: 'ricochet',
    name: '튕겨쏘기',
    slotType: 'primary',
    tags: ['투사체'],
    requires: ['투사체'],
    modifiers: [],
    behaviors: [{ kind: 'ricochet', count: 1 }],
    description: '지형에 부딪힌 후 투사체가 추가 1회 튕겨짐',
  },
  {
    id: 'faster-projectiles',
    name: '투사체 속도 증가',
    slotType: 'primary',
    tags: ['투사체'],
    requires: ['투사체'],
    modifiers: [
      { stat: 'projectileSpeed', mode: 'increase', value: 0.5 },
      { stat: 'damage', mode: 'increase', value: 0.2 },
    ],
    description: '투사체 속도 50% 증가, 투사체 피해 20% 증가',
  },
];

// ─────────────────────────────────────────────
// 지대 엔진에서 파생 (4종)
// ─────────────────────────────────────────────

const AREA_SUPPORTS: Support[] = [
  {
    id: 'explosive-ground',
    name: '폭발하는 지대',
    slotType: 'primary',
    tags: ['지대', '지속시간', '화염'],
    requires: ['지대'],
    modifiers: [{ stat: 'damage', mode: 'reduce', value: 0.6 }],
    behaviors: [
      { kind: 'areaKind', value: 'ignite' },
      { kind: 'convert', to: '화염', ratio: 0.4 },
    ],
    description: '지대가 생성되고 2초 후 폭발, 물리 피해의 40%를 화염으로 전환',
  },
  {
    id: 'crackling-ground',
    name: '찌릿거리는 지대',
    slotType: 'primary',
    tags: ['지대', '지속시간', '번개'],
    requires: ['지대'],
    modifiers: [{ stat: 'duration', mode: 'flat', value: 1 }],
    behaviors: [
      { kind: 'areaKind', value: 'shock' },
      { kind: 'convert', to: '번개', ratio: 0.5 },
    ],
    description: '감전 지대로 전환. 지속시간 +1초, 물리 피해의 50%를 번개로 전환',
  },
  {
    id: 'dragging-ground',
    name: '끌어내리는 지대',
    slotType: 'primary',
    tags: ['지대', '지속시간', '냉기'],
    requires: ['지대'],
    modifiers: [{ stat: 'duration', mode: 'flat', value: 2 }],
    behaviors: [
      { kind: 'areaKind', value: 'chill' },
      { kind: 'convert', to: '냉기', ratio: 0.5 },
    ],
    description: '냉각 지대로 전환. 지속시간 +2초, 물리 피해의 50%를 냉기로 전환',
  },
  {
    id: 'earthquake',
    name: '지진',
    slotType: 'primary',
    tags: ['지대', '지속시간', '공격', '물리'],
    requires: ['지대'],
    modifiers: [
      { stat: 'damage', mode: 'reduce', value: 0.2 },
      { stat: 'tickInterval', mode: 'reduce', value: 0.5 },
      { stat: 'areaRadius', mode: 'increase', value: 1.0 },
    ],
    behaviors: [{ kind: 'hinder' }],
    description: '효과 범위 100% 증가, 지속피해 간격 50% 가속, 지대 피해 20% 감소, 이동 방해',
  },
];

// ─────────────────────────────────────────────
// 범용 수정자 파이프라인에서 파생 (4종)
// ─────────────────────────────────────────────

const MODIFIER_SUPPORTS: Support[] = [
  {
    id: 'opulence',
    name: '부귀',
    slotType: 'primary',
    tags: ['공격'],
    requires: ['공격'],
    modifiers: [{ stat: 'damage', mode: 'increase', value: 0.25 }],
    description: '보조 대상 스킬의 피해 25% 증가',
  },
  {
    // 원안의 "콤보 50% 확률로 2배 획득"은 확률 대신 결정적인 1.5배로 구현했다.
    // 3-5분짜리 한 판에서 콤보 획득량이 운에 좌우되면 발동 스킬을 한 번도
    // 못 보는 판이 생길 수 있어, 기댓값은 유지하되 분산을 없앴다.
    id: 'bold-resolve',
    name: '과감한 결단',
    slotType: 'primary',
    tags: ['공격'],
    requires: ['공격'],
    modifiers: [
      { stat: 'comboDuration', mode: 'more', value: 1.0 },
      { stat: 'comboGain', mode: 'more', value: 0.5 },
      { stat: 'damage', mode: 'increase', value: 0.1 },
    ],
    description: '콤보 지속시간 100% 증폭, 콤보 획득 1.5배, 피해 10% 증가',
  },
  {
    id: 'added-stacks',
    name: '추가 중첩',
    slotType: 'primary',
    tags: ['중첩'],
    requires: ['중첩'],
    modifiers: [
      { stat: 'maxStacks', mode: 'flat', value: 1 },
      { stat: 'damage', mode: 'reduce', value: 0.1 },
    ],
    description: '중첩 가능 횟수 +1, 보조 대상 스킬의 피해 10% 감소',
  },
  {
    id: 'lasting-composure',
    name: '지속되는 평정',
    slotType: 'primary',
    tags: ['지속시간'],
    requires: ['지속시간'],
    modifiers: [{ stat: 'duration', mode: 'more', value: 0.5 }],
    description: '보조 대상 스킬의 지속시간 50% 증폭',
  },
];

const SYNERGY_SUPPORTS: Support[] = [
  {
    id: 'wound-seeker',
    name: '상처 추적',
    slotType: 'synergy',
    tags: ['투사체', '상처', '시너지'],
    requires: ['투사체'],
    modifiers: [],
    behaviors: [{ kind: 'statusDamage', status: 'wound', more: 0.35 }],
    description: '상처가 있는 대상에게 투사체 피해 35% 증폭',
  },
  {
    id: 'wound-resonance',
    name: '상처 공명',
    slotType: 'synergy',
    tags: ['지대', '상처', '시너지'],
    requires: ['지대'],
    modifiers: [],
    behaviors: [{ kind: 'statusDamage', status: 'wound', more: 0.35 }],
    description: '상처가 있는 대상에게 지대 피해 35% 증폭',
  },
  {
    id: 'fracture-resonance',
    name: '균열 공명',
    slotType: 'synergy',
    tags: ['공격', '균열', '시너지'],
    requires: ['공격'],
    modifiers: [],
    behaviors: [{ kind: 'statusDamage', status: 'fracture', more: 0.5 }],
    description: '균열 상태의 대상에게 피해 50% 증폭',
  },
];

export const SUPPORTS: readonly Support[] = [
  ...PROJECTILE_SUPPORTS,
  ...AREA_SUPPORTS,
  ...MODIFIER_SUPPORTS,
  ...SYNERGY_SUPPORTS,
];

export function findSupport(id: string): Support | undefined {
  return SUPPORTS.find((s) => s.id === id);
}
