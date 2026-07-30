import type { EnemyKind } from '@/game/enemy';

/**
 * 방 구성.
 *
 * 한 판은 방 3개와 보스 방으로 이루어지며, 각 방을 정리할 때마다
 * 보조능력을 하나 고른다. 전체 3-5분을 목표로 한다.
 */

export interface RoomDef {
  label: string;
  spawns: { kind: EnemyKind; count: number }[];
  /** 이 방을 정리한 뒤 보조능력을 고를 수 있는지. */
  offersSupport: boolean;
  /** 방의 크기. 화면(1280×720)보다 크면 카메라가 플레이어를 따라간다. */
  width: number;
  height: number;
}

/** 기본 방 크기. 화면의 두 배 남짓이라 한눈에 다 들어오지 않는다. */
export const ROOM_WIDTH = 2400;
export const ROOM_HEIGHT = 1400;

export const ROOMS: readonly RoomDef[] = [
  {
    // 첫 방은 조금 작게 잡아 조작을 익히게 한다.
    label: '1번 방',
    spawns: [{ kind: 'chaser', count: 5 }],
    offersSupport: true,
    width: 1900,
    height: 1150,
  },
  {
    // 사수가 처음 등장한다. 여기서부터 거리를 벌리는 것만으로는 안전하지 않다.
    label: '2번 방',
    spawns: [
      { kind: 'chaser', count: 6 },
      { kind: 'archer', count: 2 },
      { kind: 'brute', count: 1 },
    ],
    offersSupport: true,
    width: ROOM_WIDTH,
    height: ROOM_HEIGHT,
  },
  {
    label: '3번 방',
    spawns: [
      { kind: 'chaser', count: 7 },
      { kind: 'archer', count: 3 },
      { kind: 'brute', count: 2 },
    ],
    offersSupport: true,
    width: ROOM_WIDTH,
    height: ROOM_HEIGHT,
  },
  {
    // 보스 방은 넓지만 도망칠 곳이 적도록 중간 크기로 둔다.
    label: '보스 방',
    spawns: [
      { kind: 'boss', count: 1 },
      { kind: 'chaser', count: 4 },
      { kind: 'archer', count: 2 },
    ],
    offersSupport: false,
    width: 2000,
    height: 1250,
  },
];

export const TOTAL_ROOMS = ROOMS.length;

export function roomAt(index: number): RoomDef | undefined {
  return ROOMS[index];
}

/** 방의 총 적 수. HUD 표시와 테스트에 쓴다. */
export function enemyCount(wave: RoomDef): number {
  return wave.spawns.reduce((sum, spawn) => sum + spawn.count, 0);
}
