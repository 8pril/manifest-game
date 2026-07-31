import type { EnemyKind } from '@/game/enemy';
import type { WeaponId } from '@/data/weapons';

/**
 * 방 구성.
 *
 * 예선 빌드는 첫 보스가 성장 루프를 열고, 이후 방에서는 해금된 무기를 시험한다.
 * 웨이브 사이 보조능력 선택은 새 기획에서 폐기되어 모두 꺼져 있다.
 *
 * 적 수를 정하는 기준은 **방 전체 체력이 아니라 처치 횟수**다.
 * 방마다 총 체력은 예전과 비슷하게 두고 마리당 체력을 낮춰 수를 두 배 이상
 * 늘렸다. 같은 시간 안에 죽는 것이 훨씬 많아야 "썰면서 나아가는" 감각이 난다.
 */

export interface RoomDef {
  label: string;
  spawns: { kind: EnemyKind; count: number }[];
  /** 이 방을 정리한 뒤 보조능력을 고를 수 있는지. */
  offersSupport: boolean;
  /** 이 방을 정리하면 마을로 들어가는지. 첫 보스 뒤 해금 연출에 쓴다. */
  entersTown?: boolean;
  /** 이 방을 정리할 때 확정 해금되는 무기. */
  unlocksWeapons?: readonly WeaponId[];
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
    label: '흐린 입구',
    spawns: [{ kind: 'chaser', count: 12 }],
    offersSupport: false,
    width: 1900,
    height: 1150,
  },
  {
    // 첫 보스. 클리어하면 활/방패와 무기 교체 기능이 해금되고 마을로 들어간다.
    label: '첫 문지기',
    spawns: [
      { kind: 'boss', count: 1 },
      { kind: 'chaser', count: 16 },
    ],
    offersSupport: false,
    entersTown: true,
    unlocksWeapons: ['bow', 'shield'],
    width: 2000,
    height: 1250,
  },
  {
    label: '해금 시험장',
    spawns: [
      { kind: 'chaser', count: 20 },
      { kind: 'archer', count: 4 },
      { kind: 'brute', count: 2 },
    ],
    offersSupport: false,
    width: ROOM_WIDTH,
    height: ROOM_HEIGHT,
  },
  {
    // 첫 보스 뒤 얻은 무기와 R키 교체를 써보는 엘리트 전투.
    label: '파편 회랑',
    spawns: [
      { kind: 'chaser', count: 18 },
      { kind: 'archer', count: 5 },
      { kind: 'brute', count: 3 },
    ],
    offersSupport: false,
    width: ROOM_WIDTH,
    height: ROOM_HEIGHT,
  },
  {
    // 최종 보스.
    //
    // 기획 의도가 "잡몹을 썰면서 나아간 다음 **여러 보스**를 잡아 아이템을 얻는 것"이고
    // "보스는 한 종류로 하면 절대 안 된다"였다. 한 판에 보스를 두 번 만난다.
    //  - 첫 문지기: 해금의 순간. 활/방패를 주고 마을로 보낸다
    //  - 여기: 마무리의 순간. 영구 성장 드랍을 준다 (드랍은 아직 미구현)
    //
    // 잡몹 정리로 판이 끝나면 핵앤슬래시의 마무리가 서지 않는다.
    label: '무너진 문',
    spawns: [
      { kind: 'boss', count: 1 },
      { kind: 'chaser', count: 14 },
      { kind: 'archer', count: 4 },
      { kind: 'brute', count: 2 },
    ],
    offersSupport: false,
    width: ROOM_WIDTH,
    height: ROOM_HEIGHT,
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
