import type { EnemyKind } from '@/game/enemy';
import type { WeaponId } from '@/data/weapons';

export interface RoomReward {
  weapons?: readonly WeaponId[];
  comboSkills?: readonly string[];
  supports?: readonly string[];
}

/**
 * 방 구성.
 *
 * 예선 빌드는 첫 보스가 성장 루프를 열고, 이후 방에서는 해금된 무기를 시험한다.
 * 웨이브 사이 보조능력 선택은 새 기획에서 폐기되어 모두 꺼져 있다.
 *
 * 적 수를 정하는 기준은 방의 역할이다.
 * 1~2번 방은 조작과 첫 보스 학습 구간이라 적을 적게 두고, 마을 이후부터
 * "썰면서 나아가는" 밀도를 올린다.
 */

/** 바닥에 흩뿌리는 장식물. 충돌 판정이 없어 전투 계산에 영향을 주지 않는다. */
export type PropKind = 'rubble' | 'pillar' | 'bones' | 'brazier';

/**
 * 방의 색조.
 *
 * 바닥 위에 반투명하게 덮어 방마다 다른 인상을 준다. `setTint`를 쓰지 않는 이유는 두 가지다.
 * 틴트는 곱연산이라 이미 어두운 바닥(#0a0b0f)에 어떤 색을 넣어도 더 어두워지기만 하고,
 * WebGL이 없는 환경에서 조용히 무시된다.
 */
export interface RoomTone {
  color: number;
  alpha: number;
}

export interface RoomDef {
  label: string;
  spawns: { kind: EnemyKind; count: number }[];
  /** 이 방을 정리하면 마을로 들어가는지. 첫 보스 뒤 해금 연출에 쓴다. */
  entersTown?: boolean;
  /** 이 방을 정리할 때 보유 목록에 들어가는 확정 보상. */
  reward?: RoomReward;
  /** 방의 크기. 화면(1280×720)보다 크면 카메라가 플레이어를 따라간다. */
  width: number;
  height: number;
  /** 바닥 색조. 방마다 달라야 "다른 곳에 왔다"가 읽힌다. */
  tone: RoomTone;
  /** 바닥 장식물의 종류와 개수. 방의 성격을 말해주는 만큼만 둔다. */
  props: { kind: PropKind; count: number }[];
}

/** 기본 방 크기. 화면의 두 배 남짓이라 한눈에 다 들어오지 않는다. */
export const ROOM_WIDTH = 2400;
export const ROOM_HEIGHT = 1400;

