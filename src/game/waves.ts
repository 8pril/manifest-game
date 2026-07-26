import type { EnemyKind } from '@/game/enemy';

/**
 * 웨이브 구성.
 *
 * 한 판은 웨이브 3개와 보스로 이루어지며, 각 웨이브를 정리할 때마다
 * 보조능력을 하나 고른다. 전체 3-5분을 목표로 한다.
 */

export interface WaveDef {
  label: string;
  spawns: { kind: EnemyKind; count: number }[];
  /** 이 웨이브를 정리한 뒤 보조능력을 고를 수 있는지. */
  offersSupport: boolean;
}

export const WAVES: readonly WaveDef[] = [
  {
    label: '웨이브 1',
    spawns: [{ kind: 'chaser', count: 5 }],
    offersSupport: true,
  },
  {
    // 사수가 처음 등장한다. 여기서부터 거리를 벌리는 것만으로는 안전하지 않다.
    label: '웨이브 2',
    spawns: [
      { kind: 'chaser', count: 6 },
      { kind: 'archer', count: 2 },
      { kind: 'brute', count: 1 },
    ],
    offersSupport: true,
  },
  {
    label: '웨이브 3',
    spawns: [
      { kind: 'chaser', count: 7 },
      { kind: 'archer', count: 3 },
      { kind: 'brute', count: 2 },
    ],
    offersSupport: true,
  },
  {
    label: '보스',
    spawns: [
      { kind: 'boss', count: 1 },
      { kind: 'chaser', count: 4 },
      { kind: 'archer', count: 2 },
    ],
    offersSupport: false,
  },
];

export const TOTAL_WAVES = WAVES.length;

export function waveAt(index: number): WaveDef | undefined {
  return WAVES[index];
}

/** 웨이브의 총 적 수. HUD 표시와 테스트에 쓴다. */
export function enemyCount(wave: WaveDef): number {
  return wave.spawns.reduce((sum, spawn) => sum + spawn.count, 0);
}
