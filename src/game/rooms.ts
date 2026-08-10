import type { EnemyKind } from '@/game/enemy';
import type { WeaponId } from '@/data/weapons';
import { SEAL_KEYS } from '@/data/keys';

/**
 * 방 보상.
 *
 * **강화기술은 보상이 아니다.** 무기를 얻으면 그 무기의 강화기술도 따라온다.
 * 예전에는 `comboSkills`로 따로 주웠는데, 검을 가진 사람이 멸검 말고 다른 것을
 * 쓸 방법이 없으므로 그 줍기는 선택을 만들지 않고 관문만 하나 더 만들었다.
 * 강화기술도 마찬가지다. 무기의 첫 소켓에 끼우는 `기본스킬`이라 무기와 함께 온다.
 */
export interface RoomReward {
  weapons?: readonly WeaponId[];
  /** 기본스킬. 무기에 딸려 오지 않으므로 따로 적는다. */
  basicSkills?: readonly string[];
  /** 열쇠. 봉인된 문을 여는 데 쓴다. */
  keys?: readonly string[];
  supports?: readonly string[];
  /** 방 보상이 뜨는 순간 보유하지 않은 보조/연계 중에서 뽑는다. */
  randomSupports?: {
    primary?: number;
    synergy?: number;
    /**
     * 이 무기에 붙일 수 있는 것만 뽑는다. 안 적으면 아무 무기나 된다.
     *
     * 특정 보스가 특정 무기를 키워 주는 자리라는 것을 드랍으로 말하기 위한 것이다.
     * 태그로 거르므로 "검 전용"이라고 따로 표시할 필요가 없다.
     */
    forWeapon?: WeaponId;
    /** 특정 스킬 id에 붙는 것으로 직접 거른다. 예: `annihilation`은 멸검 전용. */
    forSkillId?: string;
  };
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
  /** 방에 들어올 때 한 번 띄우는 안내. 길을 잃지 않게 하는 최소한의 말이다. */
  hint?: string;
  /** 이 열쇠를 전부 갖고 있어야 출구가 열린다. 없으면 적을 정리해도 잠겨 있다. */
  requiresKeys?: readonly string[];
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
    // **첫 보스는 무기와 기본스킬만 준다.** 보조/연계는 위·아래 보스 몫이다.
    //
    // 무기와 기본스킬이 각각 바닥에 떨어진다. 첫 마을에서는 기본스킬 소켓과 R링만
    // 시험하고, 보조/연계 조합은 위·아래 보스 이후부터 열린다.
    reward: {
      weapons: ['bow', 'shield'],
      // 검의 것까지 함께 준다. 기본스킬은 무기에 딸려 오지 않으므로, 여기서 주지
      // 않으면 시작 무기인 검은 소켓을 영영 채울 수 없다.
      basicSkills: ['annihilation', 'volley', 'fracture-wave'],
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
    // 윗길. 기믹이 까다로운 보스다. 검 무기 전용 보조를 준다.
    label: '윗길 제단',
    spawns: [
      { kind: 'warden', count: 1 },
      { kind: 'archer', count: 5 },
    ],
    reward: {
      keys: ['key-upper'],
      randomSupports: { primary: 1, forWeapon: 'sword', forSkillId: 'sword-slash' },
    },
    width: 2100,
    height: 1300,
    tone: { color: 0x2f6b4a, alpha: 0.13 },
    props: [
      { kind: 'pillar', count: 4 },
      { kind: 'brazier', count: 4 },
    ],
  },
  {
    // 아랫길. 기믹은 단순하고 체력이 아주 많다. 검의 옛 콤보스킬이자 현재 첫 소켓
    // 후보인 멸검에 붙는 연계를 준다.
    label: '아랫길 굴',
    spawns: [
      { kind: 'glutton', count: 1 },
      { kind: 'brute', count: 4 },
    ],
    reward: {
      keys: ['key-lower'],
      randomSupports: { synergy: 1, forWeapon: 'sword', forSkillId: 'annihilation' },
    },
    width: 2100,
    height: 1300,
    tone: { color: 0x6b5a2f, alpha: 0.14 },
    props: [
      { kind: 'bones', count: 9 },
      { kind: 'rubble', count: 8 },
    ],
  },
  {
    // 봉인이 풀린 뒤. 열쇠 2개가 없으면 해금 시험장의 오른쪽 문에서 막힌다.
    label: '봉인된 문 안쪽',
    spawns: [
      { kind: 'chaser', count: 18 },
      { kind: 'archer', count: 5 },
      { kind: 'brute', count: 3 },
    ],
    requiresKeys: SEAL_KEYS,
    width: ROOM_WIDTH,
    height: ROOM_HEIGHT,
    tone: { color: 0x3a4a6b, alpha: 0.12 },
    props: [
      { kind: 'rubble', count: 10 },
      { kind: 'pillar', count: 3 },
    ],
  },
  {
    // 최종 보스.
    label: '무너진 문',
    spawns: [
      { kind: 'collapsedDoor', count: 1 },
      { kind: 'chaser', count: 16 },
      { kind: 'archer', count: 5 },
      { kind: 'brute', count: 3 },
    ],
    reward: {
      weapons: ['arcane'],
      basicSkills: ['arcane-daggers'],
      randomSupports: { primary: 1, synergy: 1 },
    },
    width: ROOM_WIDTH,
    height: ROOM_HEIGHT,
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