export const ROOMS: readonly RoomDef[] = [
  {
    // 첫 방은 조금 작게 잡아 조작을 익히게 한다.
    label: '흐린 입구',
    spawns: [{ kind: 'chaser', count: 6 }],
    reward: {
      comboSkills: ['annihilation'],
    },
    width: 1900,
    height: 1150,
    // 시작 방은 색을 거의 넣지 않는다. 기준점이 있어야 뒤의 방이 달라 보인다.
    tone: { color: 0x3a4a6b, alpha: 0.08 },
    props: [
      { kind: 'rubble', count: 5 },
      { kind: 'bones', count: 2 },
    ],
  },
  {
    // 첫 보스. 클리어하면 활/방패와 무기 교체 기능이 해금되고 마을로 들어간다.
    label: '첫 문지기',
    spawns: [
      { kind: 'gatekeeper', count: 1 },
      { kind: 'chaser', count: 4 },
    ],
    entersTown: true,
    reward: {
      weapons: ['bow', 'shield'],
      comboSkills: ['volley', 'fracture-wave'],
      // `콤보 개방`은 강화기술 전환을 여는 유일한 열쇠다. 콤보를 기본 규칙에서
      // 뺐으므로 이걸 얻기 전까지는 어떤 무기도 기본 공격만 쓴다.
      // 첫 보스가 무기와 강화기술을 함께 여는 자리라 여기서 준다. 더 뒤로 미루면
      // 1회차에 강화기술을 한 번도 못 보고, 그건 심사에서 게임의 절반이 빠지는 것이다.
      supports: ['combo-imprint'],
    },
    width: 2000,
    height: 1250,
    // 첫 보스방. 붉은 기를 넣어 앞 방과 확실히 갈라 놓는다.
    tone: { color: 0x6b2f34, alpha: 0.13 },
    // 보스가 지키고 있던 곳이다. 불 꺼진 화로를 둬서 누가 머물던 자리로 읽히게 한다.
    props: [
      { kind: 'brazier', count: 3 },
      { kind: 'pillar', count: 2 },
      { kind: 'rubble', count: 4 },
    ],
  },
  {
    label: '해금 시험장',
    spawns: [
      { kind: 'chaser', count: 20 },
      { kind: 'archer', count: 4 },
      { kind: 'brute', count: 2 },
    ],
    width: ROOM_WIDTH,
    height: ROOM_HEIGHT,
    tone: { color: 0x2f5f6b, alpha: 0.11 },
    props: [
      { kind: 'rubble', count: 9 },
      { kind: 'bones', count: 5 },
      { kind: 'pillar', count: 2 },
    ],
  },
  {
    // 첫 보스 뒤 얻은 무기와 R키 교체를 써보는 엘리트 전투.
    label: '파편 회랑',
    spawns: [
      { kind: 'chaser', count: 18 },
      { kind: 'archer', count: 5 },
      { kind: 'brute', count: 3 },
    ],
    width: ROOM_WIDTH,
    height: ROOM_HEIGHT,
    // 이름이 "파편 회랑"이다. 부러진 기둥을 가장 많이 둔다.
    tone: { color: 0x4a3a6b, alpha: 0.12 },
    props: [
      { kind: 'pillar', count: 7 },
      { kind: 'rubble', count: 7 },
    ],
  },
  {
    // 최종 보스.
    //
    // 기획 의도가 "잡몹을 썰면서 나아간 다음 **여러 보스**를 잡아 아이템을 얻는 것"이고
    // "보스는 한 종류로 하면 절대 안 된다"였다. 한 판에 보스를 두 번 만난다.
    //  - 첫 문지기: 해금의 순간. 활/방패를 주고 마을로 보낸다
    //  - 여기: 마무리의 순간. 영구 성장 드랍을 준다
    //
    // 잡몹 정리로 판이 끝나면 핵앤슬래시의 마무리가 서지 않는다.
    label: '무너진 문',
    spawns: [
      { kind: 'collapsedDoor', count: 1 },
      { kind: 'chaser', count: 14 },
      { kind: 'archer', count: 4 },
      { kind: 'brute', count: 2 },
    ],
    reward: {
      weapons: ['arcane'],
      comboSkills: ['arcane-daggers'],
      supports: ['chain', 'crackling-ground'],
    },
    width: ROOM_WIDTH,
    height: ROOM_HEIGHT,
    // 최종 보스방. 보라를 가장 세게 넣는다. 타이틀 화면의 빛과 같은 색이다.
    tone: { color: 0x5b3a8f, alpha: 0.17 },
    props: [
      { kind: 'rubble', count: 11 },
      { kind: 'bones', count: 7 },
      { kind: 'pillar', count: 4 },
      { kind: 'brazier', count: 3 },
    ],
  },
];

/**
 * 마을의 색조와 장식물.
 *
 * 전투방이 전부 차갑고 어두우므로 마을만 따뜻하게 둔다. 안전한 곳이라는 것을
 * 글자가 아니라 색으로 먼저 알린다. 잔해와 뼈는 두지 않는다 — 정돈된 곳이어야 한다.
 */
export const TOWN_TONE: RoomTone = { color: 0x8a6a3a, alpha: 0.1 };
export const TOWN_PROPS: { kind: PropKind; count: number }[] = [
  { kind: 'brazier', count: 3 },
  { kind: 'pillar', count: 2 },
];

export const TOTAL_ROOMS = ROOMS.length;

export function roomAt(index: number): RoomDef | undefined {
  return ROOMS[index];
}

/** 방의 총 적 수. HUD 표시와 테스트에 쓴다. */
export function enemyCount(wave: RoomDef): number {
  return wave.spawns.reduce((sum, spawn) => sum + spawn.count, 0);
}
