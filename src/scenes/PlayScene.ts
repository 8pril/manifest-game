import Phaser from 'phaser';
import {
  applyRenderScale,
  followInRoom,
  pinToScreen,
  pinContainer,
  pointerScreenLocal,
  screenX,
  screenY,
  VIEW_WIDTH,
  VIEW_HEIGHT,
} from '@/render';
import { ring, flash, floatingText, impact, hitSpark, deathBurst } from '@/effects';
import { publishDebugState, DEBUG_ENABLED } from '@/debug';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, STATUS_COLORS } from '@/config';
import { attackIntervalFor, basicSkillsOf, deliveryOf, weaponOf, WEAPON_IDS, WEAPON_LIST, type Weapon, type WeaponId } from '@/data/weapons';
import { SUPPORTS, findSupport } from '@/data/supports';
import { findKey, missingKeys } from '@/data/keys';
import {
  attachableSkills,
  canAttach,
  findBehavior,
  resolveSkill,
  supportSlotType,
  type Behavior,
  type Skill,
  type Support,
} from '@/engine/support';
import type { Stat } from '@/engine/modifiers';
import {
  spawnProjectiles,
  advance,
  onHitTarget,
  resetProjectileIds,
  isOutOfBounds,
  type Projectile,
} from '@/engine/projectile';
import { targetsInArc } from '@/engine/melee';
import { applyKnockback } from '@/engine/knockback';
import {
  createArea,
  tickArea,
  containsPoint,
  remainingRatio,
  resetAreaIds,
  AREA_COLORS,
  type Area,
} from '@/engine/area';
import {
  applyStatus,
  tickStatuses,
  isStunned,
  consumeBrand,
  incomingDamageMultiplier,
  hasStatus,
  findStatus,
  STATUS_RULES,
  WOUND_BURST_DAMAGE,
  consumeWound,
  WOUND_CONSUME_PER_STACK,
  ARCANE_FLOW_MORE,
  ARCANE_FLOW_DURATION,
  EXPOSED_DAMAGE_INCREASE,
  FRACTURE_IMMUNITY,
  STUN_DURATION,
  type StatusKind,
} from '@/engine/status';
import {
  ENEMY_STATS,
  advanceBossPattern,
  bossContactDamage,
  bossMoveDirection,
  bossMoveSpeed,
  createEnemy,
  enemySpeed,
  isBossKind,
  isAlive,
  resetEnemyIds,
  desiredDirection,
  readyToFire,
  markFired,
  staggerBossOnWall,
  type BossEvent,
  type Enemy,
  type EnemyKind,
} from '@/game/enemy';
import {
  ROOMS,
  TOTAL_ROOMS,
  TOWN_PROPS,
  TOWN_TONE,
  type PropKind,
  type RoomReward,
  type RoomTone,
} from '@/game/rooms';
import { loreFor, LORE_RADIUS } from '@/data/lore';
import { leftWeapon, rightWeapon, resolveFor, supportsFor, describeByHand, loadoutFromProgress } from '@/game/loadout';
import {
  createCombo,
  gainCombo,
  sustainCombo,
  refreshCombo,
  tickCombo,
  consumeCombo,
  comboRulesOf,
  comboTriggerMet,
  comboReadout,
  otherHand,
  COMBO_MAX,
  COMBO_REQUIRED,
  type ComboState,
} from '@/game/combo';
import { grantEmpower, empowerMore, spendEmpower, tickEmpower, type EmpowerByHand } from '@/game/empower';
import {
  createRun,
  clearRoom,
  clearRoomTo,
  collectRoomReward,
  leaveTown,
  markCurrentRoomCleared,
  moveToRoom,
  retryCurrentRoom,
  damagePlayer as applyPlayerDamage,
  usePotion,
  addKill,
  advanceTime,
  hasActiveShield,
  exitUnlocked,
  isOver,
  newPartsOfReward,
  SHIELD_ENERGY_MAX,
  POTION_MAX_CHARGE,
  POTION_USE_COST,
  type RunState,
} from '@/game/run';
import {
  basicSkillItem,
  cellsOf,
  INVENTORY_COLUMNS,
  INVENTORY_ROWS,
  type InventoryFilter,
  type InventoryItem,
} from '@/game/inventory';
import { configureManifestation, createInitialProgress, equipFirstWheelSlots, equipFromWheel, grantComboSupport, equippedBasicSkill, unlockSupports, unlockWeapons, setWheelSlot, swapWheelSlots, moveInventoryItem, sortInventory, type Hand, type PlayerProgress } from '@/game/progression';
import { parseDebugStartWithMode } from '@/game/debug-start';
import { clearSavedProgress, loadRunCheckpoint, saveRunCheckpoint, type RunCheckpoint } from '@/game/progress-storage';
import { playSfx } from '@/audio/sfx';
import { canApplyCrowdControl } from '@/game/crowd-control';

const MOVE_SPEED = 300;
const DASH_SPEED = 900;
const DASH_DURATION_MS = 130;
const DASH_COOLDOWN_MS = 900;
const PLAYER_RADIUS = 20;
/** 방 벽 두께. 이 안쪽이 실제로 움직일 수 있는 영역이다. */
const WALL = 24;
/** 출구 폭. 방을 정리하면 여기가 열린다. */
const EXIT_SIZE = 140;
/** 미니맵이 차지하는 정사각 영역의 한 변(px). 방은 이 안에 비율을 지켜 들어간다. */
const MINIMAP_MAX = 132;

/**
 * 마을 설정 패널 배치.
 *
 * 기획서(`UI구성.pptx`)의 도형 좌표를 그대로 옮겼다. 원본이 960×540 슬라이드라
 * 논리 해상도 1280×720에 맞춰 4/3배 했다.
 *
 * ```
 * ┌ 패널 ────────────────────────────────────┐
 * │ [탭1]  좌: 탭 내용        우: 인벤토리      │
 * │ [탭2]                      [전체][무기][보조]│
 * │                            7×7 격자         │
 * │                            [자동정렬]       │
 * └──────────────────────────────────────────┘
 * ```
 */
const TOWN_UI = {
  panel: { x: 45, y: 47, w: 1180, h: 635 },
  /** 좌측 세로 메인 탭. 무기 설정 / 기술 설정. */
  mainTab: { x: 75, y: 127, w: 92, h: 40, gap: 8 },
  /** 좌측 탭 내용 영역. */
  content: { x: 181, y: 127, w: 452, h: 544 },
  /** 우측 인벤토리 필터 탭 3개. */
  filterTab: { x: 651, y: 127, w: 100, h: 40, gap: 8 },
  /** 우측 인벤토리 본체. 격자 7×7과 하단 자동정렬 버튼이 함께 들어가야 한다. */
  inventory: { x: 651, y: 176, w: 484, h: 490 },
  /**
   * 격자 칸 한 변과 간격.
   *
   * 7×7이 인벤토리 안에 들어가야 한다. 처음에 56으로 잡았더니 세로가 2px 모자라
   * 마지막 줄이 잘리고 자동정렬 버튼과 겹쳤다. `칸×7 + 간격×6 + 여백`이 높이보다
   * 작은지 확인하고 정할 것.
   */
  cell: 52,
  cellGap: 6,
} as const;
const STATUS_ORDER: StatusKind[] = ['wound', 'exposed', 'brand', 'fracture'];
/** 벽까지 밀린 적이 받는 추가 피해. */
const WALL_SLAM_DAMAGE = 40;
/** 상태 연출 색. 상태 표시 점과 같은 색을 써서 무엇이 터졌는지 연결되게 한다. */
const BURST_COLOR = 0xff6b6b;
const BRAND_COLOR = 0xb08bff;
const STUN_COLOR = 0xd8f3ff;
const BOSS_PATTERN_COLOR = 0xffd166;
/** R키 링 메뉴가 완전히 펼쳐져 선택 가능해지는 시간(ms). */
const WHEEL_OPEN_MS = 150;
const WHEEL_RADIUS = 122;
const WHEEL_INNER_RADIUS = 24;
const REWARD_PICKUP_RADIUS = 78;
const REWARD_HINT_RADIUS = 170;
const REWARD_PICKUP_DELAY_MS = 500;
const REWARD_DROP_SPREAD = 124;
const REWARD_DROP_MIN_DISTANCE = REWARD_PICKUP_RADIUS + 12;
const REWARD_DROP_MIN_SEPARATION = 56;
const TOWN_WIDTH = 1600;
const TOWN_HEIGHT = 900;
const TOWN_NPC_RADIUS = 92;
/** 방패 스윙 중에는 보스 CC가 안 통해도 버티는 역할을 갖는다. */
const SHIELD_GUARD_DAMAGE_TAKEN = 0.45;
/** 보스 강공격을 맞았을 때 플레이어가 밀려나는 거리. */
const BOSS_CHARGE_PLAYER_KNOCKBACK = 92;
const BOSS_SHOCK_PLAYER_KNOCKBACK = 76;

/**
 * 스프라이트가 있으면 스프라이트, 없으면 도형.
 *
 * 이미지 로딩이 실패해도 게임이 돌아가야 한다. 둘 다 위치·알파·깊이는 같은 방식으로
 * 다루고, 색만 방식이 다르다(도형은 채우기, 스프라이트는 틴트). `tintView`가 그 차이를 흡수한다.
 */
type ShapeOrSprite = Phaser.GameObjects.Rectangle | Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite;

function tintView(view: ShapeOrSprite, color: number): void {
  if (view instanceof Phaser.GameObjects.Sprite) view.setTint(color);
  else view.setFillStyle(color);
}

/**
 * 스프라이트를 히트박스보다 크게 그리는 배율.
 *
 * 도형일 때는 그리는 크기가 곧 판정 범위였다. 그림은 다르다. 판정 크기 그대로 그리면
 * 후드도 마후라도 안 보이는 색덩어리가 된다(사냥개가 화면 세로의 5.6%였다).
 * **이 값은 보이는 크기만 바꾼다.** `ENEMY_STATS.radius`는 그대로이므로 근접 사거리,
 * 투사체 명중, 넉백, DPS 벤치 수치가 전부 영향을 받지 않는다.
 */
const SPRITE_SCALE = 1.4;

/**
 * 플레이어만 더 크게 그린다.
 *
 * 플레이어와 사냥개는 판정 반지름이 똑같이 20이라, 같은 배율을 쓰면 화면에서도 같은 크기가 된다.
 * 도형일 때는 안 보이던 문제인데 그림이 되니 주인공이 잡몹에 묻힌다.
 * 게다가 개는 가로로 긴 동물이라 긴 변을 기준으로 맞추면 사람 키만큼 길어진다.
 *
 * 판정은 그대로다. 그림이 판정보다 커지는 방향은 **플레이어에게 관대한 쪽**이라
 * (겹쳐 보여도 안 맞음) 체감을 해치지 않는다. 반대로 적은 이 방향이 헛스윙으로 느껴지므로
 * 적에게는 같은 값을 쓰지 않는다.
 */
const PLAYER_SPRITE_SCALE = 1.7;

/** 무기별 투사체 이미지. 방패는 투사체를 쓰지 않아 검 이미지를 공유한다. */
/** 열쇠 스프라이트. `data/keys.ts`의 id와 짝을 맞춘다. */
const KEY_SPRITE: Record<string, string> = {
  'key-upper': 'key-upper',
  'key-lower': 'key-lower',
};

const BOLT_SPRITE: Record<WeaponId, string> = {
  sword: 'bolt-sword',
  bow: 'bolt-bow',
  arcane: 'bolt-arcane',
  shield: 'bolt-sword',
};

/** 손에 든 무기를 캐릭터 옆에 그린다. 어느 무기를 들었는지 HUD를 안 봐도 알 수 있게 한다. */
const WEAPON_SPRITE: Record<WeaponId, string> = {
  sword: 'weapon-sword',
  bow: 'weapon-bow',
  arcane: 'weapon-arcane',
  shield: 'weapon-shield',
};
const WEAPON_VIEW_SIZE = 34;

/**
 * 무기 그림에서 **손이 잡는 지점**. 회전 중심이자 손에 붙는 자리다.
 *
 * 예전에는 네 무기 모두 `(0.2, 0.5)`를 썼다. 그런데 그림마다 손잡이가 있는 자리가
 * 다르다. 검은 손잡이가 왼쪽 위 구석인데 `(0.2, 0.5)`는 날 한가운데라, 손잡이와
 * 자루끝이 통째로 주먹 뒤로 삐져나왔다. 실측하면 6.8px — 장갑 폭(15px)의 절반이다.
 *
 * 값은 `public/sprites/weapon-*.png`에 십분율 격자를 씌워 읽었다. 아트를 다시 뽑으면
 * 같은 방법으로 다시 읽으면 된다.
 */
const WEAPON_GRIP_ORIGIN: Record<WeaponId, { x: number; y: number }> = {
  /** 자루끝과 코등이 사이. 날은 오른쪽 아래로 뻗는다. */
  sword: { x: 0.13, y: 0.16 },
  /** 활은 끝이 아니라 한가운데를 잡는다. 화살이 활대를 지나는 지점이다. */
  bow: { x: 0.5, y: 0.42 },
  /** 결정을 감은 띠. 뾰족한 쪽이 앞이다. */
  arcane: { x: 0.3, y: 0.48 },
  /**
   * 방패는 원판이 아니라 **뒤에 달린 손잡이 막대**를 잡는다.
   *
   * 원판 중심(0.45, 0.45)에 두면 막대가 주먹 밖으로 통째로 나와, 방패에서 뾰족한 것이
   * 삐져나온 것처럼 보인다. 격자로 재면 막대는 (0.65, 0.63)~(0.90, 0.80)이다.
   * 그 위에 손을 얹으면 막대가 주먹과 원판 사이에 놓여 손잡이로 읽힌다.
   */
  shield: { x: 0.84, y: 0.75 },
};

/**
 * 손에 든 무기의 깊이. **손이 아니라 그림 속 자리로 정한다.**
 *
 * 양손 다 캐릭터(10)보다 위다. 한 번 아래 자리 무기를 몸 뒤(9.6)로 내렸다가 무기가
 * 아예 보이지 않아 되돌렸다. 그 자리는 손 위치가 몸 한가운데(-19, +18)라 27px짜리
 * 무기가 실루엣을 벗어나지 못한다 — 실측하면 검 칼끝이 (+2, +1)로 몸통 정중앙이고
 * 방패는 (-7, -6)이다. 몸 뒤로 내리면 둘 다 통째로 가려진다.
 *
 * 두 자리가 겹칠 때는 **화면 아래쪽 자리가 위로** 온다. 내려다보는 시점이라 아래에
 * 있는 것이 카메라에 더 가깝다.
 */
const WEAPON_SLOT_DEPTH = { left: 10.8, right: 11 } as const;

/**
 * 실체화 코어 — 장갑에서 무기가 솟는 지점.
 *
 * 무기가 불투명한 오브젝트로만 얹혀 있으면 **주운 물건을 쥔 것**으로 읽힌다. 이 게임의
 * 장갑은 무기를 쥐는 것이 아니라 형태를 실체화한다(`docs/concept-brief.md`). 손에
 * 무기색 빛을 두고 그 위로 무기가 이어지게 하면 그 관계가 그림으로 드러난다.
 *
 * 자기 무기보다 한 겹 뒤에 둬서 무기가 빛에서 뻗어 나온 것처럼 보이게 한다.
 * 다만 캐릭터(10)보다는 위여야 한다. 아래로 내리면 손이 몸 안쪽이라 빛이 묻힌다.
 */
const WEAPON_SLOT_CORE_DEPTH = { left: 10.7, right: 10.9 } as const;
const WEAPON_CORE_RADIUS = 7;
const WEAPON_CORE_ALPHA = 0.5;

/**
 * 그림 속 실제 손 위치. `player.png`에서 청록 에너지(#6ea8ff) 픽셀을 찾아 잰 값이고,
 * 스프라이트 크기 대비 비율이라 배율을 바꿔도 따라온다.
 *
 * **양손이 대칭이 아니다.** 한 손은 앞쪽 오른쪽, 다른 손은 뒤쪽 왼쪽 아래에 있다.
 * 좌우 대칭으로 놓으면 무기가 손이 아니라 몸 옆 허공에 뜬다.
 */
const WEAPON_HAND_OFFSET = {
  left: { x: 0.27, y: 0.05 },
  right: { x: -0.28, y: 0.27 },
} as const;

/**
 * 무기를 눕히는 각도(라디안). **조준 방향이 아니라 무기별 자세다.**
 *
 * 캐릭터는 회전하지 않고 좌우 반전만 한다. 무기만 조준 방향으로 돌리면 고정된 몸에서
 * 손에 든 것만 빙빙 돌아 붙어 있지 않게 보인다. 겨누는 방향은 조준선과 공격 이펙트가
 * 이미 알려주므로, 무기는 자기 자세를 지킨다.
 *
 * 값이 음수면 위쪽이다(화면 y축은 아래로 자란다). 무기마다 잡는 법이 다르므로
 * 손 기준이 아니라 무기 기준으로 잡는다. 팔과 일직선(0)으로 두면 팔이 자루처럼 보인다.
 */
const WEAPON_POSE_ANGLE: Record<WeaponId, number> = {
  /** 날을 위로 세운다. */
  sword: -0.7,
  /** 활대는 팔과 수직에 가깝고 화살이 앞을 본다. 원본 그림의 화살이 우상단을 향해 있어 그만큼 되돌린다. */
  bow: 0.72,
  /** 결정이 손 위에 떠 있는 정도. 거의 눕힌다. */
  arcane: -0.2,
  /**
   * 원판이 조준 방향 앞을 막게 한다.
   *
   * 다른 무기와 달리 손잡이가 그림 오른쪽 아래에 있어, 손에서 원판을 향하는 방향이
   * -142.4도다. 원판을 앞쪽(-25도)에 세우려면 그만큼 되돌려야 한다.
   * 손잡이 위치를 바꾸면 이 값도 같이 다시 계산해야 한다.
   */
  shield: 2.05,
};

const ENEMY_SPRITE: Record<EnemyKind, string> = {
  chaser: 'enemy-chaser',
  archer: 'enemy-archer',
  brute: 'enemy-brute',
  gatekeeper: 'enemy-boss',
  warden: 'enemy-boss-warden',
  glutton: 'enemy-boss-glutton',
  collapsedDoor: 'enemy-boss2',
};

interface EnemyEntity {
  state: Enemy;
  view: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Rectangle;
  statusDots: Phaser.GameObjects.Container[];
}

interface ProjectileEntity {
  state: Projectile;
  view: Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite;
  /** 이 투사체를 쏜 무기. 명중 시 콤보와 상태이상을 누구에게 귀속할지 결정한다. */
  weapon: Weapon;
  /** 기본 공격인지. 기본 공격만 콤보 게이지를 올린다. */
  basic: boolean;
  behaviors: readonly Behavior[];
}

interface PortalView {
  x: number;
  y: number;
  enabledAt: number;
  ring: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Arc;
  prompt: Phaser.GameObjects.Text;
}

interface TownPortalReturn {
  roomIndex: number;
  player: { x: number; y: number };
  enemies: Enemy[];
  exitOpen: boolean;
}

interface WeaponRuntime {
  weapon: Weapon;
  /** 어느 손인지. 콤보 조건의 `self`/`other`가 이 기준으로 갈린다. */
  hand: Hand;
  readyAt: number;
}

interface WheelSegment {
  hand: Hand;
  index: 0 | 1;
  weapon: WeaponId | null;
  /** 링을 열었을 때 이미 그 손에 들려 있던 후보인지. 포인터 강조와 별개로 계속 표시한다. */
  equipped: boolean;
  wedge: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Image | null;
  label: Phaser.GameObjects.Text;
  meta: Phaser.GameObjects.Text;
  activeMark: Phaser.GameObjects.Text;
}

interface WeaponWheelMenu {
  container: Phaser.GameObjects.Container;
  center: { x: number; y: number };
  readyAt: number;
  selected: { hand: Hand; index: 0 | 1 } | null;
  segments: WheelSegment[];
}

type OverlayKind = 'town-dialogue' | 'town-config' | 'pause' | 'map' | 'status-help' | 'result';

/**
 * 마을 패널에서 채우기를 기다리는 칸.
 *
 * 칸마다 넣을 수 있는 것이 다르다. R링 후보에는 무기가, 보조·연계 칸에는 그 무기에
 * 태그가 맞는 보조형스킬만 들어간다. 어떤 칸인지 알아야 인벤토리에서 무엇을
 * 점멸시킬지 정할 수 있다.
 */
type TownSlotTarget =
  | { kind: 'wheel'; hand: Hand; index: 0 | 1 }
  /** 첫 소켓. 끼우면 그 무기의 기본 공격이 이 스킬로 바뀐다. */
  | { kind: 'basic'; weapon: WeaponId }
  | { kind: 'support'; weapon: WeaponId; slot: 'primary' | 'synergy' };

type TownDragSource =
  | { kind: 'inventory'; index: number }
  | { kind: 'townSlot'; target: TownSlotTarget };

interface ComboBadge {
  back: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  condition: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
  effect: Phaser.GameObjects.Text;
  timer: Phaser.GameObjects.Rectangle;
  pips: Phaser.GameObjects.Rectangle[];
}

interface RewardDrop {
  reward: RoomReward;
  label: string;
  kind: 'weapon' | 'comboSkill' | 'support' | 'synergy' | 'key';
  color: number;
  iconKey?: string;
  x: number;
  y: number;
  pickupEnabledAt: number;
  collected: boolean;
  marker: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;
  glow: Phaser.GameObjects.Arc;
  prompt: Phaser.GameObjects.Text;
}

type WorldMapNode =
  | { kind: 'room'; roomIndex: number; x: number; y: number }
  | { kind: 'town'; x: number; y: number };

type TrialExitSide = 'top' | 'bottom' | 'right';
type StandardExitSide = 'right' | 'top' | 'bottom';

interface TrialExit {
  side: TrialExitSide;
  target: number;
  body: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
}

const TRIAL_ROOM_INDEX = 2;
const UPPER_BRANCH_ROOM_INDEX = 3;
const LOWER_BRANCH_ROOM_INDEX = 4;
const SEALED_ROOM_INDEX = 5;

/**
 * 전체 지도의 배치.
 *
 * **방의 실제 문 위치를 그대로 그린다.** 갈림길 허브는 위·아래·오른쪽 세 방향에 문이
 * 있으므로 지도에서도 위·아래는 허브와 **같은 x**에, 봉인된 문은 오른쪽에 둔다.
 * 보기 좋으라고 대각선으로 벌리면 지도와 실제 방이 어긋나 길을 잘못 찾게 된다.
 */
/**
 * HUD 물약 아이콘 규격.
 *
 * 몸통 비율은 `public/sprites/potion.png`를 실측해 얻었다(몸통이 세로 0.38~0.97,
 * 폭은 아이콘의 0.72). 아트를 다시 뽑으면 이 셋만 다시 재면 된다.
 */
const POTION_ICON_W = 16;
const POTION_ICON_H = 26;
const POTION_LIQUID_COLOR = 0xc92f46;
/** HUD 물약 아이콘의 중심. 만드는 곳과 갱신하는 곳이 같은 값을 봐야 액체가 병에 맞는다. */
/**
 * 왼쪽 위 상태 표시의 배치.
 *
 * 예전에는 430×126짜리 반투명 판을 깔고 그 안에 다섯 줄을 넣었다. 화면 왼쪽 위가
 * 통째로 덮여서 그쪽에서 다가오는 적이 판 뒤에 숨었다. **판은 정보가 아니라 배경이라
 * 가려도 되는 것이 아니었다.**
 *
 * 판을 없애고 글자마다 어두운 외곽선을 줬다. 가려지는 넓이가 판 넓이에서 글자 넓이로
 * 줄고, 밝은 바닥 위에서도 읽힌다. 오른쪽 위 조작 힌트가 이미 이 방식이라 표현도
 * 화면 안에서 일관된다. 가로도 430에서 200으로 줄여 한 칸에 세로로 쌓았다.
 */
const HUD_X = 24;
const HUD_BAR_W = 150;
/**
 * 막대 오른쪽 글자 기둥과 표시 전체의 오른쪽 끝.
 *
 * 숫자를 막대 **위에** 겹쳐 찍어 봤는데, 막대가 줄면 글자 밑이 초록에서 어두운 바탕으로
 * 바뀌어 어느 쪽에서도 읽히게 하려면 글자에 테두리를 둘러야 했다. 테두리가 보기 싫으면
 * 겹치기를 포기하는 게 맞다. 막대를 200에서 150으로 줄이고 남은 자리에 숫자를 뺐다.
 */
const HUD_LABEL_X = HUD_X + HUD_BAR_W + 10;
const HUD_W = 246;
/**
 * 줄의 세로 위치.
 *
 * **보호막 줄은 없을 때가 더 많다.** 방패를 들지 않으면 통째로 숨는데, 자리를 고정해
 * 두면 그 자리가 빈 구멍으로 남아 위아래가 따로 노는 것처럼 보인다. 숨을 때는
 * 아래 줄들이 `HUD_ROW_GAP`만큼 올라온다.
 */
const HUD_HP_Y = 28;
const HUD_SHIELD_Y = 48;
const HUD_POTION_Y = 70;
const HUD_ROOM_Y = 100;
const HUD_HANDS_Y = 118;
/**
 * 보호막 줄이 숨었을 때 아래가 올라오는 양.
 *
 * 두 줄의 간격(22)이 아니라 **보호막 막대가 차지하던 세로(10)와 그 아래 틈(4)**이다.
 * 위 틈(8)은 어차피 다음 줄에 필요하다. 22를 그대로 올리면 물약 아이콘이 다른 줄보다
 * 두 배 높아서(26) 체력 막대에 그대로 붙는다. 이 값이면 체력↔물약 간격이 보호막이
 * 있을 때의 체력↔보호막 간격과 같아진다.
 */
const HUD_ROW_GAP = 14;
/** 병 아이콘의 중심 x. 막대 왼쪽 끝과 병 왼쪽 끝이 맞아야 줄들이 한 기둥으로 선다. */
const POTION_ICON_X = HUD_X + POTION_ICON_W / 2;

const WORLD_MAP_NODES: readonly WorldMapNode[] = [
  { kind: 'room', roomIndex: 0, x: 185, y: 250 },
  { kind: 'room', roomIndex: 1, x: 315, y: 250 },
  { kind: 'town', x: 445, y: 250 },
  { kind: 'room', roomIndex: 2, x: 575, y: 250 },
  { kind: 'room', roomIndex: 3, x: 575, y: 130 },
  { kind: 'room', roomIndex: 4, x: 575, y: 370 },
  { kind: 'room', roomIndex: 5, x: 765, y: 250 },
  { kind: 'room', roomIndex: 6, x: 955, y: 250 },
] as const;

const WORLD_MAP_LINKS: readonly [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [3, 5],
  [3, 6],
  [6, 7],
] as const;

interface TownNpc {
  x: number;
  y: number;
  body: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;
  prompt: Phaser.GameObjects.Text;
}

/** 한 판의 전투 화면. 진행 규칙과 승패 판정은 game/run.ts가 갖는다. */
export class PlayScene extends Phaser.Scene {
  private run!: RunState;
  private left!: WeaponRuntime;
  private right: WeaponRuntime | null = null;

  private player!: Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite;
  private aimLine!: Phaser.GameObjects.Line;
  private enemies: EnemyEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  /** 지대는 어느 무기가 만들었는지 함께 들고 있는다. 지속피해로도 콤보가 유지되게 하기 위함이다. */
  private areas: { state: Area; view: Phaser.GameObjects.Arc; owner: WeaponRuntime | null; behaviors: readonly Behavior[] }[] = [];
  /** 적이 쏜 투사체. 플레이어 투사체와 충돌 대상이 반대라 따로 관리한다. */
  private enemyShots: { state: Projectile; view: Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite; damage: number }[] = [];

  /** 보호막 줄이 숨었을 때 아래 줄들이 올라오는 양. `refreshHud`가 정한다. */
  private hudRowShift = 0;
  private hpText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private roomText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private handsText!: Phaser.GameObjects.Text;
  private hudNotice!: Phaser.GameObjects.Text;
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private shieldBarBack!: Phaser.GameObjects.Rectangle;
  private shieldBarFill!: Phaser.GameObjects.Rectangle;
  private statusLegend!: Phaser.GameObjects.Container;
  private potionBottleFrame!: ShapeOrSprite;
  private potionLiquid!: Phaser.GameObjects.Graphics;
  /** 병 안쪽 폭을 스프라이트에서 한 번 재서 캐시한다. */
  private potionSpanCache: readonly { y: number; half: number }[] | null = null;
  private potionText!: Phaser.GameObjects.Text;
  private comboBadges!: { left: ComboBadge; right: ComboBadge };
  /** 콤보가 찼을 때 플레이어 주위에 도는 링. 손마다 하나씩. */
  /**
   * 판 전체에 하나뿐인 콤보. 예전에는 손마다 따로 쌓였는데, 그러면 양손을 번갈아
   * 쓸수록 게이지가 쪼개져 손해였다. 양손 조합이 이 게임의 핵심인데 기계가
   * 한 손 연타를 보상하고 있었다.
   */
  private combo: ComboState = createCombo();
  /** 콤보를 소모해 얻은 한시적 손 강화. 콤보와 수명이 달라 따로 둔다. */
  private empower: EmpowerByHand = {};
  private comboRings!: { left: ShapeOrSprite; right: ShapeOrSprite };
  /** 링의 기준 지름. 맥동은 이 값에 배율을 곱해 만든다. */
  private comboRingSize = { left: 0, right: 0 };
  /** 양손에 든 무기 그림. 스프라이트가 없으면 null이고 그때는 아무것도 그리지 않는다. */
  private weaponViews: { left: Phaser.GameObjects.Sprite | null; right: Phaser.GameObjects.Sprite | null } = {
    left: null,
    right: null,
  };
  /** 손의 실체화 빛. 무기 그림이 있을 때만 만든다. */
  private weaponCores: { left: Phaser.GameObjects.Arc | null; right: Phaser.GameObjects.Arc | null } = {
    left: null,
    right: null,
  };
  /** 직전에 그린 무기. 바뀐 순간에만 실체화 연출을 튼다. */
  private shownWeapon: { left: WeaponId | null; right: WeaponId | null } = { left: null, right: null };
  /** 비전 흐름이 걸린 동안 플레이어를 감싸는 오라. 버프가 살아 있다는 유일한 표시다. */
  private arcaneAura!: Phaser.GameObjects.Arc;
  private overlay: Phaser.GameObjects.Container | null = null;
  private overlayKind: OverlayKind | null = null;

  // ── 마을 설정 패널 상태 (기획서 `UI구성.pptx`)
  /** 좌측 세로 탭. 1 = 무기 설정, 2 = 기술 설정. */
  private townTab: 1 | 2 = 1;
  /** 인벤토리 필터 탭. 1 = 전체, 2 = 실체화 무기만, 3 = 보조형스킬만. */
  private townFilter: InventoryFilter = 'all';
  /**
   * 지금 채우기를 기다리는 칸.
   *
   * 칸을 클릭하면 여기에 담기고, 인벤토리에서 넣을 수 있는 것만 점멸한다.
   * 그중 하나를 클릭하면 장착되고 비워진다.
   */
  private townPendingSlot: TownSlotTarget | null = null;
  /**
   * 패널을 보기만 하는 중인가.
   *
   * 전투 지역에서 `I`로 연 인벤토리가 이 상태다. 열쇠를 몇 개 모았는지, 무엇을
   * 끼워 뒀는지 확인은 되지만 **바꾸지는 못한다.** 장비를 아무 데서나 갈아 끼우면
   * 마을에 들르는 이유가 없어지고, 보스 앞에서 세팅을 바꾸는 것이 정답이 된다.
   */
  private townReadOnly = false;
  /** 인벤토리 또는 장착 칸에서 드래그 중인 출발점. 드롭 지점에서 무엇을 옮길지 판단한다. */
  private townDragSource: TownDragSource | null = null;
  /** R링 후보 슬롯 드래그는 원본 칸을 움직이면 dropZone을 가리므로, 별도 고스트만 따라다닌다. */
  private townDragGhost: Phaser.GameObjects.Container | null = null;
  /** 화면 최하단 안내. 패널을 다시 그려도 살아남도록 오버레이 밖에 둔다. */
  private townToast: Phaser.GameObjects.Text | null = null;
  /** 인벤토리 항목에 마우스를 올렸을 때 뜨는 설명. */
  private townTip: Phaser.GameObjects.Container | null = null;
  private transientOverlays: Phaser.GameObjects.GameObject[] = [];
  private rewardDrops: RewardDrop[] = [];
  private townNpc: TownNpc | null = null;
  private combatPortal: PortalView | null = null;
  private townReturnPortal: PortalView | null = null;
  private townPortalReturn: TownPortalReturn | null = null;
  private weaponWheel: WeaponWheelMenu | null = null;
  /**
   * 일시정지 여부.
   *
   * 판 도중에 빠져나갈 길이 필요하다. 이게 없으면 기록을 지우려고
   * 일부러 죽거나 개발자 도구를 열어야 했다.
   */
  private paused = false;

  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'shift', Phaser.Input.Keyboard.Key>;
  private dashUntil = 0;
  private dashReadyAt = 0;
  private dashAngle = 0;
  private shieldGuardUntil = 0;
  private arcaneFlowUntil = 0;
  private nextHitSfxAt = 0;
  private supportFeedbackReadyAt: Record<string, number> = {};
  /** 규칙 발동 횟수. 개발 빌드 검증용이며 게임 로직에는 쓰이지 않는다. */
  private ruleEvents = { burst: 0, wallSlam: 0, brand: 0, woundConsume: 0, fracture: 0 };
  private weapons: { left: WeaponId; right: WeaponId | null } = { left: 'sword', right: null };
  /** 현재 방의 이동 가능 영역. 방마다 크기가 다르다. */
  private bounds = { minX: WALL, minY: WALL, maxX: GAME_WIDTH - WALL, maxY: GAME_HEIGHT - WALL };
  private exit!: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;
  private exitLabel!: Phaser.GameObjects.Text;
  private trialExits: TrialExit[] = [];
  private sealedDoorHintReadyAt = 0;
  private roomFloor: Phaser.GameObjects.GameObject[] = [];
  /** 방을 정리해 출구가 열렸는지. */
  private exitOpen = false;
  private resultScheduled = false;
  /** 화면 밖 대상을 가리키는 화살표. 적용 하나, 출구용 하나. */
  private offscreenMarks: Phaser.GameObjects.Triangle[] = [];
  private minimap!: {
    frame: Phaser.GameObjects.Rectangle;
    player: Phaser.GameObjects.Arc;
    exit: Phaser.GameObjects.Rectangle;
    enemies: Phaser.GameObjects.Arc[];
  };
  /** 현재 방을 미니맵 크기에 맞추는 배율. 방마다 다시 계산한다. */
  private minimapRoom = { width: GAME_WIDTH, height: GAME_HEIGHT, scale: 1 };
  /** 이 방의 배경 서술 오브젝트. 다가가면 글이 뜬다. */
  private loreNotes: {
    x: number;
    y: number;
    mark: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;
    plate: Phaser.GameObjects.Rectangle;
    text: Phaser.GameObjects.Text;
  }[] = [];
  private startRoomIndex = 0;
  /** 개발용 `?town=1`. 마을 도착 상태로 시작한다. */
  private startInTown = false;
  /**
   * 진행을 localStorage에 저장할지.
   *
   * 개발 파라미터(`?town`, `?wave`, `?left`, `?right`)는 저장된 진행을 **읽지 않고**
   * 임시 상태를 만든다. 그런데 저장은 그대로 일어나서, 개발용으로 한 번 열면
   * 플레이어가 쌓아온 진행이 임시 상태로 덮어써졌다. 읽지 않았으면 쓰지도 않는다.
   */
  private persistProgress = true;
  private initialProgress: PlayerProgress | null = null;
  private initialCheckpoint: RunCheckpoint | null = null;

  constructor() {
    super('Play');
  }

  init(data: { left?: WeaponId; right?: WeaponId | null; progress?: PlayerProgress }): void {
    // 씬 인스턴스는 재시작해도 그대로 재사용된다. 필드 초기화식은 다시 돌지 않으므로
    // 일시정지 중에 R로 재시작하면 새 판이 멈춘 채로 시작한다.
    this.paused = false;
    this.overlay = null;
    this.overlayKind = null;
    this.weaponWheel = null;

    // 새 기획의 기본값: 검 1종으로 시작하고 오른손은 비어 있다.
    const debugStart = parseDebugStartWithMode(location.search, TOTAL_ROOMS, import.meta.env.DEV);
    const hasDebugWeapons = debugStart.left !== undefined || debugStart.right !== undefined;
    const ignoresSavedProgress =
      hasDebugWeapons ||
      debugStart.roomIndex !== undefined ||
      debugStart.town === true ||
      debugStart.combo !== null ||
      debugStart.supports !== undefined;
    // 저장을 안 읽는 개발 진입은 저장도 하지 않는다. 안 그러면 실제 진행을 덮어쓴다.
    this.persistProgress = !ignoresSavedProgress;
    this.initialCheckpoint = ignoresSavedProgress ? null : loadRunCheckpoint();
    let progress = data?.progress ?? this.initialCheckpoint?.progress ?? createInitialProgress();
    // 개발용: `?combo=`면 콤보 계열 연계를 미리 물려 콤보 빌드로 시작한다.
    // `?left=`/`?right=`로 지정한 무기까지 해금해야 그 무기에도 보조가 붙는다.
    // 콤보는 양손을 오가며 성립하므로, 두 파라미터를 같이 쓰는 것이 기본 사용법이다.
    if (debugStart.combo) {
      const forced = [debugStart.left, debugStart.right].filter((id): id is WeaponId => !!id);
      progress = grantComboSupport(unlockWeapons(progress, forced), debugStart.combo);
    }
    // 개발용: `?supports=`로 보조형스킬을 미리 보유시킨다. 장착은 하지 않는다 —
    // 마을에서 직접 붙여 보는 것이 이 파라미터를 쓰는 이유이기 때문이다.
    if (debugStart.supports) progress = unlockSupports(progress, debugStart.supports);
    // 콤보 보조를 물렸으면 그 진행을 살려야 한다. 무기만 지정한 경우에는 예전대로 버린다.
    this.initialProgress = this.initialCheckpoint ? null : hasDebugWeapons && !debugStart.combo ? null : progress;
    // 저장된 진행이 있어도 손에 든 무기는 이어받지 않는다. 항상 초기값으로 시작한다.
    // 자세한 이유는 createRun 참고.
    const fresh = createInitialProgress();
    this.weapons = {
      left: debugStart.left ?? data?.left ?? fresh.active.left,
      right: debugStart.right ?? data?.right ?? fresh.active.right,
    };

    // 개발용: ?left=bow&right=arcane&wave=4 로 특정 무기/방에서 시작한다.
    this.startInTown = debugStart.town === true;
    // `?town=1`은 0번 방부터 실제 클리어 전이를 태워 마을에 도달한다. 마을은 1번 방을
    // 클리어할 때만 열리므로, 시작 방이 그 뒤면 마을 전이를 만나지 못하고 마지막 방까지
    // 밀려 `won` 상태로 시작한다. 그래서 둘이 겹칠 때는 방 지정을 버린다.
    this.startRoomIndex = this.startInTown ? 0 : debugStart.roomIndex ?? 0;
  }

  create(): void {
    applyRenderScale(this);
    resetProjectileIds();
    resetAreaIds();
    resetEnemyIds();
    this.enemies = [];
    this.projectiles = [];
    this.enemyShots = [];
    this.areas = [];
    this.overlay = null;
    this.overlayKind = null;
    this.transientOverlays = [];
    this.rewardDrops = [];
    this.resultScheduled = false;
    this.arcaneFlowUntil = 0;
    this.shieldGuardUntil = 0;
    this.supportFeedbackReadyAt = {};

    this.run = this.initialCheckpoint
      ? this.restoreCheckpoint(this.initialCheckpoint)
      : { ...createRun(this.weapons.left, this.weapons.right, this.initialProgress ?? undefined), roomIndex: this.startRoomIndex };
    if (this.startInTown) this.run = this.fastForwardToTown(this.run);
    this.left = { weapon: leftWeapon(this.run.loadout), hand: 'left', readyAt: 0 };
    const right = rightWeapon(this.run.loadout);
    this.right = right ? { weapon: right, hand: 'right', readyAt: 0 } : null;


    this.player = this.textures.exists('player')
      ? (() => {
          const sprite = this.add.sprite(0, 0, 'player').setDepth(10);
          sprite.setScale((PLAYER_RADIUS * 2 * PLAYER_SPRITE_SCALE) / Math.max(sprite.width, sprite.height));
          return sprite;
        })()
      : this.add.circle(0, 0, PLAYER_RADIUS, COLORS.player).setDepth(10);
    this.aimLine = this.add.line(0, 0, 0, 0, 0, 0, COLORS.accent).setOrigin(0, 0).setLineWidth(2).setDepth(9);

    // 링과 오라는 **판정 반지름이 아니라 실제로 그려진 크기**를 따라가야 한다.
    // 32/40 같은 고정값은 반지름 20짜리 원 시절의 값이라, 스프라이트로 바꾸자마자
    // 링이 주인공 안쪽에 묻혔다. 도형으로 되돌아가도 같은 식으로 계산된다.
    const playerViewRadius = this.player instanceof Phaser.GameObjects.Sprite
      ? Math.max(this.player.displayWidth, this.player.displayHeight) / 2
      : PLAYER_RADIUS;

    // 콤보가 차면 숫자를 읽지 않아도 알 수 있게 플레이어에 링을 띄운다.
    // 손마다 반지름을 달리해 어느 쪽이 찼는지 구분한다.
    // 두 링은 같은 중심에 반지름만 다르다. 위치가 아니라 크기로 손을 구분한다.
    // 그림 링은 띠가 8~9px이라 예전 3px 선보다 두껍다. 간격을 그대로 두면 둘이 붙어
    // 한 덩어리로 보이므로, 안팎 여유를 넓혔다.
    this.comboRingSize = { left: (playerViewRadius + 10) * 2, right: (playerViewRadius + 26) * 2 };
    this.comboRings = {
      left: this.createComboRing(this.comboRingSize.left, this.left.weapon.color),
      right: this.createComboRing(this.comboRingSize.right, right?.color ?? 0x2a2f42),
    };

    this.arcaneAura = this.add
      .circle(0, 0, playerViewRadius + 9, BRAND_COLOR, 0.22)
      .setDepth(9)
      .setVisible(false);

    // 손에 든 무기를 캐릭터 옆에 그린다. 무기 이미지가 없으면 만들지 않고,
    // 그때는 예전처럼 HUD 글자와 공격 이펙트 색으로만 구분된다.
    this.weaponViews = { left: this.createWeaponView(), right: this.createWeaponView() };
    this.weaponCores = { left: this.createWeaponCore(), right: this.createWeaponCore() };
    this.refreshWeaponViews();

    this.buildHud();
    this.bindInput();
    // `?town=1`로 시작하면 첫 진입부터 마을이다. 무조건 enterRoom을 부르면
    // 상태는 마을인데 화면은 전투 방이 되어, 적이 스폰되고 NPC는 없는 잡탕이 된다.
    if (this.run.phase === 'won') this.showResult(true);
    else if (this.run.phase === 'town') this.enterTownRoom();
    else this.enterRoom();
  }

  // ───────────────────────── 입력

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('키보드 입력을 사용할 수 없습니다.');

    const { KeyCodes } = Phaser.Input.Keyboard;
    this.keys = {
      up: keyboard.addKey(KeyCodes.W),
      down: keyboard.addKey(KeyCodes.S),
      left: keyboard.addKey(KeyCodes.A),
      right: keyboard.addKey(KeyCodes.D),
      shift: keyboard.addKey(KeyCodes.SHIFT),
    };

    keyboard.on('keydown-SPACE', () => this.tryDash());
    keyboard.on('keydown-R', () => {
      if (this.overlayKind === 'map') return;
      // 판이 끝났으면 다시 시작. 이 분기가 없으면 죽은 뒤 새로고침 말고는
      // 빠져나갈 방법이 없다. 결과 화면이 R을 안내하는데 아무 반응이 없었다.
      // 일시정지 중에도 같은 길을 연다.
      if (isOver(this.run) || this.paused) {
        if (this.keys.shift.isDown || isOver(this.run)) clearSavedProgress();
        this.scene.start('Play');
        return;
      }
      if (this.run.phase === 'town') {
        if (this.overlay) this.closeOverlay();
        else if (this.run.progress.weaponSwitchUnlocked) this.openWeaponWheel();
        return;
      }
      if (this.run.phase !== 'combat') return;
      if (!this.run.progress.weaponSwitchUnlocked || this.run.roomIndex === 0) {
        floatingText(this, this.player.x, this.player.y - 28, '아직 잠겨 있다', COLORS.textDim);
        return;
      }
      this.openWeaponWheel();
    });
    keyboard.on('keydown-I', () => {
      if (isOver(this.run) || this.paused || this.weaponWheel) return;
      if (this.overlay) {
        this.closeOverlay();
        return;
      }
      // 마을에서는 관리인 패널과 같다. 전투 지역에서는 보기 전용으로 연다.
      this.showTown(this.run.phase !== 'town');
    });
    keyboard.on('keydown-M', () => {
      if (isOver(this.run) || this.weaponWheel) return;
      if (this.overlayKind === 'map') {
        this.closeMap();
        return;
      }
      if (this.paused || this.overlay) return;
      if (this.run.phase !== 'combat' && this.run.phase !== 'town') return;
      this.showWorldMap();
    });
    keyboard.on('keydown-H', () => {
      if (isOver(this.run) || this.weaponWheel) return;
      if (this.overlayKind === 'status-help') {
        this.closeStatusHelp();
        return;
      }
      if (this.paused || this.overlay) return;
      if (this.run.phase !== 'combat' && this.run.phase !== 'town') return;
      this.showStatusHelp();
    });
    keyboard.on('keydown-B', () => {
      if (isOver(this.run) || this.weaponWheel || this.paused || this.overlay) return;
      if (this.run.phase !== 'combat') {
        floatingText(this, this.player.x, this.player.y - PLAYER_RADIUS - 28, '전투 구역에서만 열린다', COLORS.textDim);
        return;
      }
      this.openTownPortal();
    });
    keyboard.on('keydown-Q', () => {
      if (isOver(this.run) || this.weaponWheel || this.paused || this.overlay) return;
      this.tryUsePotion();
    });
    keyboard.on('keydown-F', () => {
      if (this.overlayKind === 'town-dialogue') {
        this.showTown();
        return;
      }
      this.tryTalkTownNpc();
    });
    keyboard.on('keyup-R', () => {
      if (this.weaponWheel) this.closeWeaponWheel(true);
    });

    // 일시정지는 P가 주 키다.
    // Esc는 전체화면을 빠져나가는 브라우저 기본 동작과 겹치고, 헤드리스 검증에서도
    // 같은 입력이 어떤 판에서는 먹고 어떤 판에서는 안 먹었다. 보조로만 붙여 둔다.
    const togglePause = () => {
      if (this.weaponWheel) return;
      // 마을에서도 열려야 한다. 이 메뉴에 `Shift+R 기록 지우기`가 들어 있는데
      // 전투 중에만 열리면 마을에 있는 동안에는 기록을 지울 방법이 없다.
      // 승리·패배 화면에는 자체 안내가 있으므로 그때는 열지 않는다.
      if (this.run.phase !== 'combat' && this.run.phase !== 'town') return;
      if (this.paused) {
        this.closePause();
        return;
      }
      // 보스 드랍 패널처럼 이미 뭔가 떠 있으면 그걸 덮지 않는다.
      if (this.overlay) return;
      this.showPause();
    };
    keyboard.on('keydown-P', togglePause);
    keyboard.on('keydown-ESC', () => {
      if (this.closeTopOverlayByEscape()) return;
      togglePause();
    });

    this.input.mouse?.disableContextMenu();
    this.setupTownDragAndDrop();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.weaponWheel) return;
      if (this.paused) return;
      if (this.overlay) return;
      if (this.run.phase !== 'combat' && this.run.phase !== 'town') return;
      // 트랙패드에서는 두 손가락 탭이 꺼져 있거나 브라우저가 다르게 넘겨줄 수 있어
      // 눌린 버튼 상태와 이벤트의 버튼 번호를 모두 본다.
      const isRight = pointer.rightButtonDown() || pointer.button === 2;
      const runtime = isRight ? this.right : this.left;
      if (runtime) this.useWeapon(runtime, this.pointerAimAngle(pointer));
    });

    // 오른손 무기를 키로도 쓸 수 있게 한다.
    // 트랙패드에서 우클릭을 반복하는 것은 사실상 불가능하고,
    // 왼손이 WASD에 있으므로 새끼손가락으로 닿는 Shift가 가장 편하다.
    keyboard.on('keydown-SHIFT', () => {
      if (this.weaponWheel || this.paused) return;
      if (this.overlay) return;
      if (this.run.phase !== 'combat' && this.run.phase !== 'town') return;
      if (this.right) this.useWeapon(this.right);
    });
  }

  private tryDash(): void {
    if (this.weaponWheel || this.paused) return;
    if (this.overlay) return;
    if (this.run.phase !== 'combat' || this.time.now < this.dashReadyAt) return;

    const direction = this.moveDirection();
    this.dashAngle = direction ? Math.atan2(direction.y, direction.x) : this.aimAngle();
    this.dashUntil = this.time.now + DASH_DURATION_MS;
    this.dashReadyAt = this.time.now + DASH_COOLDOWN_MS;
  }

  private aimAngle(): number {
    const pointer = this.input.activePointer;
    return this.pointerAimAngle(pointer);
  }

  private pointerAimAngle(pointer: Phaser.Input.Pointer): number {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return Phaser.Math.Angle.Between(this.player.x, this.player.y, world.x, world.y);
  }

  private moveDirection(): { x: number; y: number } | null {
    let x = 0;
    let y = 0;
    if (this.keys.left.isDown) x -= 1;
    if (this.keys.right.isDown) x += 1;
    if (this.keys.up.isDown) y -= 1;
    if (this.keys.down.isDown) y += 1;
    if (x === 0 && y === 0) return null;

    const length = Math.hypot(x, y);
    return { x: x / length, y: y / length };
  }

  // ───────────────────────── 무기 사용

  private useWeapon(runtime: WeaponRuntime, angle = this.aimAngle()): void {
    if (this.time.now < runtime.readyAt) return;

    this.openShieldProtection(runtime);
    // **첫 소켓에 끼운 기본스킬이 곧 기본 공격이다.** 조건도 전환도 없다.
    // 끼웠으면 계속 그것이 나가고, 비웠으면 무기 본래의 공격이 나간다.
    const skill = equippedBasicSkill(this.run.progress, runtime.weapon.id);
    // 형태가 바뀌면 간격도 그 스킬의 것을 쓴다. 지대형은 겹치면 피해가 곱으로
    // 불어나므로 기본스킬 후보용 별도 간격으로 늦춘다. 그 이유는 `attackIntervalFor` 참고.
    runtime.readyAt = this.time.now + attackIntervalFor(runtime.weapon, skill);
    // 첫 소켓에 끼운 기본스킬도 이제는 "기본 공격"이다. 옛 콤보 전환 시절처럼
    // `basic: false`로 넘기면 콤보형 연계를 붙여도 콤보가 오르지 않는다.
    this.useSkill(runtime, skill, angle);
    this.refreshHud();
  }

  private openShieldProtection(runtime: WeaponRuntime): void {
    if (runtime.weapon.id !== 'shield') return;
    this.shieldGuardUntil = Math.max(this.shieldGuardUntil, this.time.now + (runtime.weapon.swingDuration || 140));
  }

  /**
   * 이 무기에 붙은 콤보 규칙.
   *
   * **지금 실제로 나가는 공격**을 기준으로 읽는다. 첫 소켓에 기본스킬을 끼웠으면
   * 보조와 연계도 그 스킬에 붙기 때문이다.
   */
  private comboRulesFor(runtime: WeaponRuntime) {
    const skill = equippedBasicSkill(this.run.progress, runtime.weapon.id);
    return supportsFor(this.run.loadout, skill.id).flatMap((support) =>
      comboRulesOf(support.behaviors).map((rule) => ({ ...rule, support })),
    );
  }

  /** 이 무기의 기본 공격이 기본스킬로 바뀌어 있는가. 첫 소켓이 채워졌다는 뜻이다. */
  private isTransformed(runtime: WeaponRuntime): boolean {
    return equippedBasicSkill(this.run.progress, runtime.weapon.id).id !== runtime.weapon.basic.id;
  }

  /** 이 무기가 콤보를 쓰는가. 콤보를 읽는 연계가 하나라도 붙어 있으면 그렇다. */
  private usesCombo(runtime: WeaponRuntime): boolean {
    return this.comboRulesFor(runtime).length > 0;
  }

  /**
   * 강화 효과를 가진 콤보 규칙을 평가한다.
   *
   * 조건이 성립하면 지정한 손을 강화하고, 소모를 선언한 규칙은 콤보를 털어낸다.
   * **소모하는 규칙은 조건이 성립한 그 순간 한 번만 발동**해야 하므로 명중 시점에
   * 부른다. 소모하지 않는 규칙은 조건이 유지되는 동안 계속 켜져 있어야 해서
   * 매 프레임 다시 본다(`refreshSustainedEmpower`).
   */
  private applyComboEffects(runtime: WeaponRuntime): void {
    for (const { trigger, effect, support } of this.comboRulesFor(runtime)) {
      if (effect.kind !== 'empower' || !effect.consumes) continue;
      if (!comboTriggerMet(this.combo, runtime.hand, trigger)) continue;

      const target = effect.hand === 'self' ? runtime.hand : otherHand(runtime.hand);
      this.empower = grantEmpower(this.empower, target, {
        more: effect.more,
        hits: effect.hits,
        seconds: effect.seconds,
      });
      const scope =
        effect.consumes === 'self'
          ? runtime.hand
          : effect.consumes === 'other'
            ? otherHand(runtime.hand)
            : 'total';
      this.combo = consumeCombo(this.combo, scope);
      floatingText(this, this.player.x, this.player.y - PLAYER_RADIUS - 34, support.name, COLORS.accentText);
    }
  }

  /**
   * 소모하지 않는 강화를 조건에 맞춰 켜고 끈다.
   *
   * `양손 합계 6 이상인 동안` 같은 규칙은 상태가 아니라 조건이므로, 콤보가 줄거나
   * 풀리면 같이 꺼져야 한다. 한 번 켜고 두면 조건이 깨져도 계속 남는다.
   */
  private refreshSustainedEmpower(): void {
    for (const runtime of [this.left, this.right]) {
      if (!runtime) continue;
      for (const { trigger, effect, support } of this.comboRulesFor(runtime)) {
        if (effect.kind !== 'empower' || effect.consumes) continue;

        const target = effect.hand === 'self' ? runtime.hand : otherHand(runtime.hand);
        const met = comboTriggerMet(this.combo, runtime.hand, trigger);
        const on = empowerMore(this.empower, target) > 0;
        if (met && !on) {
          this.empower = grantEmpower(this.empower, target, { more: effect.more });
          floatingText(this, this.player.x, this.player.y - PLAYER_RADIUS - 34, support.name, COLORS.accentText);
        } else if (!met && on && this.empower[target]?.hitsLeft === undefined && this.empower[target]?.secondsLeft === undefined) {
          // 횟수·시간 제한이 없는 것만 끈다. 소모형으로 받은 강화는 조건과 무관하게 남는다.
          const next = { ...this.empower };
          delete next[target];
          this.empower = next;
        }
      }
    }
  }

  /** 스킬 하나를 전달 방식에 맞게 내보낸다. */
  /**
   * 무기를 한 번 쓴다.
   *
   * **`basic` 구분은 없어졌다.** 첫 소켓에 무엇을 끼웠든 그것이 그 무기의 기본 공격이다.
   * 옛 콤보 전환 시절에는 강화기술을 `basic: false`로 넘겨 콤보를 올리지 않았는데,
   * 그 값이 남아 있어 기본스킬을 끼우면 콤보형 연계가 먹통이 됐다.
   *
   * **지대에는 `owner`를 반드시 넘긴다.** 지대는 직접 명중이 없어서, owner가 없으면
   * 상태이상도 안 걸리고 콤보 지속시간도 안 늘어난다. 비전 개화(지대형 기본스킬)를
   * 끼우면 콤보가 아예 안 오르던 것이 이 때문이다.
   */
  private useSkill(runtime: WeaponRuntime, skill: Skill, angle: number): void {
    const resolved = resolveFor(this.run.loadout, skill);
    this.showPrimarySupportFeedback(runtime, skill);
    playSfx('attack');

    switch (deliveryOf(skill)) {
      case 'projectile':
        this.fireProjectiles(runtime.weapon, skill, resolved.stats, resolved.behaviors, angle, true);
        break;
      case 'melee':
        this.swingMelee(runtime, skill, resolved.stats, resolved.behaviors, angle, true);
        break;
      case 'area':
        this.dropArea(resolved.stats, resolved.behaviors, angle, runtime);
        break;
    }
  }

  private showPrimarySupportFeedback(runtime: WeaponRuntime, skill: Skill): void {
    const support = supportsFor(this.run.loadout, skill.id).find((candidate) => supportSlotType(candidate) === 'primary');
    if (!support) return;

    const key = `${runtime.hand}:${skill.id}:${support.id}`;
    if (this.time.now < (this.supportFeedbackReadyAt[key] ?? 0)) return;
    this.supportFeedbackReadyAt[key] = this.time.now + 3200;

    ring(this, this.player.x, this.player.y, runtime.weapon.color, { from: PLAYER_RADIUS + 6, to: PLAYER_RADIUS + 38, duration: 320, width: 2 });
    floatingText(
      this,
      this.player.x,
      this.player.y - PLAYER_RADIUS - 34,
      `${support.name} 적용`,
      COLORS.accentText,
      { duration: 1300 },
    );
  }

  private fireProjectiles(
    weapon: Weapon,
    _skill: Skill,
    stats: ReturnType<typeof resolveFor>['stats'],
    behaviors: ReturnType<typeof resolveFor>['behaviors'],
    angle: number,
    basic: boolean,
  ): void {
    const size = 22;
    for (const state of spawnProjectiles(stats, behaviors, { x: this.player.x, y: this.player.y }, angle)) {
      this.projectiles.push({
        state,
        view: this.createBoltView(BOLT_SPRITE[weapon.id], state.x, state.y, size, state.angle, weapon.color),
        weapon,
        basic,
        behaviors,
      });
    }
  }

  private swingMelee(
    runtime: WeaponRuntime,
    _skill: Skill,
    stats: ReturnType<typeof resolveFor>['stats'],
    behaviors: ReturnType<typeof resolveFor>['behaviors'],
    angle: number,
    basic: boolean,
  ): void {
    const range = stats.meleeRange ?? 90;
    const arc = stats.meleeArc ?? 1.7;
    const duration = runtime.weapon.swingDuration || 140;
    // 무기 성격을 연출로 드러낸다.
    // 검은 짧고 빠르게 스쳐 지나가고, 방패는 느리게 밀고 나간다.
    const wedge = this.add
      .arc(
        this.player.x,
        this.player.y,
        range,
        Phaser.Math.RadToDeg(angle - arc / 2),
        Phaser.Math.RadToDeg(angle + arc / 2),
        false,
        runtime.weapon.color,
        0.32,
      )
      .setDepth(7);

    const heavy = (stats.knockback ?? 0) > 60;
    wedge.setScale(heavy ? 0.55 : 1);
    this.tweens.add({
      targets: wedge,
      // 무거운 무기는 범위가 밀고 나가듯 커지고, 가벼운 무기는 그대로 스러진다.
      scale: heavy ? 1 : 1.08,
      alpha: 0,
      duration,
      ease: heavy ? 'Quad.easeOut' : 'Cubic.easeIn',
      onComplete: () => wedge.destroy(),
    });

    const targets = targetsInArc(
      { origin: { x: this.player.x, y: this.player.y }, angle, range, arc },
      this.enemies
        .filter((e) => isAlive(e.state))
        .map((e) => ({ ...e.state, radius: ENEMY_STATS[e.state.kind].radius })),
    );

    for (const target of targets) {
      const entity = this.enemies.find((e) => e.state.id === target.id);
      if (!entity) continue;

      this.resolveHit(entity, stats.damage ?? 0, runtime.weapon, basic, runtime, behaviors);
      this.pushEnemy(entity, stats.knockback ?? 0, undefined, behaviors);
    }
  }

  /**
   * 적을 밀어낸다.
   *
   * 기준점을 받는 이유: 근접 공격은 플레이어에서 밀어내지만, 지대는 조준 방향
   * 앞쪽에 깔리므로 지대 중심에서 밀어내야 방향이 자연스럽다.
   * 벽까지 밀리면 추가 피해와 확정 기절을 준다.
   */
  private pushEnemy(
    entity: EnemyEntity,
    distance: number,
    origin?: { x: number; y: number },
    behaviors: readonly Behavior[] = [],
  ): void {
    if (distance <= 0 || !isAlive(entity.state)) return;
    if (!canApplyCrowdControl(entity.state, behaviors)) return;

    const radius = ENEMY_STATS[entity.state.kind].radius;
    const result = applyKnockback(
      origin ?? { x: this.player.x, y: this.player.y },
      entity.state,
      distance,
      {
        minX: this.bounds.minX + radius,
        minY: this.bounds.minY + radius,
        maxX: this.bounds.maxX - radius,
        maxY: this.bounds.maxY - radius,
      },
    );

    entity.state.x = result.x;
    entity.state.y = result.y;

    if (result.hitWall) {
      // 벽꿍. 확률 판정을 건너뛰고 확정으로 건다.
      const status = applyStatus(entity.state, 'fracture', Math.random, true);
      if (status.applied) this.showStunFeedback(entity);
      this.ruleEvents.wallSlam++;
      impact(this, entity.state.x, entity.state.y);
      const slamRadius = ENEMY_STATS[entity.state.kind].radius;
      floatingText(this, entity.state.x, entity.state.y - slamRadius - 12, `벽 충돌 ${WALL_SLAM_DAMAGE}`, '#ffe08a');
      this.damageEnemy(entity, WALL_SLAM_DAMAGE);
    }
    this.syncEnemyView(entity);
  }

  private dropArea(
    stats: ReturnType<typeof resolveFor>['stats'],
    behaviors: ReturnType<typeof resolveFor>['behaviors'],
    angle: number,
    owner: WeaponRuntime | null,
  ): void {
    // 지대는 조준 방향 앞쪽에 깔린다.
    const distance = 90;
    const at = { x: this.player.x + Math.cos(angle) * distance, y: this.player.y + Math.sin(angle) * distance };
    const area = createArea(stats, behaviors, at);

    this.areas.push({
      state: area,
      view: this.add.circle(area.x, area.y, area.radius, AREA_COLORS[area.kind], 0.3).setDepth(1),
      owner,
      behaviors,
    });

    if (owner) {
      for (const entity of this.enemies) {
        if (!isAlive(entity.state) || !containsPoint(area, entity.state)) continue;
        // 상태이상을 먼저 굴린다. 밀어내다 벽에 닿으면 그때 확정 기절이 덮어쓴다.
        this.resolveHit(entity, 0, owner.weapon, false, owner, behaviors);
        // 지대 중심에서 밀어낸다. 넉백이 있는 지대만 해당된다(균열 파동).
        this.pushEnemy(entity, stats.knockback ?? 0, at, behaviors);
      }
    }
  }

  /** 명중 처리. 상태이상 부여, 약점 노출 증폭, 낙인 소비를 모두 여기서 한다. */
  private resolveHit(
    entity: EnemyEntity,
    rawDamage: number,
    weapon: Weapon,
    basic: boolean,
    runtime?: WeaponRuntime,
    behaviors: readonly Behavior[] = [],
  ): void {
    const enemy = entity.state;
    // 콤보로 얻은 손 강화를 여기서 곱한다. 스킬 수치가 아니라 손에 걸린 상태라
    // 수정자 파이프라인이 아니라 명중 시점에 적용한다.
    const empowered = runtime ? 1 + empowerMore(this.empower, runtime.hand) : 1;
    let damage =
      this.applyStatusDamageBonus(rawDamage, enemy, behaviors) * incomingDamageMultiplier(enemy) * empowered;

    // 평범한 명중에도 반응이 있어야 한다. 지금까지는 체력바만 줄었다.
    hitSpark(this, enemy.x, enemy.y, weapon.color);
    if (this.time.now >= this.nextHitSfxAt) {
      playSfx('hit');
      this.nextHitSfxAt = this.time.now + 55;
    }

    // 비전 흐름: 낙인을 소비해 얻은 증폭
    if (weapon.id === 'arcane' && this.time.now < this.arcaneFlowUntil) {
      damage *= 1 + ARCANE_FLOW_MORE;
    }

    // 교차 반응: 상처를 남긴 무기가 아닌 다른 무기로 때리면 쌓인 만큼 소모한다.
    // 상처 폭발은 5스택이 필요한데 사냥개(2타)와 몰이꾼(2타)은 그 전에 죽어
    // 규칙이 구조적으로 발동하지 않았다. 이 반응이 그 구멍을 메우고,
    // 동시에 무기를 두 개 고르는 선택에 의미를 만든다.
    if (weapon.status !== 'wound') {
      const stacks = consumeWound(enemy);
      if (stacks > 0) {
        const bonus = stacks * WOUND_CONSUME_PER_STACK;
        damage += bonus;
        this.ruleEvents.woundConsume++;
        playSfx('statusBurst');

        const radius = ENEMY_STATS[enemy.kind].radius;
        ring(this, enemy.x, enemy.y, BURST_COLOR, { to: radius * 2.4, duration: 280 });
        floatingText(this, enemy.x, enemy.y - radius - 12, `상처 소모 ${bonus}`, '#ffb4a2');
      }
    }

    // 각성 중에도 무기의 상태 정체성은 유지한다.
    // 기본 공격만 콤보 게이지를 올리고, 강화기술 명중은 지속시간만 갱신한다.
    if (weapon.id === 'arcane' && consumeBrand(enemy)) {
      this.arcaneFlowUntil = this.time.now + ARCANE_FLOW_DURATION * 1000;
      this.ruleEvents.brand++;
      ring(this, enemy.x, enemy.y, BRAND_COLOR, { to: 110, duration: 420 });
      floatingText(this, this.player.x, this.player.y - 24, '비전 흐름', '#c9a8ff');
    }

    const canApplyStatus = weapon.status !== 'fracture' || canApplyCrowdControl(enemy, behaviors);
    const additionalStacks = findBehavior(behaviors, 'additionalStatusStacks');
    const stackCount = additionalStacks?.status === weapon.status ? 1 + additionalStacks.count : 1;
    const result = canApplyStatus
      ? applyStatus(enemy, weapon.status, Math.random, false, stackCount)
      : { applied: false, burst: false };
    if (weapon.status === 'fracture' && result.applied) {
      this.showStunFeedback(entity);
    }
    if (result.burst) {
      damage += WOUND_BURST_DAMAGE;
      this.ruleEvents.burst++;
      playSfx('statusBurst');
      // 규칙상으로만 터지고 화면에는 아무것도 안 나오던 지점.
      const radius = ENEMY_STATS[enemy.kind].radius;
      ring(this, enemy.x, enemy.y, BURST_COLOR, { to: radius * 3.2 });
      flash(this, enemy.x, enemy.y, radius * 2.2, BURST_COLOR);
      // 플래시와 겹치지 않도록 적 위쪽에서 띄운다. 가장 읽혀야 할 순간이다.
      floatingText(this, enemy.x, enemy.y - radius - 12, `상처 폭발 ${WOUND_BURST_DAMAGE}`, '#ff9b9b');
    }

    if (runtime) {
      // 콤보를 읽는 연계를 붙인 무기만 콤보를 쌓는다. 안 붙였으면 아무 일도 없다.
      // 콤보는 판 전체에 하나뿐이라, 어느 손으로 쌓았는지를 따로 들고 있는다.
      if (this.usesCombo(runtime)) {
        const stats = resolveFor(this.run.loadout, weapon.basic).stats;
        this.combo = basic
          ? gainCombo(this.combo, runtime.hand, stats)
          : // 강화기술 명중은 수치를 올리지 않고 지속시간과 직전 손만 갱신한다.
            // 직전 손을 갱신해야 강화기술이 나가는 동안에도 교차 판정이 이어진다.
            // 다만 쌓아 둔 교차 연속은 여기서 턴다. 쓰면 없어져야 쌓는 의미가 생긴다.
            sustainCombo(this.combo, runtime.hand, stats);
        this.applyComboEffects(runtime);
      }
      // 강화된 손으로 때렸으면 횟수를 하나 쓴다.
      if (empowerMore(this.empower, runtime.hand) > 0) {
        this.empower = spendEmpower(this.empower, runtime.hand);
      }
    }

    this.damageEnemy(entity, damage);
  }

  private applyStatusDamageBonus(damage: number, enemy: Enemy, behaviors: readonly Behavior[]): number {
    const bonus = findBehavior(behaviors, 'statusDamage');
    if (!bonus || !hasStatus(enemy, bonus.status)) return damage;
    return damage * (1 + bonus.more);
  }

  private showStunFeedback(entity: EnemyEntity): void {
    // 다른 규칙들과 같이 발동 횟수를 센다. 검증 드라이버가 이 값의 변화를 보고
    // 기절이 실제로 걸린 순간을 잡아 화면을 찍는다.
    this.ruleEvents.fracture++;
    const enemy = entity.state;
    const radius = ENEMY_STATS[enemy.kind].radius;
    ring(this, enemy.x, enemy.y, STUN_COLOR, { from: radius * 0.5, to: radius * 2.1, duration: 300, width: 4 });
    flash(this, enemy.x, enemy.y, radius * 2.3, STUN_COLOR);
    floatingText(this, enemy.x, enemy.y - radius - 12, '기절', '#d8f3ff');
  }

  // ───────────────────────── 방

  /** 방에 들어설 때. 크기를 잡고 바닥과 벽을 그린 뒤 적을 채운다. */
  private enterRoom(restoredEnemies?: readonly Enemy[], restoredPlayer?: { x: number; y: number }, restoredExitOpen = false): void {
    const room = ROOMS[this.run.roomIndex];
    if (!room) return;

    // 방이 무엇을 요구하는지 들어오는 순간 한 번 말한다. 봉인된 문 앞에서
    // 이유를 모르면 방을 헤매게 된다. 전투가 시작되기 전에 읽히도록 조금 늦춘다.
    if (room.hint) {
      this.time.delayedCall(900, () => {
        if (this.run.phase !== 'combat') return;
        floatingText(this, this.player.x, this.player.y - PLAYER_RADIUS - 30, room.hint!, COLORS.accentText);
      });
    }

    this.clearTransientOverlays();
    this.rewardDrops = [];
    this.townNpc = null;
    this.trialExits = [];
    this.sealedDoorHintReadyAt = 0;
    this.destroyPortal(this.combatPortal);
    this.combatPortal = null;
    this.destroyPortal(this.townReturnPortal);
    this.townReturnPortal = null;
    for (const object of this.roomFloor) object.destroy();
    this.roomFloor = [];
    for (const entity of this.enemies) {
      entity.view.destroy();
      entity.hpBar.destroy();
      for (const dot of entity.statusDots) dot.destroy();
    }
    this.enemies = [];
    for (const projectile of this.projectiles) projectile.view.destroy();
    this.projectiles = [];
    for (const area of this.areas) area.view.destroy();
    this.areas = [];
    for (const shot of this.enemyShots) shot.view.destroy();
    this.enemyShots = [];

    this.exitOpen = false;
    this.resultScheduled = false;
    this.bounds = { minX: WALL, minY: WALL, maxX: room.width - WALL, maxY: room.height - WALL };
    // 방마다 크기가 다르므로 긴 변을 기준으로 맞춰 비율을 유지한다.
    this.minimapRoom = {
      width: room.width,
      height: room.height,
      scale: MINIMAP_MAX / Math.max(room.width, room.height),
    };

    const cx = room.width / 2;
    const cy = room.height / 2;
    const exit = this.standardExitPlacement(room.width, room.height);
    this.roomFloor.push(this.floorView(cx, cy, room.width, room.height, COLORS.background, 0x1b1e2b));
    // 서술 오브젝트를 먼저 놓아야 장식물이 그 자리를 피할 수 있다.
    this.placeLore(room);
    this.roomFloor.push(...this.propViews(room, this.run.roomIndex + 1, room.props));
    this.roomFloor.push(...this.wallViews(room.width, room.height, 0x2a2f42, exit));
    // 색조는 바닥·장식물·벽을 모두 덮어야 한 장소로 읽힌다. 그래서 마지막에 얹는다.
    this.roomFloor.push(this.toneView(cx, cy, room.width, room.height, room.tone));

    // 기본 출구. 분기 방은 들어온 방향의 반대쪽으로 해금 시험장에 되돌아간다.
    // 해금 시험장은 별도의 위/아래/오른쪽 문을 쓰므로 기본 출구는 감춰 둔다.
    this.exit = this.standardExitView(exit.side, exit.x, exit.y, 0x2a2f42);
    this.exitLabel = this.add
      .text(exit.labelX, exit.labelY, '', { fontSize: '17px', color: COLORS.accentText, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2);
    this.roomFloor.push(this.exit, this.exitLabel);
    if (this.run.roomIndex === TRIAL_ROOM_INDEX) {
      this.exit.setVisible(false);
      this.exitLabel.setVisible(false);
      this.createTrialExits(room.width, room.height);
    }

    // 플레이어는 왼쪽에서 들어온다. 포탈 복귀 때만 열었던 자리로 돌아온다.
    this.player.setPosition(restoredPlayer?.x ?? WALL + 90, restoredPlayer?.y ?? cy);
    followInRoom(this, this.player, room.width, room.height);

    const roomAlreadyCleared = this.run.clearedRooms.includes(this.run.roomIndex);
    if (restoredEnemies) {
      for (const enemy of restoredEnemies) this.enemies.push(this.createEnemyEntityFromState(this.cloneEnemy(enemy)));
    } else if (!roomAlreadyCleared) {
      for (const spawn of room.spawns) {
        for (let i = 0; i < spawn.count; i++) {
          const at = this.edgeSpawnPoint();
          this.enemies.push(this.createEnemyEntity(spawn.kind, at.x, at.y));
        }
      }
    }
    if (restoredExitOpen) {
      this.exitOpen = true;
      tintView(this.exit, COLORS.accent);
      this.exitLabel.setText(this.standardExitLabel(room));
      this.tweens.add({ targets: this.exit, alpha: 0.55, duration: 500, yoyo: true, repeat: -1 });
    } else if (roomAlreadyCleared) {
      if (this.run.roomIndex === TRIAL_ROOM_INDEX) this.openTrialExits();
      else this.openStandardExit(room);
    }
    this.refreshHud();
  }

  /** 마을은 전투를 멈추는 전체 화면 모달이 아니라 직접 걸어 다니는 비전투 방이다. */
  private enterTownRoom(): void {
    this.clearTransientOverlays();
    this.rewardDrops = [];
    this.destroyPortal(this.combatPortal);
    this.combatPortal = null;
    this.destroyPortal(this.townReturnPortal);
    this.townReturnPortal = null;
    for (const object of this.roomFloor) object.destroy();
    this.roomFloor = [];
    for (const projectile of this.projectiles) projectile.view.destroy();
    this.projectiles = [];
    for (const area of this.areas) area.view.destroy();
    this.areas = [];
    for (const shot of this.enemyShots) shot.view.destroy();
    this.enemyShots = [];
    for (const entity of this.enemies) {
      entity.view.destroy();
      entity.hpBar.destroy();
      for (const dot of entity.statusDots) dot.destroy();
    }
    this.enemies = [];

    const viaPortal = this.townPortalReturn !== null;
    this.exitOpen = !viaPortal;
    this.resultScheduled = false;
    this.bounds = { minX: WALL, minY: WALL, maxX: TOWN_WIDTH - WALL, maxY: TOWN_HEIGHT - WALL };
    this.minimapRoom = {
      width: TOWN_WIDTH,
      height: TOWN_HEIGHT,
      scale: MINIMAP_MAX / Math.max(TOWN_WIDTH, TOWN_HEIGHT),
    };

    const cx = TOWN_WIDTH / 2;
    const cy = TOWN_HEIGHT / 2;
    this.roomFloor.push(
      this.floorView(cx, cy, TOWN_WIDTH, TOWN_HEIGHT, 0x11131c, 0x24283a),
    );
    // 마을에는 서술 오브젝트가 없으므로 비워 둘 자리를 계산할 것도 없다.
    this.loreNotes = [];
    this.roomFloor.push(...this.propViews({ width: TOWN_WIDTH, height: TOWN_HEIGHT }, 99, TOWN_PROPS));
    this.roomFloor.push(...this.wallViews(TOWN_WIDTH, TOWN_HEIGHT, 0x3a4059, { side: 'right', x: TOWN_WIDTH - WALL / 2, y: cy }));
    this.roomFloor.push(this.toneView(cx, cy, TOWN_WIDTH, TOWN_HEIGHT, TOWN_TONE));

    this.exit = this.exitView(TOWN_WIDTH - WALL / 2, cy, viaPortal ? 0x2a2f42 : COLORS.accent);
    this.exitLabel = this.add
      .text(TOWN_WIDTH - WALL - 110, cy, viaPortal ? '' : '다음 전투 →', { fontSize: '17px', color: COLORS.accentText, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2);
    this.roomFloor.push(this.exit, this.exitLabel);

    if (viaPortal) {
      this.townReturnPortal = this.createPortalView(WALL + 150, cy + 110, '전투 구역 포탈', 0xb08bff, 0);
    }

    const npcX = cx - 120;
    const npcY = cy;
    const npcBody = this.textures.exists('npc-keeper')
      ? (() => {
          const sprite = this.add.sprite(npcX, npcY, 'npc-keeper').setDepth(5);
          sprite.setScale(80 / Math.max(sprite.width, sprite.height));
          // 원본 NPC 스프라이트는 오른쪽을 본다. 마을에 들어온 플레이어를 먼저 바라보게 둔다.
          sprite.setFlipX(true);
          return sprite;
        })()
      : this.add.rectangle(npcX, npcY, 38, 58, 0x8ea4ff, 0.95).setDepth(5);
    const npcStand = this.add.circle(npcX, npcY + 26, 32, 0x29304a, 0.75).setDepth(4);
    const npcPrompt = this.add
      .text(this.player.x - 78, this.player.y + PLAYER_RADIUS + 18, 'F 대화', {
        fontSize: '15px',
        color: COLORS.accentText,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(22)
      .setVisible(false);
    this.townNpc = { x: npcX, y: npcY, body: npcBody, prompt: npcPrompt };
    this.roomFloor.push(npcStand, npcBody, npcPrompt);

    this.player.setPosition(WALL + 90, cy);
    followInRoom(this, this.player, TOWN_WIDTH, TOWN_HEIGHT);
    this.refreshHud();
  }

  /**
   * 텍스처가 로딩됐으면 스프라이트, 아니면 같은 크기의 사각형.
   *
   * 이미지 로딩 실패가 게임을 막으면 안 된다. 배포 경로가 어긋나도 도형으로 계속 돌아간다.
   */
  private spriteOrShape(
    key: string,
    x: number,
    y: number,
    size: number,
    fallbackColor: number,
  ): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
    if (!this.textures.exists(key)) {
      return this.add.rectangle(x, y, size, size, fallbackColor).setDepth(5);
    }

    const sprite = this.add.sprite(x, y, key).setDepth(5);
    // 원본 비율을 유지한 채 긴 변을 size에 맞춘다. 찌그러지면 화풍이 무너진다.
    sprite.setScale((size * SPRITE_SCALE) / Math.max(sprite.width, sprite.height));
    return sprite;
  }

  /**
   * 투사체 하나의 표시체.
   *
   * 이미지는 오른쪽을 향해 그려져 있으므로 진행 각도만큼 돌린다.
   * 적 크기 스프라이트와 달리 여기서는 회전이 맞다 — 총알은 날아가는 방향이 곧 자세다.
   */
  private createBoltView(key: string, x: number, y: number, size: number, angle: number, fallbackColor: number) {
    if (!this.textures.exists(key)) return this.add.circle(x, y, size / 2, fallbackColor).setDepth(8);

    const sprite = this.add.sprite(x, y, key).setDepth(8);
    sprite.setScale(size / Math.max(sprite.width, sprite.height));
    sprite.setRotation(angle);
    return sprite;
  }

  /**
   * 방 바닥.
   *
   * 타일 이미지가 있으면 `TileSprite`로 반복해 깔고, 없으면 예전처럼 격자를 그린다.
   * 타일은 여백을 잘라내지 않고 내보냈다. 잘라내면 상하좌우 이음매가 어긋난다.
   */
  private floorView(cx: number, cy: number, width: number, height: number, background: number, line: number) {
    if (!this.textures.exists('tile-floor')) {
      return this.add.grid(cx, cy, width, height, 64, 64, background, 1, line, 1).setDepth(0);
    }
    return this.add.tileSprite(cx, cy, width, height, 'tile-floor').setDepth(0);
  }

  /**
   * 방 색조.
   *
   * 타일 한 장을 모든 방에 그대로 깔면 다섯 방과 마을이 전부 같은 곳으로 보인다.
   * 바닥 위에 반투명한 판을 한 겹 덮어 방마다 다른 인상을 만든다.
   */
  private toneView(cx: number, cy: number, width: number, height: number, tone: RoomTone) {
    return this.add.rectangle(cx, cy, width, height, tone.color, tone.alpha).setDepth(0);
  }

  /**
   * 바닥 장식물.
   *
   * **위치는 방 번호로 고정한다.** 매번 다르게 흩뿌리면 같은 방이 갈 때마다 달라 보여
   * 장소로 기억되지 않고, 플레이 테스트에서 본 화면을 다시 만들 수도 없다.
   *
   * 충돌 판정을 주지 않는다. 장식이 전투 계산에 끼어들면 안 된다.
   * 대신 시작 지점·출구·서술 오브젝트 근처는 비워 둔다. 그 자리는 읽어야 할 것이 있다.
   */
  private propViews(room: { width: number; height: number }, seed: number, props: readonly { kind: PropKind; count: number }[]) {
    const views: Phaser.GameObjects.GameObject[] = [];
    let state = seed * 9301 + 49297;
    const random = () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };

    const cy = room.height / 2;
    const keepClear = [
      { x: WALL + 90, y: cy, r: 150 }, // 플레이어가 들어오는 자리
      { x: room.width - WALL, y: cy, r: 170 }, // 출구
      ...this.loreNotes.map((note) => ({ x: note.x, y: note.y, r: 110 })),
    ];

    for (const { kind, count } of props) {
      const key = `prop-${kind}`;
      if (!this.textures.exists(key)) continue;
      for (let i = 0; i < count; i++) {
        let x = 0;
        let y = 0;
        // 비워 둘 자리에 걸리면 다시 뽑는다. 몇 번 실패하면 그 하나는 포기한다.
        let tries = 0;
        do {
          x = WALL + 70 + random() * (room.width - WALL * 2 - 140);
          y = WALL + 70 + random() * (room.height - WALL * 2 - 140);
          tries += 1;
        } while (tries < 12 && keepClear.some((z) => Math.hypot(x - z.x, y - z.y) < z.r));
        if (tries >= 12) continue;

        const sprite = this.add.sprite(x, y, key).setDepth(0);
        // 크기와 각도를 조금씩 흔든다. 같은 그림이 반복되는 것이 눈에 띄지 않아야 한다.
        const size = 52 + random() * 30;
        sprite.setScale(size / Math.max(sprite.width, sprite.height));
        sprite.setAngle(random() * 360);
        sprite.setAlpha(0.85 + random() * 0.15);
        views.push(sprite);
      }
    }
    return views;
  }

  private createWeaponView(): Phaser.GameObjects.Sprite | null {
    if (!this.textures.exists('weapon-sword')) return null;
    // 원점은 무기마다 다르다(`WEAPON_GRIP_ORIGIN`). `refreshWeaponViews`가 정한다.
    // 깊이도 마찬가지다. 어느 자리에 서는지가 방향에 따라 바뀐다.
    return this.add.sprite(0, 0, 'weapon-sword').setVisible(false);
  }

  private createWeaponCore(): Phaser.GameObjects.Arc | null {
    if (!this.textures.exists('weapon-sword')) return null;
    return this.add.circle(0, 0, WEAPON_CORE_RADIUS, 0xffffff, WEAPON_CORE_ALPHA).setVisible(false);
  }

  /**
   * 무기가 손에서 솟아오르는 연출.
   *
   * 무기를 바꾼 순간에만 튼다. 평소에도 계속 움직이면 34px짜리 그림이 화면에서
   * 흔들려 오히려 읽기 어려워진다.
   */
  private playMaterialize(view: Phaser.GameObjects.Sprite, core: Phaser.GameObjects.Arc | null): void {
    const scale = view.scaleX;
    this.tweens.killTweensOf(view);
    view.setScale(scale * 0.4).setAlpha(0);
    this.tweens.add({ targets: view, scaleX: scale, scaleY: scale, alpha: 1, duration: 180, ease: 'Back.easeOut' });

    if (!core) return;
    this.tweens.killTweensOf(core);
    core.setScale(2.4).setAlpha(0.95);
    this.tweens.add({ targets: core, scaleX: 1, scaleY: 1, alpha: WEAPON_CORE_ALPHA, duration: 260, ease: 'Cubic.easeOut' });
  }

  /** 손에 든 무기가 바뀌면 그림도 바꾼다. R링 교체와 마을 설정 뒤에 불린다. */
  private refreshWeaponViews(): void {
    for (const [hand, runtime] of [['left', this.left], ['right', this.right]] as const) {
      const view = this.weaponViews[hand];
      const core = this.weaponCores[hand];
      if (!view) continue;
      if (!runtime) {
        view.setVisible(false);
        core?.setVisible(false);
        this.shownWeapon[hand] = null;
        continue;
      }
      const changed = this.shownWeapon[hand] !== runtime.weapon.id;
      view.setTexture(WEAPON_SPRITE[runtime.weapon.id]);
      view.setScale(WEAPON_VIEW_SIZE / Math.max(view.width, view.height));
      view.setVisible(true);
      core?.setFillStyle(runtime.weapon.color, WEAPON_CORE_ALPHA).setVisible(true);
      if (changed) this.playMaterialize(view, core);
      this.shownWeapon[hand] = runtime.weapon.id;
    }
  }

  /**
   * 무기를 조준 방향 기준으로 배치한다.
   *
   * 캐릭터는 좌우 반전만 하지만 무기는 회전시킨다. 어느 쪽을 겨누는지가 무기 각도로
   * 드러나야 손에 들고 겨눈다는 인상이 생긴다. 왼손은 조준선 왼쪽, 오른손은 오른쪽에 둔다.
   */
  private updateWeaponViews(angle: number): void {
    const flipped = Math.cos(angle) < 0;
    const width = this.player instanceof Phaser.GameObjects.Sprite ? this.player.displayWidth : PLAYER_RADIUS * 2;
    const height = this.player instanceof Phaser.GameObjects.Sprite ? this.player.displayHeight : PLAYER_RADIUS * 2;

    for (const hand of ['left', 'right'] as const) {
      const view = this.weaponViews[hand];
      if (!view?.visible) continue;

      // **뒤집으면 그림 속 두 손이 화면에서 자리를 맞바꾼다.** 오프셋만 x로 뒤집으면
      // 왼손 무기가 화면 오른쪽에 있다가 왼쪽으로 건너가, 손이 뒤바뀐 것처럼 보인다.
      // 자리도 함께 맞바꾸면 각 손의 무기가 늘 같은 쪽에 남으면서, 그림 속 장갑
      // 위에 그대로 얹힌다. 두 장갑은 생김새가 같아 어느 쪽을 쓰든 티가 나지 않는다.
      const slot = flipped ? otherHand(hand) : hand;
      const offset = WEAPON_HAND_OFFSET[slot];
      const handX = this.player.x + offset.x * width * (flipped ? -1 : 1);
      const handY = this.player.y + offset.y * height;
      view.setPosition(handX, handY).setDepth(WEAPON_SLOT_DEPTH[slot]);
      this.weaponCores[hand]?.setPosition(handX, handY).setDepth(WEAPON_SLOT_CORE_DEPTH[slot]);

      // 좌우 반전은 각도를 거울에 비추는 것과 같다. 위아래도 같이 뒤집어야 자세가 선다.
      const runtime = hand === 'left' ? this.left : this.right;
      const pose = WEAPON_POSE_ANGLE[runtime?.weapon.id ?? 'sword'];
      view.setRotation(flipped ? Math.PI - pose : pose);
      view.setFlipY(flipped);

      // **`setFlipY`는 그림만 뒤집고 원점은 그대로 둔다.** 그래서 뒤집으면 손잡이가
      // 반대편(1 - y)으로 가는데 원점은 제자리에 남아, 무기가 손에서 통째로 떨어진다.
      // 예전에는 원점 y가 0.5라 뒤집어도 같은 자리였고(0.5는 뒤집힘의 고정점),
      // 손잡이 위치를 무기마다 따로 잡으면서 비로소 드러난 문제다. 검은 0.16이라
      // 어긋나는 거리가 (0.5 - 0.16) x 2 x 34px = 23px, 무기 길이의 3분의 2다.
      const grip = WEAPON_GRIP_ORIGIN[runtime?.weapon.id ?? 'sword'];
      view.setOrigin(grip.x, flipped ? 1 - grip.y : grip.y);
    }
  }

  /**
   * 개발용: 마을 도착 상태까지 밀어 놓는다.
   *
   * 마을 UI와 R링을 확인하려면 첫 보스를 넘어야 해서, 자동 검증도 손 검증도 그 앞에서 막혔다.
   * 수치를 따로 심지 않고 **실제 방 클리어 전이(`clearRoom`)를 그대로 태운다.** 그래야
   * 보상·해금·R링 후보가 실제로 마을에 도착했을 때와 같은 상태가 된다.
   */
  private fastForwardToTown(run: RunState): RunState {
    let next = run;
    for (let i = 0; i < TOTAL_ROOMS && next.phase === 'combat'; i++) {
      next = clearRoom(next);
      if (next.phase === 'town') break;
    }
    return next;
  }

  /**
   * 콤보 링. 이미지가 있으면 스프라이트, 없으면 예전처럼 선으로 그린 원.
   *
   * 틴트는 WebGL 렌더러에서만 동작한다. Canvas로 떨어진 환경에서는 링이 흰색으로 남지만
   * 반지름 차이로 좌/우손은 여전히 구분된다.
   */
  private createComboRing(diameter: number, color: number): ShapeOrSprite {
    if (!this.textures.exists('combo-ring')) {
      return this.add.circle(0, 0, diameter / 2).setStrokeStyle(3, color).setDepth(11).setVisible(false);
    }
    const sprite = this.add.sprite(0, 0, 'combo-ring').setDepth(11).setVisible(false);
    sprite.setDisplaySize(diameter, diameter);
    sprite.setTint(color);
    return sprite;
  }

  /**
   * 방 가장자리의 벽.
   *
   * 카메라가 방 안으로 제한되므로 벽은 판정 경계(`WALL`) 안쪽 24px 띠에만 그릴 수 있다.
   * 타일 이미지가 없으면 예전처럼 선 테두리 하나로 대체한다.
   */
  private wallViews(
    width: number,
    height: number,
    lineColor: number,
    exit?: { side: StandardExitSide; x: number; y: number },
  ): Phaser.GameObjects.GameObject[] {
    if (!this.textures.exists('tile-wall')) {
      return [
        this.add
          .rectangle(width / 2, height / 2, width - WALL * 2, height - WALL * 2)
          .setStrokeStyle(3, lineColor)
          .setDepth(0),
      ];
    }

    // 텍스처는 **가로로 긴 벽 띠**다. 정사각형을 쓰면 가로 벽과 세로 벽이 타일의 서로 다른
    // 부분을 잘라 쓰게 되어 돌 크기와 무늬가 서로 달라진다.
    // 세로 벽은 같은 띠를 90도 돌려 쓴다. 그래야 네 면의 돌이 같은 크기로 보인다.
    const texture = this.textures.get('tile-wall').getSourceImage() as { height: number };
    const tileScale = WALL / (texture.height || WALL);

    // 가로 벽은 모서리를 비켜 안쪽만 덮는다. 겹쳐 두면 모서리에서 돌 방향이 갑자기 꺾인다.
    const bands: Phaser.GameObjects.TileSprite[] = [];

    const addHorizontalWall = (side: 'top' | 'bottom') => {
      const y = side === 'top' ? WALL / 2 : height - WALL / 2;
      const flip = side === 'bottom';
      const gap = exit?.side === side ? { from: exit.x - EXIT_SIZE / 2, to: exit.x + EXIT_SIZE / 2 } : null;
      const segments = gap
        ? [
            { from: WALL, to: Math.max(WALL, gap.from) },
            { from: Math.min(width - WALL, gap.to), to: width - WALL },
          ]
        : [{ from: WALL, to: width - WALL }];
      for (const segment of segments) {
        const length = segment.to - segment.from;
        if (length <= 0) continue;
        const wall = this.add.tileSprite(segment.from + length / 2, y, length, WALL, 'tile-wall');
        if (flip) wall.setFlipY(true);
        bands.push(wall);
      }
    };

    const addVerticalWall = (side: 'left' | 'right') => {
      const x = side === 'left' ? WALL / 2 : width - WALL / 2;
      const flip = side === 'left';
      const gap = exit?.side === 'right' && side === 'right' ? { from: exit.y - EXIT_SIZE / 2, to: exit.y + EXIT_SIZE / 2 } : null;
      const segments = gap
        ? [
            { from: 0, to: Math.max(0, gap.from) },
            { from: Math.min(height, gap.to), to: height },
          ]
        : [{ from: 0, to: height }];
      for (const segment of segments) {
        const length = segment.to - segment.from;
        if (length <= 0) continue;
        const wall = this.add.tileSprite(x, segment.from + length / 2, length, WALL, 'tile-wall').setAngle(90);
        if (flip) wall.setFlipY(true);
        bands.push(wall);
      }
    };

    addHorizontalWall('top');
    addHorizontalWall('bottom');
    addVerticalWall('left');
    addVerticalWall('right');
    for (const band of bands) {
      band.setTileScale(tileScale);
      band.setDepth(0);
    }

    // 네 모서리는 기둥으로 막는다. 두 방향의 돌이 만나는 자리를 그대로 두면
    // 무늬가 어긋나 보이므로, 이음매를 감추는 동시에 방 구조처럼 읽히게 한다.
    const corners: Phaser.GameObjects.GameObject[] = [];
    for (const [cx2, cy2] of [
      [WALL / 2, WALL / 2],
      [width - WALL / 2, WALL / 2],
      [WALL / 2, height - WALL / 2],
      [width - WALL / 2, height - WALL / 2],
    ] as const) {
      corners.push(
        this.add.rectangle(cx2, cy2, WALL, WALL, 0x3d4658).setStrokeStyle(2, 0x20242f, 0.9).setDepth(0),
      );
    }
    return [...bands, ...corners];
  }

  /**
   * 오른쪽 벽의 출구.
   *
   * **문짝 그림을 쓰지 않는다.** 이 맵은 천장에서 내려다보는 시점이라, 정면에서 본 문은
   * 아무리 크기와 위치를 맞춰도 시점이 어긋난다. 위에서 보면 출구는 문이 아니라
   * **벽이 끊긴 통로**다. 그래서 벽 띠를 출구 자리에서 끊고(`wallViews`), 그 틈을 이 사각형이
   * 채운다. 닫혀 있으면 어둡고, 열리면 강조색으로 바뀐다.
   */
  private exitView(x: number, y: number, color: number) {
    return this.add.rectangle(x, y, WALL, EXIT_SIZE, color).setDepth(1);
  }

  private standardExitSide(): StandardExitSide {
    if (this.run.roomIndex === UPPER_BRANCH_ROOM_INDEX) return 'bottom';
    if (this.run.roomIndex === LOWER_BRANCH_ROOM_INDEX) return 'top';
    return 'right';
  }

  private standardExitPlacement(width: number, height: number): { side: StandardExitSide; x: number; y: number; labelX: number; labelY: number } {
    const side = this.standardExitSide();
    const cx = width / 2;
    const cy = height / 2;
    if (side === 'top') return { side, x: cx, y: WALL / 2, labelX: cx, labelY: WALL + 24 };
    if (side === 'bottom') return { side, x: cx, y: height - WALL / 2, labelX: cx, labelY: height - WALL - 24 };
    return { side, x: width - WALL / 2, y: cy, labelX: width - WALL - 110, labelY: cy };
  }

  private standardExitView(side: StandardExitSide, x: number, y: number, color: number) {
    return side === 'right'
      ? this.exitView(x, y, color)
      : this.add.rectangle(x, y, EXIT_SIZE, WALL, color).setDepth(1);
  }

  private createEnemyEntity(kind: Enemy['kind'], x: number, y: number): EnemyEntity {
    const enemy = createEnemy(kind, x, y);
    return this.createEnemyEntityFromState(enemy);
  }

  private createEnemyEntityFromState(enemy: Enemy): EnemyEntity {
    const stats = ENEMY_STATS[enemy.kind];

    return {
      state: enemy,
      view: this.spriteOrShape(ENEMY_SPRITE[enemy.kind], enemy.x, enemy.y, stats.radius * 2, stats.color),
      hpBar: this.add.rectangle(enemy.x, enemy.y - stats.radius - 9, stats.radius * 2, 4, 0x6ee7a8).setDepth(6),
      statusDots: STATUS_ORDER.map((status, index) => this.statusMark(enemy.x + (index - 1.5) * 15, enemy.y - stats.radius - 20, status)),
    };
  }

  private statusMark(x: number, y: number, status: StatusKind): Phaser.GameObjects.Container {
    const badge = this.add
      .circle(0, 0, status === 'wound' ? 8 : 6, STATUS_COLORS[status], 0.95)
      .setStrokeStyle(2, 0x10131d, 0.95);
    const children: Phaser.GameObjects.GameObject[] = [badge];
    const container = this.add.container(x, y, children).setDepth(7).setVisible(false);

    if (status === 'wound') {
      const stackText = this.add
        .text(0, 0, '', { fontSize: '9px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setResolution(2);
      container.add(stackText);
      container.setData('stackText', stackText);
    }

    return container;
  }

  private cloneEnemy(enemy: Enemy): Enemy {
    return {
      ...enemy,
      statuses: enemy.statuses.map((status) => ({ ...status })),
      immunity: { ...enemy.immunity },
      boss: enemy.boss
        ? {
            ...enemy.boss,
            chargeDirection: { ...enemy.boss.chargeDirection },
            summonedAt: [...enemy.boss.summonedAt],
          }
        : undefined,
    };
  }

  private createPortalView(x: number, y: number, label: string, color: number, delayMs = 280): PortalView {
    const ringView = this.add.circle(x, y, 42, color, 0.18).setStrokeStyle(3, color, 0.8).setDepth(3);
    const core = this.add.circle(x, y, 18, color, 0.36).setDepth(3);
    const prompt = this.add
      .text(x, y - 58, label, { fontSize: '15px', color: COLORS.accentText, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(22);
    this.tweens.add({ targets: ringView, scale: 1.12, alpha: 0.36, duration: 720, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: core, scale: 0.78, alpha: 0.58, duration: 560, yoyo: true, repeat: -1 });
    return { x, y, enabledAt: this.time.now + delayMs, ring: ringView, core, prompt };
  }

  private destroyPortal(portal: PortalView | null): void {
    if (!portal) return;
    portal.ring.destroy();
    portal.core.destroy();
    portal.prompt.destroy();
  }

  /**
   * 배경 서술 오브젝트를 방에 놓는다.
   *
   * 다가가야만 읽히고, 읽지 않아도 게임은 끝까지 진행된다.
   * 전투 중에 시선을 뺏지 않도록 표시는 작고 어둡게 둔다.
   */
  private placeLore(room: (typeof ROOMS)[number]): void {
    this.loreNotes = loreFor(this.run.roomIndex).map((note) => {
      const x = note.at.x * room.width;
      const y = note.at.y * room.height;

      // 바닥에 놓인 작은 표식. 마름모로 두어 적(사각형)과 헷갈리지 않게 한다.
      const mark = this.textures.exists('lore-stone')
        ? (() => {
            const sprite = this.add.sprite(x, y, 'lore-stone').setDepth(1);
            sprite.setScale(46 / Math.max(sprite.width, sprite.height));
            return sprite;
          })()
        : this.add.rectangle(x, y, 15, 15, 0x3a4059).setAngle(45).setDepth(1);
      const text = this.add
        .text(x, y - 46, note.text, {
          fontSize: '15px',
          color: COLORS.textDim,
          align: 'center',
          lineSpacing: 5,
        })
        .setOrigin(0.5, 1)
        .setDepth(12)
        .setAlpha(0);

      // 글자만 띄우면 적 위에 겹쳤을 때 읽히지 않는다. 어두운 판을 깔아준다.
      const plate = this.add
        .rectangle(x, text.y - text.height / 2, text.width + 22, text.height + 14, 0x0a0b0f, 0.82)
        .setDepth(11)
        .setAlpha(0);

      this.roomFloor.push(mark, plate, text);
      return { x, y, mark, plate, text };
    });
  }

  /** 가까이 있는 서술만 보이게 한다. */
  private updateLore(): void {
    for (const note of this.loreNotes) {
      const near = Math.hypot(this.player.x - note.x, this.player.y - note.y) <= LORE_RADIUS;
      // 갑자기 켜지고 꺼지면 지나갈 때마다 깜빡인다. 부드럽게 오간다.
      const target = near ? 1 : 0;
      const alpha = Phaser.Math.Linear(note.text.alpha, target, 0.12);
      note.text.setAlpha(alpha);
      note.plate.setAlpha(alpha);
      // 가까이 가면 밝아진다. 스프라이트는 원래 색을 살려야 하므로 멀어지면 틴트를 걷는다.
      if (note.mark instanceof Phaser.GameObjects.Sprite) {
        if (near) note.mark.setTint(0xbcc6e6);
        else note.mark.clearTint();
      } else {
        note.mark.setFillStyle(near ? 0x6b7396 : 0x3a4059);
      }
    }
  }

  private edgeSpawnPoint(): { x: number; y: number } {
    for (let attempt = 0; attempt < 12; attempt++) {
      const onVertical = Math.random() < 0.5;
      const point = onVertical
        ? {
            x: Math.random() < 0.5 ? this.bounds.minX + 30 : this.bounds.maxX - 30,
            y: Phaser.Math.Between(this.bounds.minY + 30, this.bounds.maxY - 30),
          }
        : {
            x: Phaser.Math.Between(this.bounds.minX + 30, this.bounds.maxX - 30),
            y: Math.random() < 0.5 ? this.bounds.minY + 30 : this.bounds.maxY - 30,
          };
      if (Math.hypot(point.x - this.player.x, point.y - this.player.y) > 220) return point;
    }
    return { x: this.bounds.minX + 30, y: this.bounds.minY + 30 };
  }

  private openTownPortal(): void {
    const angle = this.aimAngle();
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * 115, this.bounds.minX + 60, this.bounds.maxX - 60);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * 115, this.bounds.minY + 60, this.bounds.maxY - 60);
    this.destroyPortal(this.combatPortal);
    this.combatPortal = this.createPortalView(x, y, '마을 포탈', 0x8ea4ff);
    floatingText(this, x, y - 70, '마을 포탈이 열렸다', COLORS.accentText, { duration: 1200 });
  }

  private updateCombatPortalPrompt(): void {
    if (!this.combatPortal) return;
    const near = Math.hypot(this.player.x - this.combatPortal.x, this.player.y - this.combatPortal.y) <= 90;
    this.combatPortal.prompt.setAlpha(near ? 1 : 0.42);
  }

  private checkCombatPortalReached(): void {
    const portal = this.combatPortal;
    if (!portal || this.run.phase !== 'combat' || this.time.now < portal.enabledAt) return;
    if (Math.hypot(this.player.x - portal.x, this.player.y - portal.y) > 42) return;

    this.townPortalReturn = {
      roomIndex: this.run.roomIndex,
      player: { x: portal.x, y: portal.y },
      enemies: this.enemies.filter((entity) => isAlive(entity.state)).map((entity) => this.cloneEnemy(entity.state)),
      exitOpen: this.exitOpen,
    };
    this.destroyPortal(this.combatPortal);
    this.combatPortal = null;
    this.run = { ...this.run, phase: 'town' };
    this.enterTownRoom();
    if (DEBUG_ENABLED) this.publishDebug();
  }

  private checkTownReturnPortalReached(): void {
    const portal = this.townReturnPortal;
    const snapshot = this.townPortalReturn;
    if (!portal || !snapshot || this.run.phase !== 'town' || this.overlay) return;
    if (Math.hypot(this.player.x - portal.x, this.player.y - portal.y) > 44) return;

    this.townPortalReturn = null;
    this.destroyPortal(this.townReturnPortal);
    this.townReturnPortal = null;
    this.run = { ...this.run, phase: 'combat', roomIndex: snapshot.roomIndex };
    this.syncWeaponRuntimes();
    this.enterRoom(snapshot.enemies, snapshot.player, snapshot.exitOpen);
    if (DEBUG_ENABLED) this.publishDebug();
  }

  /**
   * 방을 정리하면 출구가 열린다. 바로 넘어가지 않고 걸어 나가야 한다.
   * 마지막 방(최종 보스)만 보상 연출을 잠시 보여준 뒤 승리로 간다.
   */
  private checkRoomCleared(): void {
    if (this.run.phase !== 'combat' || this.exitOpen || this.resultScheduled) return;
    if (this.enemies.some((e) => isAlive(e.state))) return;
    if (this.rewardDrops.some((drop) => !drop.collected)) return;

    if (this.run.roomIndex === TRIAL_ROOM_INDEX) {
      this.run = markCurrentRoomCleared(this.run);
      this.saveCurrentProgress();
      this.openTrialExits();
      if (DEBUG_ENABLED) this.publishDebug();
      return;
    }

    if (this.run.roomIndex >= TOTAL_ROOMS - 1) {
      this.resultScheduled = true;
      this.run = clearRoom(this.run);
      this.saveCurrentProgress();
      this.time.delayedCall(1200, () => this.showResult(true));
      if (DEBUG_ENABLED) this.publishDebug();
      return;
    }

    const room = ROOMS[this.run.roomIndex];

    // **봉인된 문은 적을 다 정리해도 열리지 않는다.** 열쇠가 부족하면 무엇이 없는지
    // 말해 준다. 이유 없이 안 열리면 버그로 보이고, 플레이어는 방을 헤맨다.
    if (!exitUnlocked(this.run)) {
      const missing = missingKeys(this.run.progress.ownedKeys).map((key) => key.name);
      this.exitLabel.setText('봉인됨');
      floatingText(
        this,
        this.player.x,
        this.player.y - PLAYER_RADIUS - 30,
        `${missing.join(' · ')}이 필요하다`,
        '#ffb4a2',
      );
      return;
    }

    this.openStandardExit(room);
  }

  private openStandardExit(room: (typeof ROOMS)[number] | undefined): void {
    this.exitOpen = true;
    tintView(this.exit, COLORS.accent);
    this.exitLabel.setText(this.standardExitLabel(room));
    this.tweens.add({ targets: this.exit, alpha: 0.55, duration: 500, yoyo: true, repeat: -1 });
  }

  private standardExitLabel(room: (typeof ROOMS)[number] | undefined): string {
    if (this.branchReturnTarget() === TRIAL_ROOM_INDEX) {
      const side = this.standardExitSide();
      if (side === 'bottom') return '시험장 ↓';
      if (side === 'top') return '시험장 ↑';
      return '시험장 →';
    }
    return room?.entersTown ? '마을 →' : '출구 →';
  }

  private createTrialExits(width: number, height: number): void {
    const cx = width / 2;
    const cy = height / 2;
    const missing = missingKeys(this.run.progress.ownedKeys);
    const rightColor = missing.length === 0 ? COLORS.accent : 0x3a2a2f;
    const exits: TrialExit[] = [
      {
        side: 'top',
        target: UPPER_BRANCH_ROOM_INDEX,
        body: this.add.rectangle(cx, WALL / 2, EXIT_SIZE, WALL, 0x2f6b4a).setDepth(1),
        label: this.add.text(cx, WALL + 24, '윗길 제단 ↑', { fontSize: '17px', color: COLORS.accentText, fontStyle: 'bold' }).setOrigin(0.5),
      },
      {
        side: 'bottom',
        target: LOWER_BRANCH_ROOM_INDEX,
        body: this.add.rectangle(cx, height - WALL / 2, EXIT_SIZE, WALL, 0x6b5a2f).setDepth(1),
        label: this.add.text(cx, height - WALL - 24, '아랫길 굴 ↓', { fontSize: '17px', color: COLORS.accentText, fontStyle: 'bold' }).setOrigin(0.5),
      },
      {
        side: 'right',
        target: SEALED_ROOM_INDEX,
        body: this.exitView(width - WALL / 2, cy, rightColor),
        label: this.add
          .text(width - WALL - 124, cy, missing.length === 0 ? '봉인 해제 →' : '봉인된 문', {
            fontSize: '17px',
            color: missing.length === 0 ? COLORS.accentText : '#ffb4a2',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      },
    ];

    this.trialExits = exits;
    for (const exit of exits) this.roomFloor.push(exit.body, exit.label);
  }

  private openTrialExits(): void {
    this.exitOpen = true;
    const missing = missingKeys(this.run.progress.ownedKeys);
    for (const exit of this.trialExits) {
      if (exit.side === 'right') {
        tintView(exit.body, missing.length === 0 ? COLORS.accent : 0x3a2a2f);
        exit.label.setText(missing.length === 0 ? '봉인 해제 →' : '봉인된 문');
        exit.label.setColor(missing.length === 0 ? COLORS.accentText : '#ffb4a2');
      } else {
        tintView(exit.body, exit.side === 'top' ? 0x3f8f64 : 0x9a7a3f);
      }
    }
    if (missing.length > 0) {
      floatingText(this, this.player.x, this.player.y - PLAYER_RADIUS - 30, '위·아래 길에서 열쇠 2개를 찾아야 한다', COLORS.accentText);
    }
  }

  private branchReturnTarget(): number | null {
    return this.run.roomIndex === UPPER_BRANCH_ROOM_INDEX || this.run.roomIndex === LOWER_BRANCH_ROOM_INDEX
      ? TRIAL_ROOM_INDEX
      : null;
  }

  /** 위·아래 분기에서 시험장으로 돌아올 때 통과한 문 바로 안쪽에 선다. */
  private branchReturnSpawn(fromRoomIndex: number): { x: number; y: number } | undefined {
    const trial = ROOMS[TRIAL_ROOM_INDEX];
    if (!trial) return undefined;

    const inset = WALL + PLAYER_RADIUS + 32;
    if (fromRoomIndex === UPPER_BRANCH_ROOM_INDEX) return { x: trial.width / 2, y: inset };
    if (fromRoomIndex === LOWER_BRANCH_ROOM_INDEX) return { x: trial.width / 2, y: trial.height - inset };
    return undefined;
  }

  /** 열린 출구에 닿으면 다음 방으로 넘어간다. */
  private checkExitReached(): void {
    if (this.run.phase !== 'combat') return;
    if (!this.exitOpen) return;
    if (this.checkTrialExitReached()) return;
    const side = this.standardExitSide();
    const near =
      side === 'top' || side === 'bottom'
        ? Math.abs(this.player.x - this.exit.x) <= EXIT_SIZE / 2 + PLAYER_RADIUS &&
          Math.abs(this.player.y - this.exit.y) <= WALL + PLAYER_RADIUS
        : Math.abs(this.player.x - this.exit.x) <= WALL + PLAYER_RADIUS &&
          Math.abs(this.player.y - this.exit.y) <= EXIT_SIZE / 2 + PLAYER_RADIUS;
    if (!near) return;

    this.exitOpen = false;
    const fromRoomIndex = this.run.roomIndex;
    const returnTarget = this.branchReturnTarget();
    const returnSpawn = returnTarget === TRIAL_ROOM_INDEX ? this.branchReturnSpawn(fromRoomIndex) : undefined;
    this.run = returnTarget === null ? clearRoom(this.run) : clearRoomTo(this.run, returnTarget);
    this.saveCurrentProgress();

    if (this.run.phase === 'town') this.enterTownRoom();
    else this.enterRoom(undefined, returnSpawn);

    if (DEBUG_ENABLED) this.publishDebug();
  }

  private checkTrialExitReached(): boolean {
    if (this.run.roomIndex !== TRIAL_ROOM_INDEX) return false;

    for (const exit of this.trialExits) {
      const near =
        exit.side === 'top' || exit.side === 'bottom'
          ? Math.abs(this.player.x - exit.body.x) <= EXIT_SIZE / 2 + PLAYER_RADIUS &&
            Math.abs(this.player.y - exit.body.y) <= WALL + PLAYER_RADIUS
          : Math.abs(this.player.x - exit.body.x) <= WALL + PLAYER_RADIUS &&
            Math.abs(this.player.y - exit.body.y) <= EXIT_SIZE / 2 + PLAYER_RADIUS;
      if (!near) continue;

      if (exit.side === 'right' && missingKeys(this.run.progress.ownedKeys).length > 0) {
        const now = this.time.now;
        if (now >= this.sealedDoorHintReadyAt) {
          this.sealedDoorHintReadyAt = now + 1400;
          floatingText(this, this.player.x, this.player.y - PLAYER_RADIUS - 30, '위·아래 길에서 열쇠 2개를 찾아야 한다', '#ffb4a2');
        }
        return true;
      }

      this.exitOpen = false;
      this.run = moveToRoom(this.run, exit.target);
      this.saveCurrentProgress();
      this.enterRoom();
      if (DEBUG_ENABLED) this.publishDebug();
      return true;
    }

    return false;
  }

  /** 마을 오른쪽 출구에 닿으면 다음 전투 방으로 넘어간다. */
  private checkTownExitReached(): void {
    if (this.run.phase !== 'town' || !this.exitOpen || this.overlay) return;
    if (Math.abs(this.player.x - this.exit.x) > WALL + PLAYER_RADIUS) return;
    if (Math.abs(this.player.y - this.exit.y) > EXIT_SIZE / 2 + PLAYER_RADIUS) return;

    this.exitOpen = false;
    this.closeOverlay();
    this.run = leaveTown(this.run);
    this.saveCurrentProgress();
    this.syncWeaponRuntimes();
    this.enterRoom();

    if (DEBUG_ENABLED) this.publishDebug();
  }

  // ───────────────────────── 갱신 루프

  update(_time: number, delta: number): void {
    // 오버레이는 전투가 멈춘 동안에도 화면에 붙어 있어야 한다.
    //
    // `active`를 반드시 확인한다. 이 줄은 update의 맨 앞이라, 여기서 예외가 나면
    // 이동을 포함한 아래 전부가 멈춘다. 파괴된 컨테이너를 만지면 그렇게 된다.
    if (this.overlay?.active) pinContainer(this, this.overlay);
    // 일시정지 중에는 시간도 적도 멈춘다. 오버레이 고정만 위에서 끝냈다.
    // 디버그 상태는 계속 내보낸다. 여기서 막으면 멈춘 사실 자체가 안 보인다.
    if (this.paused) {
      if (DEBUG_ENABLED) this.publishDebug();
      return;
    }
    if (this.weaponWheel?.container.active) {
      pinContainer(this, this.weaponWheel.container);
      this.updateWeaponWheel();
      return;
    }
    if (this.run.phase === 'combat' && this.overlay) {
      if (DEBUG_ENABLED) this.publishDebug();
      return;
    }
    if (this.run.phase === 'town') {
      if (this.overlay) {
        if (DEBUG_ENABLED) this.publishDebug();
        return;
      }
      const dt = delta / 1000;
      this.movePlayer(dt);
      this.updateAim();
      this.updateHeldWeaponInputs();
      this.updateComboRings();
      this.updateTownNpcPrompt();
      this.updateMinimap();
      this.updateAreas(dt);
      this.updateProjectiles(dt);
      this.checkTownReturnPortalReached();
      this.checkTownExitReached();
      if (DEBUG_ENABLED) this.publishDebug();
      return;
    }
    if (this.run.phase !== 'combat') return;
    const dt = delta / 1000;

    this.run = advanceTime(this.run, dt);
    this.combo = tickCombo(this.combo, dt);
    this.empower = tickEmpower(this.empower, dt);
    // 콤보가 줄거나 풀리면 `합계 N 이상인 동안` 같은 지속 강화도 같이 꺼져야 한다.
    this.refreshSustainedEmpower();

    this.movePlayer(dt);
    this.updateAim();
    this.updateHeldWeaponInputs();
    this.updateComboRings();
    this.updateComboText();
    this.updateArcaneAura();
    this.updateOffscreenMarks();
    this.updateMinimap();
    this.updateLore();
    this.updateRewardDropPrompt();
    this.updateCombatPortalPrompt();
    if (DEBUG_ENABLED) this.publishDebug();
    this.updateAreas(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateEnemyShots(dt);
    this.checkRoomCleared();
    this.checkCombatPortalReached();
    this.checkExitReached();
  }

  private updateHeldWeaponInputs(): void {
    if (this.weaponWheel || this.paused || this.overlay) return;
    if (this.run.phase !== 'combat' && this.run.phase !== 'town') return;

    const pointer = this.input.activePointer;
    const angle = this.pointerAimAngle(pointer);
    if (pointer.leftButtonDown()) this.useWeapon(this.left, angle);
    if ((pointer.rightButtonDown() || this.keys.shift.isDown) && this.right) this.useWeapon(this.right, angle);
  }

  /** 개발 빌드에서만 상태를 노출한다. 헤드리스 검증 드라이버가 읽는다. */
  private publishDebug(): void {
    publishDebugState({
      phase: this.run.phase,
      paused: this.paused,
      roomIndex: this.run.roomIndex,
      totalRooms: TOTAL_ROOMS,
      hp: this.run.hp,
      maxHp: this.run.maxHp,
      kills: this.run.kills,
      elapsed: this.run.elapsed,
      player: { x: this.player.x, y: this.player.y },
      enemies: this.enemies
        .filter((e) => isAlive(e.state))
        .map((e) => ({
          id: e.state.id,
          kind: e.state.kind,
          x: e.state.x,
          y: e.state.y,
          hp: e.state.hp,
          maxHp: e.state.maxHp,
          stunned: isStunned(e.state),
      })),
      combo: {
        left: this.combo.left,
        right: this.combo.right,
        required: COMBO_REQUIRED,
      },
      // 기본 공격이 기본스킬로 바뀌어 있는지. 예전의 `콤보 발동 가능`을 대신한다.
      comboSkill: {
        left: this.isTransformed(this.left),
        right: this.right ? this.isTransformed(this.right) : false,
      },
      empower: {
        left: empowerMore(this.empower, 'left'),
        right: empowerMore(this.empower, 'right'),
      },
      exit: this.exitOpen ? { x: this.exit.x, y: this.exit.y } : null,
      drop: this.debugRewardDrop(),
      events: { ...this.ruleEvents },
      projectiles: this.projectiles.length,
      room: { width: this.bounds.maxX + WALL, height: this.bounds.maxY + WALL },
      pointer: { x: this.input.activePointer.worldX, y: this.input.activePointer.worldY },
      scroll: { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY },
    });
  }

  private movePlayer(dt: number): void {
    const dashing = this.time.now < this.dashUntil;
    const direction = dashing ? { x: Math.cos(this.dashAngle), y: Math.sin(this.dashAngle) } : this.moveDirection();
    this.player.setAlpha(dashing ? 0.55 : 1);
    if (!direction) return;

    const step = (dashing ? DASH_SPEED : MOVE_SPEED) * dt;
    this.player.x = Phaser.Math.Clamp(
      this.player.x + direction.x * step,
      this.bounds.minX + PLAYER_RADIUS,
      this.bounds.maxX - PLAYER_RADIUS,
    );
    this.player.y = Phaser.Math.Clamp(
      this.player.y + direction.y * step,
      this.bounds.minY + PLAYER_RADIUS,
      this.bounds.maxY - PLAYER_RADIUS,
    );
  }

  /** 비전 흐름 오라를 갱신한다. 남은 시간이 줄면 점점 옅어진다. */
  private updateArcaneAura(): void {
    const remaining = this.arcaneFlowUntil - this.time.now;
    const active = remaining > 0;
    this.arcaneAura.setVisible(active);
    if (!active) return;

    this.arcaneAura.setPosition(this.player.x, this.player.y);
    const ratio = remaining / (ARCANE_FLOW_DURATION * 1000);
    this.arcaneAura.setAlpha(0.1 + 0.2 * ratio);
    this.arcaneAura.setScale(1 + Math.sin(this.time.now / 140) * 0.06);
  }

  /**
   * 화면 밖에 있는 적과 출구를 화면 가장자리 화살표로 가리킨다.
   * 가까운 순으로 최대 8개까지만 표시해 화면이 지저분해지지 않게 한다.
   */
  private updateOffscreenMarks(): void {
    const camera = this.cameras.main;
    const view = camera.worldView;
    const margin = 34;

    const targets: { x: number; y: number; color: number }[] = this.enemies
      .filter((e) => isAlive(e.state) && !view.contains(e.state.x, e.state.y))
      .map((e) => ({ x: e.state.x, y: e.state.y, color: ENEMY_STATS[e.state.kind].color }))
      .sort(
        (a, b) =>
          Math.hypot(a.x - this.player.x, a.y - this.player.y) -
          Math.hypot(b.x - this.player.x, b.y - this.player.y),
      );

    if (this.exitOpen && !view.contains(this.exit.x, this.exit.y)) {
      targets.unshift({ x: this.exit.x, y: this.exit.y, color: COLORS.accent });
    }

    for (const [index, mark] of this.offscreenMarks.entries()) {
      const target = targets[index];
      mark.setVisible(target !== undefined);
      if (!target) continue;

      const angle = Math.atan2(target.y - view.centerY, target.x - view.centerX);
      // 화면 안쪽 여백을 따라 타원으로 배치한다.
      const px = VIEW_WIDTH / 2 - margin;
      const py = VIEW_HEIGHT / 2 - margin;
      mark.setPosition(
        screenX(VIEW_WIDTH / 2 + Math.cos(angle) * px),
        screenY(VIEW_HEIGHT / 2 + Math.sin(angle) * py),
      );
      mark.setRotation(angle + Math.PI / 2);
      mark.setFillStyle(target.color, 0.85);
    }
  }

  private updateComboRings(): void {
    for (const [side, runtime] of [['left', this.left], ['right', this.right]] as const) {
      const ring = this.comboRings[side];
      if (!runtime) {
        ring.setVisible(false);
        continue;
      }
      // 예전에는 `강화기술이 지금 나갈 수 있다`를 알렸는데, 기본스킬이 소켓으로
      // 옮겨가면서 그런 순간이 없어졌다(끼웠으면 늘 나간다). 지금은 연계가 걸어 준
      // **한시적 강화**를 알린다 — 짧게 스쳐 지나가서 배지 글자만으로는 놓치기 쉽다.
      const ready = empowerMore(this.empower, runtime.hand) > 0;
      ring.setVisible(ready);
      if (!ready) continue;

      ring.setPosition(this.player.x, this.player.y);
      // 회전하는 대신 맥동시켜 준비 상태를 눈에 띄게 한다.
      const pulse = 1 + Math.sin(this.time.now / 110) * 0.12;
      if (ring instanceof Phaser.GameObjects.Sprite) {
        // 스프라이트는 원본 크기가 제각각이라 배율이 아니라 표시 지름으로 잡는다.
        const size = this.comboRingSize[side] * pulse;
        ring.setDisplaySize(size, size);
      } else {
        ring.setScale(pulse);
      }
    }
  }

  private updateAim(): void {
    const angle = this.aimAngle();
    this.aimLine.setTo(this.player.x, this.player.y, this.player.x + Math.cos(angle) * 44, this.player.y + Math.sin(angle) * 44);
    // 스프라이트는 오른쪽을 보고 그려져 있다. 조준 방향이 왼쪽이면 뒤집어야 등을 보이지 않는다.
    if (this.player instanceof Phaser.GameObjects.Sprite) this.player.setFlipX(Math.cos(angle) < 0);
    this.updateWeaponViews(angle);
  }

  private updateEnemies(dt: number): void {
    const dashing = this.time.now < this.dashUntil;

    for (const entity of this.enemies) {
      const enemy = entity.state;
      if (!isAlive(enemy)) continue;

      tickStatuses(enemy, dt);
      enemy.sinceAttack += dt;

      // 기절한 적은 움직이지도 쏘지도 않는다.
      if (!isStunned(enemy)) {
        for (const event of advanceBossPattern(enemy, { x: this.player.x, y: this.player.y }, dt)) {
          this.handleBossEvent(entity, event);
        }

        const isBoss = isBossKind(enemy.kind);
        const direction = isBoss
          ? bossMoveDirection(enemy, { x: this.player.x, y: this.player.y })
          : desiredDirection(enemy, { x: this.player.x, y: this.player.y });
        if (direction) {
          const step = isBoss ? bossMoveSpeed(enemy) * dt : enemySpeed(enemy) * dt;
          const radius = ENEMY_STATS[enemy.kind].radius;
          const nextX = enemy.x + direction.x * step;
          const nextY = enemy.y + direction.y * step;
          const clampedX = Phaser.Math.Clamp(nextX, this.bounds.minX + radius, this.bounds.maxX - radius);
          const clampedY = Phaser.Math.Clamp(nextY, this.bounds.minY + radius, this.bounds.maxY - radius);
          const hitWall = clampedX !== nextX || clampedY !== nextY;

          enemy.x = clampedX;
          enemy.y = clampedY;
          if (isBoss && hitWall && staggerBossOnWall(enemy)) {
            this.showBossWallStagger(enemy);
          }
        }
        if (readyToFire(enemy)) this.enemyFire(enemy);
      }

      this.syncEnemyView(entity);

      enemy.sinceContact += dt;
      const stats = ENEMY_STATS[enemy.kind];
      const distance = Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y);

      if (!dashing && !isStunned(enemy) && distance <= stats.radius + PLAYER_RADIUS) {
        if (enemy.sinceContact >= stats.contactCooldown) {
          enemy.sinceContact = 0;
          const chargingBoss = isBossKind(enemy.kind) && enemy.boss?.phase === 'charging';
          this.hitPlayer(
            isBossKind(enemy.kind) ? bossContactDamage(enemy) : stats.contactDamage,
            chargingBoss
              ? {
                  x: enemy.boss?.chargeDirection.x ?? this.player.x - enemy.x,
                  y: enemy.boss?.chargeDirection.y ?? this.player.y - enemy.y,
                  distance: BOSS_CHARGE_PLAYER_KNOCKBACK,
                }
              : undefined,
          );
          if (this.run.phase === 'lost') {
            this.retryAfterDeath();
            return;
          }
        }
      }
    }
  }

  private handleBossEvent(entity: EnemyEntity, event: BossEvent): void {
    const enemy = entity.state;
    switch (event.kind) {
      case 'chargeTelegraph':
        playSfx('bossWarning');
        this.showBossChargeTelegraph(enemy, event.direction);
        break;
      case 'chargeStart':
        playSfx('bossCharge');
        ring(this, enemy.x, enemy.y, BOSS_PATTERN_COLOR, { from: 18, to: ENEMY_STATS[enemy.kind].radius * 1.8, duration: 260, width: 4 });
        floatingText(this, enemy.x, enemy.y - ENEMY_STATS[enemy.kind].radius - 18, '돌진', '#ffd166');
        break;
      case 'summon':
        playSfx('summon');
        this.summonBossAdds(enemy, event.count);
        break;
      case 'shockTelegraph':
        playSfx('bossWarning');
        this.showBossShockTelegraph(enemy, event.radius);
        break;
      case 'shockwave':
        playSfx('bossImpact');
        this.bossShockwave(enemy, event.radius, event.damage);
        break;
      case 'shardBurst':
        playSfx('bossImpact');
        this.bossShardBurst(enemy, event.count, event.damage, event.speed);
        break;
    }
  }

  private showBossChargeTelegraph(enemy: Enemy, direction: { x: number; y: number }): void {
    const length = 520;
    const line = this.add
      .line(0, 0, enemy.x, enemy.y, enemy.x + direction.x * length, enemy.y + direction.y * length, BOSS_PATTERN_COLOR, 0.75)
      .setOrigin(0, 0)
      .setLineWidth(5)
      .setDepth(4);
    floatingText(this, enemy.x, enemy.y - ENEMY_STATS[enemy.kind].radius - 18, '돌진 예고', '#ffd166');
    this.tweens.add({ targets: line, alpha: 0, duration: 740, ease: 'Quad.easeIn', onComplete: () => line.destroy() });
  }

  private showBossWallStagger(enemy: Enemy): void {
    const radius = ENEMY_STATS[enemy.kind].radius;
    impact(this, enemy.x, enemy.y);
    ring(this, enemy.x, enemy.y, STUN_COLOR, { from: radius * 0.7, to: radius * 2.6, duration: 420, width: 5 });
    flash(this, enemy.x, enemy.y, radius * 2.4, STUN_COLOR);
    floatingText(this, enemy.x, enemy.y - radius - 18, '벽 충돌', '#d8f3ff');
  }

  private summonBossAdds(enemy: Enemy, count: number): void {
    const bossRadius = ENEMY_STATS[enemy.kind].radius;
    ring(this, enemy.x, enemy.y, BOSS_PATTERN_COLOR, { from: 24, to: bossRadius * 2.4, duration: 360, width: 4 });
    floatingText(this, enemy.x, enemy.y - bossRadius - 18, '사냥개 소환', '#ffd166');

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const distance = bossRadius + 70;
      const radius = ENEMY_STATS.chaser.radius;
      const x = Phaser.Math.Clamp(enemy.x + Math.cos(angle) * distance, this.bounds.minX + radius, this.bounds.maxX - radius);
      const y = Phaser.Math.Clamp(enemy.y + Math.sin(angle) * distance, this.bounds.minY + radius, this.bounds.maxY - radius);
      this.enemies.push(this.createEnemyEntity('chaser', x, y));
    }
  }

  private showBossShockTelegraph(enemy: Enemy, radius: number): void {
    ring(this, enemy.x, enemy.y, BOSS_PATTERN_COLOR, { from: ENEMY_STATS[enemy.kind].radius, to: radius, duration: 820, width: 5 });
    floatingText(this, enemy.x, enemy.y - ENEMY_STATS[enemy.kind].radius - 18, '충격파 예고', '#d7c6ff');
  }

  private bossShockwave(enemy: Enemy, radius: number, damage: number): void {
    ring(this, enemy.x, enemy.y, ENEMY_STATS[enemy.kind].color, { from: 32, to: radius, duration: 360, width: 6 });
    flash(this, enemy.x, enemy.y, radius * 0.55, ENEMY_STATS[enemy.kind].color);
    floatingText(this, enemy.x, enemy.y - ENEMY_STATS[enemy.kind].radius - 18, '충격파', '#d7c6ff');

    if (Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y) <= radius + PLAYER_RADIUS) {
      this.hitPlayer(damage, {
        x: this.player.x - enemy.x,
        y: this.player.y - enemy.y,
        distance: BOSS_SHOCK_PLAYER_KNOCKBACK,
      });
      if (this.run.phase === 'lost') this.retryAfterDeath();
    }
  }

  private bossShardBurst(enemy: Enemy, count: number, damage: number, speed: number): void {
    ring(this, enemy.x, enemy.y, ENEMY_STATS[enemy.kind].color, { from: 22, to: ENEMY_STATS[enemy.kind].radius * 2.2, duration: 320, width: 4 });
    floatingText(this, enemy.x, enemy.y - ENEMY_STATS[enemy.kind].radius - 18, '파편 방출', '#d7c6ff');

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const [state] = spawnProjectiles(
        { damage, projectileCount: 1, projectileSpeed: speed },
        [],
        { x: enemy.x, y: enemy.y },
        angle,
      );
      this.enemyShots.push({
        state,
        view: this.createBoltView('bolt-enemy', state.x, state.y, 24, state.angle, ENEMY_STATS[enemy.kind].color),
        damage,
      });
    }
  }

  /** 원거리형 적이 플레이어를 향해 쏜다. 플레이어와 같은 투사체 엔진을 쓴다. */
  private enemyFire(enemy: Enemy): void {
    const stats = ENEMY_STATS[enemy.kind];
    markFired(enemy);

    const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
    const [state] = spawnProjectiles(
      { damage: stats.projectileDamage ?? 10, projectileCount: 1, projectileSpeed: stats.projectileSpeed ?? 280 },
      [],
      { x: enemy.x, y: enemy.y },
      angle,
    );

    this.enemyShots.push({
      state,
      view: this.createBoltView('bolt-enemy', state.x, state.y, 24, state.angle, stats.color),
      damage: stats.projectileDamage ?? 10,
    });
  }

  /** 적 투사체를 진행시키고 플레이어 피격을 판정한다. */
  private updateEnemyShots(dt: number): void {
    const dashing = this.time.now < this.dashUntil;

    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const shot = this.enemyShots[i];
      advance(shot.state, dt);

      const outOfBounds = isOutOfBounds(shot.state, this.bounds);
      const hitPlayer =
        !dashing && Math.hypot(shot.state.x - this.player.x, shot.state.y - this.player.y) <= PLAYER_RADIUS + 8;

      if (hitPlayer) {
        this.hitPlayer(shot.damage);
        if (this.run.phase === 'lost') {
          shot.view.destroy();
          this.enemyShots.splice(i, 1);
          this.retryAfterDeath();
          return;
        }
      }

      if (outOfBounds || hitPlayer) {
        shot.view.destroy();
        this.enemyShots.splice(i, 1);
      } else {
        shot.view.setPosition(shot.state.x, shot.state.y);
      }
    }
  }

  private hitPlayer(amount: number, knockback?: { x: number; y: number; distance: number }): void {
    const shieldActive = this.shieldProtectionActive();
    const damage = this.guardedPlayerDamage(amount);
    const before = this.run;
    this.run = applyPlayerDamage(this.run, damage, shieldActive);
    if (this.run === before) return;

    if (damage < amount) this.showShieldGuardFeedback(amount - damage);
    if (knockback) this.knockPlayer(knockback);
    playSfx('playerHit');
    this.flashPlayer();
    this.refreshHud();
  }

  private knockPlayer(knockback: { x: number; y: number; distance: number }): void {
    const length = Math.hypot(knockback.x, knockback.y);
    if (length <= 0) return;

    const nx = knockback.x / length;
    const ny = knockback.y / length;
    const x = Phaser.Math.Clamp(
      this.player.x + nx * knockback.distance,
      this.bounds.minX + PLAYER_RADIUS,
      this.bounds.maxX - PLAYER_RADIUS,
    );
    const y = Phaser.Math.Clamp(
      this.player.y + ny * knockback.distance,
      this.bounds.minY + PLAYER_RADIUS,
      this.bounds.maxY - PLAYER_RADIUS,
    );

    this.player.setPosition(x, y);
    ring(this, x, y, 0xffb4a2, { from: PLAYER_RADIUS + 4, to: PLAYER_RADIUS + 34, duration: 240, width: 3 });
  }

  private retryAfterDeath(): void {
    this.showDeathRetryFeedback();
    this.run = retryCurrentRoom(this.run);
    this.saveCurrentProgress();
    this.syncWeaponRuntimes();
    this.time.delayedCall(620, () => {
      this.enterRoom();
      this.showRespawnFeedback();
      if (DEBUG_ENABLED) this.publishDebug();
    });
  }

  private showDeathRetryFeedback(): void {
    ring(this, this.player.x, this.player.y, 0xff6b6b, { from: PLAYER_RADIUS, to: PLAYER_RADIUS + 62, duration: 360, width: 4 });
    flash(this, this.player.x, this.player.y, PLAYER_RADIUS * 3.2, 0xff6b6b);
    this.cameras.main.shake(180, 0.004);
    floatingText(this, this.player.x, this.player.y - PLAYER_RADIUS - 28, '의식이 끊어진다', '#ffb4a2', { duration: 1800 });

    const veil = this.add
      .rectangle(screenX(VIEW_WIDTH / 2), screenY(VIEW_HEIGHT / 2), VIEW_WIDTH, VIEW_HEIGHT, 0x05060a, 0)
      .setDepth(58)
      .setScrollFactor(0);
    this.tweens.add({
      targets: veil,
      alpha: 0.72,
      duration: 180,
      yoyo: true,
      hold: 210,
      ease: 'Quad.easeOut',
      onComplete: () => veil.destroy(),
    });
  }

  private showRespawnFeedback(): void {
    ring(this, this.player.x, this.player.y, COLORS.accent, { from: 10, to: 84, duration: 520, width: 4 });
    flash(this, this.player.x, this.player.y, PLAYER_RADIUS * 2.8, COLORS.accent);
    floatingText(this, this.player.x, this.player.y - PLAYER_RADIUS - 26, '구역 시작점에서 재도전', COLORS.accentText, { duration: 2200 });
  }

  private tryUsePotion(): void {
    const before = this.run;
    const after = usePotion(before);
    if (after === before) {
      const message = before.hp >= before.maxHp
        ? '이미 체력이 가득 차 있다'
        : `물약 충전 부족 ${Math.floor(before.potionCharge)} / ${POTION_USE_COST}`;
      floatingText(this, this.player.x, this.player.y - PLAYER_RADIUS - 28, message, COLORS.textDim, { duration: 1800 });
      return;
    }

    this.run = after;
    playSfx('reward');
    ring(this, this.player.x, this.player.y, 0xff5f6d, { from: PLAYER_RADIUS, to: PLAYER_RADIUS + 44, duration: 360, width: 4 });
    flash(this, this.player.x, this.player.y, PLAYER_RADIUS * 2.4, 0xff5f6d);
    floatingText(this, this.player.x, this.player.y - PLAYER_RADIUS - 26, '물약 사용', '#ffb4a2', { duration: 1800 });
    this.refreshHud();
    if (DEBUG_ENABLED) this.publishDebug();
  }

  private guardedPlayerDamage(amount: number): number {
    if (!this.shieldProtectionActive()) return amount;
    return amount * SHIELD_GUARD_DAMAGE_TAKEN;
  }

  private shieldProtectionActive(): boolean {
    return hasActiveShield(this.run) && this.time.now <= this.shieldGuardUntil;
  }

  private showShieldGuardFeedback(blocked: number): void {
    ring(this, this.player.x, this.player.y, 0x7dd3fc, { from: PLAYER_RADIUS + 6, to: PLAYER_RADIUS + 34, duration: 220, width: 4 });
    floatingText(this, this.player.x, this.player.y - PLAYER_RADIUS - 8, `방어 ${Math.ceil(blocked)}`, '#d8f3ff');
  }

  private syncEnemyView(entity: EnemyEntity): void {
    const enemy = entity.state;
    const radius = ENEMY_STATS[enemy.kind].radius;

    entity.view.setPosition(enemy.x, enemy.y);
    entity.view.setAlpha(isStunned(enemy) ? 0.5 : 1);
    // 스프라이트는 원본 색을 살려야 하므로, 상태에 따른 강조가 없을 때는 틴트를 걸지 않는다.
    const highlight = this.enemyHighlightColor(enemy);
    if (entity.view instanceof Phaser.GameObjects.Sprite) {
      if (highlight === null) entity.view.clearTint();
      else entity.view.setTint(highlight);
      // 스프라이트는 오른쪽을 보고 그려져 있다. 적은 플레이어를 쫓으므로 플레이어 쪽을 보게 뒤집는다.
      entity.view.setFlipX(this.player.x < enemy.x);
    } else {
      entity.view.setFillStyle(highlight ?? ENEMY_STATS[enemy.kind].color);
    }
    entity.hpBar.setPosition(enemy.x, enemy.y - radius - 9);

    for (const [index, kind] of STATUS_ORDER.entries()) {
      const dot = entity.statusDots[index];
      const status = findStatus(enemy, kind);
      dot.setVisible(Boolean(status));
      dot.setPosition(enemy.x + (index - 1.5) * 15, enemy.y - radius - 20);
      if (kind === 'wound') {
        const stackText = dot.getData('stackText') as Phaser.GameObjects.Text | undefined;
        stackText?.setText(status ? String(status.stacks) : '');
      }
    }
  }

  /** 보스 패턴 단계를 색으로 알린다. 강조할 것이 없으면 null이라 스프라이트가 원래 색을 유지한다. */
  private enemyHighlightColor(enemy: Enemy): number | null {
    if (enemy.boss?.phase === 'telegraph') return BOSS_PATTERN_COLOR;
    if (enemy.boss?.phase === 'charging') return 0xff6b3d;
    if (enemy.boss?.phase === 'staggered') return STUN_COLOR;
    return null;
  }

  private updateAreas(dt: number): void {
    // 이동 방해는 매 프레임 다시 계산한다.
    for (const entity of this.enemies) entity.state.hindered = false;

    for (let i = this.areas.length - 1; i >= 0; i--) {
      const { state, view, owner, behaviors } = this.areas[i];
      const result = tickArea(state, dt);
      let damagedSomething = false;

      for (const entity of this.enemies) {
        if (!isAlive(entity.state) || !containsPoint(state, entity.state)) continue;
        if (state.hinders && canApplyCrowdControl(entity.state, behaviors)) entity.state.hindered = true;
        if (result.ticked) {
          const damage = this.applyStatusDamageBonus(state.damagePerTick, entity.state, behaviors);
          this.damageEnemy(entity, damage * incomingDamageMultiplier(entity.state));
          damagedSomething = true;
        }
      }

      // 지대형 발동 스킬도 지속피해가 들어가는 동안은 콤보를 유지시킨다.
      if (damagedSomething && owner && this.usesCombo(owner)) {
        // 지속시간만 늘린다. `직전 손`과 교차 연속은 플레이어가 친 것만 움직인다.
        this.combo = refreshCombo(this.combo, resolveFor(this.run.loadout, owner.weapon.basic).stats);
      }

      view.setAlpha(0.15 + 0.35 * remainingRatio(state));
      if (result.expired) {
        view.destroy();
        this.areas.splice(i, 1);
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const alive = this.enemies.filter((e) => isAlive(e.state)).map((e) => e.state);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const entity = this.projectiles[i];
      const projectile = entity.state;
      advance(projectile, dt);

      let consumed = isOutOfBounds(projectile, this.bounds);

      if (!consumed) {
        const hit = this.enemies.find(
          (e) =>
            isAlive(e.state) &&
            Math.hypot(e.state.x - projectile.x, e.state.y - projectile.y) <= ENEMY_STATS[e.state.kind].radius,
        );

        if (hit) {
          const outcome = onHitTarget(projectile, hit.state, alive);
          const runtime = entity.weapon.id === this.left.weapon.id ? this.left : this.right ?? undefined;
          this.resolveHit(hit, outcome.damage, entity.weapon, entity.basic, runtime, entity.behaviors);

          for (const spawned of outcome.spawned) {
            this.projectiles.push({
              state: spawned,
              view: this.createBoltView(BOLT_SPRITE[entity.weapon.id], spawned.x, spawned.y, 22, spawned.angle, entity.weapon.color),
              weapon: entity.weapon,
              basic: entity.basic,
              behaviors: entity.behaviors,
            });
          }
          consumed = outcome.consumed;
        }
      }

      if (consumed) {
        entity.view.destroy();
        this.projectiles.splice(i, 1);
      } else {
        entity.view.setPosition(projectile.x, projectile.y);
      }
    }
  }

  private damageEnemy(entity: EnemyEntity, damage: number): void {
    const enemy = entity.state;
    if (!isAlive(enemy)) return;

    enemy.hp = Math.max(0, enemy.hp - damage);
    const radius = ENEMY_STATS[enemy.kind].radius;
    entity.hpBar.width = (radius * 2 * enemy.hp) / enemy.maxHp;

    if (enemy.hp <= 0) {
      playSfx(isBossKind(enemy.kind) ? 'bossDeath' : 'enemyDeath');
      if (isBossKind(enemy.kind) || this.isLastEnemy(entity)) this.spawnRewardDropsForEnemy(enemy);
      deathBurst(this, enemy.x, enemy.y, ENEMY_STATS[enemy.kind].color, radius * 2);
      entity.view.destroy();
      entity.hpBar.destroy();
      for (const dot of entity.statusDots) dot.destroy();
      this.run = addKill(this.run, isBossKind(enemy.kind));
      this.refreshHud();
    }
  }

  private isLastEnemy(entity: EnemyEntity): boolean {
    return !this.enemies.some((other) => other !== entity && isAlive(other.state));
  }

  private spawnRewardDropsForEnemy(enemy: Enemy): void {
    this.spawnRewardDrops(enemy.x, enemy.y, ENEMY_STATS[enemy.kind].radius);
  }

  private spawnRewardDrops(sourceX: number, sourceY: number, sourceRadius: number): boolean {
    if (this.rewardDrops.length > 0) return false;

    // 이 시점에는 아직 clearRoom이 보상을 적용하지 않았으므로 현재 보유와 비교할 수 있다.
    // 이미 가진 것을 다시 `획득`이라고 띄우면 두 번째 판에서 거짓말이 된다.
    const reward = newPartsOfReward(this.run.progress, this.resolveRoomRewardForDrop(ROOMS[this.run.roomIndex]?.reward));
    if (!reward) return false;

    const items = this.rewardItems(reward);
    if (!items.length) return false;

    const angleStep = (Math.PI * 2) / items.length;
    const startAngle = -Math.PI / 2;
    const placed: Array<{ x: number; y: number }> = [];

    for (const [index, item] of items.entries()) {
      const angle = startAngle + angleStep * index;
      const { x, y } = this.rewardDropPosition(sourceX, sourceY, angle, placed);
      placed.push({ x, y });
      const glow = this.add.circle(x, y, 28, item.color, 0.2).setDepth(8);
      const marker = this.textures.exists('drop-item')
        ? (() => {
            const sprite = this.add.sprite(x, y, 'drop-item').setDepth(9);
            sprite.setScale(40 / Math.max(sprite.width, sprite.height));
            sprite.setTint(item.color);
            return sprite;
          })()
        : this.add.rectangle(x, y, 28, 28, item.color, 0.95).setAngle(45).setDepth(9);
      const prompt = this.add
        .text(this.player.x - 74, this.player.y + PLAYER_RADIUS + 18, `가까이 가면 ${item.label} 획득`, {
          fontSize: '15px',
          color: COLORS.accentText,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5)
        .setDepth(22)
        .setVisible(false);

      const drop = {
        ...item,
        x,
        y,
        pickupEnabledAt: this.time.now + REWARD_PICKUP_DELAY_MS,
        collected: false,
        marker,
        glow,
        prompt,
      };
      this.rewardDrops.push(drop);
      this.roomFloor.push(glow, marker, prompt);
      this.tweens.add({
        targets: glow,
        alpha: 0.45,
        scale: 1.18,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    ring(this, sourceX, sourceY, BOSS_PATTERN_COLOR, { from: sourceRadius, to: Math.max(sourceRadius * 2.8, 86), duration: 620, width: 5 });
    return true;
  }

  private rewardDropPosition(
    sourceX: number,
    sourceY: number,
    baseAngle: number,
    placed: readonly { x: number; y: number }[],
  ): { x: number; y: number } {
    const candidates = [
      baseAngle,
      baseAngle + Math.PI,
      baseAngle + Math.PI / 2,
      baseAngle - Math.PI / 2,
      baseAngle + Math.PI / 4,
      baseAngle - Math.PI / 4,
      baseAngle + (Math.PI * 3) / 4,
      baseAngle - (Math.PI * 3) / 4,
    ].map((angle) => this.clampedRewardDropPosition(sourceX, sourceY, angle));

    return candidates.find((point) => (
      Math.hypot(point.x - sourceX, point.y - sourceY) >= REWARD_DROP_MIN_DISTANCE
      && placed.every((other) => Math.hypot(point.x - other.x, point.y - other.y) >= REWARD_DROP_MIN_SEPARATION)
    )) ?? candidates
      .map((point) => ({ point, distance: Math.hypot(point.x - sourceX, point.y - sourceY) }))
      .sort((a, b) => b.distance - a.distance)[0].point;
  }

  private clampedRewardDropPosition(sourceX: number, sourceY: number, angle: number): { x: number; y: number } {
    return {
      x: Phaser.Math.Clamp(sourceX + Math.cos(angle) * REWARD_DROP_SPREAD, this.bounds.minX + 60, this.bounds.maxX - 60),
      y: Phaser.Math.Clamp(sourceY + Math.sin(angle) * REWARD_DROP_SPREAD, this.bounds.minY + 60, this.bounds.maxY - 60),
    };
  }

  private rewardItems(reward: RoomReward): Array<Pick<RewardDrop, 'reward' | 'label' | 'kind' | 'color' | 'iconKey'>> {
    return [
      ...(reward.weapons ?? []).map((id) => {
        const weapon = weaponOf(id);
        return { reward: { weapons: [id] }, label: weapon.name, kind: 'weapon' as const, color: weapon.color, iconKey: WEAPON_SPRITE[id] };
      }),
      // **기본스킬 드랍은 빈 껍데기가 아니다.** 예전에는 연출만 하려고 `reward: {}`인
      // 오브젝트를 무기에서 만들어 냈는데, 주워도 보유 상태가 안 늘어 화면이 거짓말을
      // 하고 있었다. 이제 방 보상에 실제로 적힌 것을 그대로 떨어뜨린다.
      ...(reward.basicSkills ?? []).flatMap((id) => {
        const owner = WEAPON_IDS.map(weaponOf)
          .map((weapon) => ({ weapon, skill: basicSkillsOf(weapon).find((candidate) => candidate.id === id) }))
          .find((entry): entry is { weapon: Weapon; skill: Skill } => entry.skill !== undefined);
        return owner
          ? [{
              reward: { basicSkills: [id] },
              label: owner.skill.name,
              kind: 'comboSkill' as const,
              color: owner.weapon.color,
              iconKey: WEAPON_SPRITE[owner.weapon.id],
            }]
          : [];
      }),
      ...(reward.supports ?? []).flatMap((id) => {
        const support = findSupport(id);
        const kind = support ? supportSlotType(support) : 'primary';
        return support
          ? [{
              reward: { supports: [id] },
              label: `${kind === 'synergy' ? '연계' : '보조'}: ${support.name}`,
              kind: kind === 'synergy' ? 'synergy' as const : 'support' as const,
              color: COLORS.accent,
            }]
          : [];
      }),
      // 열쇠는 봉인된 문을 여는 열쇠라는 것이 바닥에서부터 읽혀야 한다.
      ...(reward.keys ?? []).flatMap((id) => {
        const key = findKey(id);
        return key
          ? [{
              reward: { keys: [id] },
              label: key.name,
              kind: 'key' as const,
              color: key.color,
              iconKey: KEY_SPRITE[id],
            }]
          : [];
      }),
    ];
  }

  private resolveRoomRewardForDrop(reward: RoomReward | undefined): RoomReward | undefined {
    if (!reward) return undefined;
    const randomSupports = this.randomSupportRewards(reward);
    if (!randomSupports.length) return reward;

    return {
      ...reward,
      supports: [...(reward.supports ?? []), ...randomSupports],
      randomSupports: undefined,
    };
  }

  /**
   * 이 방이 뽑아 줄 보조형스킬.
   *
   * `forWeapon`이 적혀 있으면 **그 무기에 실제로 붙는 것만** 뽑는다. 특정 보스가
   * 특정 무기를 키워 주는 자리라는 것을 드랍으로 말하기 위한 것이다. 태그로 거르므로
   * `검 전용`이라는 표시를 데이터에 따로 둘 필요가 없다.
   *
   * 후보가 없으면 조용히 건너뛴다. **거르다 아무것도 안 나오면 아무것도 안 주는 것이
   * 맞다** — 태그가 안 맞는 것을 억지로 끼워 주면 그 칸은 어차피 죽는다.
   */
  private randomSupportRewards(reward: RoomReward): string[] {
    const rule = reward.randomSupports;
    if (!rule) return [];

    const weapon = rule.forWeapon ? weaponOf(rule.forWeapon) : null;
    const target = rule.forSkillId ? this.skillById(rule.forSkillId) : weapon?.basic ?? null;

    const selected: string[] = [];
    const take = (slot: 'primary' | 'synergy', count = 0): void => {
      for (let i = 0; i < count; i++) {
        const candidates = SUPPORTS.filter((support) => (
          supportSlotType(support) === slot
          && !this.run.progress.ownedSupports.includes(support.id)
          && !selected.includes(support.id)
          && (target === null || canAttach(target, support, []).ok)
        ));
        if (!candidates.length) return;
        selected.push(Phaser.Utils.Array.GetRandom(candidates).id);
      }
    };

    take('primary', rule.primary);
    take('synergy', rule.synergy);
    return selected;
  }

  private skillById(id: string): Skill | null {
    for (const weapon of WEAPON_LIST) {
      const skill = [weapon.basic, ...basicSkillsOf(weapon)].find((candidate) => candidate.id === id);
      if (skill) return skill;
    }
    return null;
  }

  private updateRewardDropPrompt(): void {
    let closest: { drop: RewardDrop; distance: number } | null = null;
    for (const drop of this.rewardDrops) {
      if (drop.collected) continue;
      drop.prompt.setVisible(false);
      const pickupEnabled = this.time.now >= drop.pickupEnabledAt;
      if (!pickupEnabled) continue;

      const distance = Math.hypot(this.player.x - drop.x, this.player.y - drop.y);
      if (distance <= REWARD_PICKUP_RADIUS) {
        this.collectRewardDrop(drop);
        continue;
      }
      if (distance <= REWARD_HINT_RADIUS && (!closest || distance < closest.distance)) {
        closest = { drop, distance };
      }
    }

    if (closest) {
      closest.drop.prompt.setVisible(true);
      closest.drop.prompt.setPosition(this.player.x - 74, this.player.y + PLAYER_RADIUS + 18);
    }
  }

  private collectRewardDrop(drop: RewardDrop): void {
    if (drop.collected || this.run.phase !== 'combat') return;

    drop.collected = true;
    this.run = collectRoomReward(this.run, drop.reward);
    this.saveCurrentProgress();
    playSfx('reward');
    ring(this, drop.x, drop.y, drop.color, { from: 18, to: 86, duration: 420, width: 4 });
    this.showRewardPickupBadge(drop);

    drop.marker.destroy();
    drop.glow.destroy();
    drop.prompt.destroy();
    this.rewardDrops = this.rewardDrops.filter((item) => item !== drop);
    this.refreshHud();
    if (DEBUG_ENABLED) this.publishDebug();
  }

  private showRewardPickupBadge(drop: RewardDrop): void {
    const badge = this.add.container(drop.x, drop.y - 8).setDepth(26);
    const back = this.add.circle(0, 0, 24, 0x10141f, 0.92).setStrokeStyle(3, drop.color, 0.95);
    const halo = this.add.circle(0, 0, 31, drop.color, 0.2);
    badge.add([halo, back]);

    if (drop.iconKey && this.textures.exists(drop.iconKey)) {
      const icon = this.add.sprite(0, 0, drop.iconKey);
      icon.setScale(30 / Math.max(icon.width, icon.height));
      icon.setTint(drop.kind === 'comboSkill' ? drop.color : 0xffffff);
      badge.add(icon);
      if (drop.kind === 'comboSkill') {
        badge.add(this.add.star(15, -14, 5, 3, 7, COLORS.accent, 0.95));
      }
    } else if (drop.kind === 'synergy') {
      badge.add(this.rewardSynergyIcon(drop.color));
    } else {
      badge.add(this.rewardSupportIcon(drop.color));
    }

    badge.setScale(0.7);
    this.tweens.add({
      targets: badge,
      y: drop.y - 70,
      scale: 1.08,
      duration: 520,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: badge,
      alpha: 0,
      delay: 780,
      duration: 340,
      ease: 'Quad.easeIn',
      onComplete: () => badge.destroy(),
    });
  }

  private rewardSupportIcon(color: number): Phaser.GameObjects.GameObject {
    const icon = this.add.container(0, 0);
    icon.add([
      this.add.rectangle(0, 0, 11, 30, color, 0.95),
      this.add.rectangle(0, 0, 30, 11, color, 0.95),
      this.add.circle(0, 0, 6, 0xffffff, 0.75),
    ]);
    return icon;
  }

  private rewardSynergyIcon(color: number): Phaser.GameObjects.GameObject {
    const icon = this.add.container(0, 0);
    const link = this.add.rectangle(0, 0, 30, 6, color, 0.85).setAngle(-24);
    icon.add([
      link,
      this.add.circle(-12, 7, 9, color, 0.95),
      this.add.circle(12, -7, 9, color, 0.95),
      this.add.circle(-12, 7, 4, 0xffffff, 0.75),
      this.add.circle(12, -7, 4, 0xffffff, 0.75),
    ]);
    return icon;
  }

  private debugRewardDrop(): { x: number; y: number } | null {
    const drop = this.rewardDrops.find((item) => !item.collected);
    return drop ? { x: drop.x, y: drop.y } : null;
  }

  private updateTownNpcPrompt(): void {
    const npc = this.townNpc;
    if (!npc) return;
    const near = Math.hypot(this.player.x - npc.x, this.player.y - npc.y) <= TOWN_NPC_RADIUS;
    npc.prompt.setVisible(near && !this.overlay);
    // 가까워지면 강조한다. 스프라이트는 평소에 원래 색을 유지해야 하므로 틴트를 걷어낸다.
    if (npc.body instanceof Phaser.GameObjects.Sprite) {
      npc.body.setFlipX(this.player.x < npc.x);
      if (near) npc.body.setTint(COLORS.accent);
      else npc.body.clearTint();
    } else {
      npc.body.setFillStyle(near ? COLORS.accent : 0x8ea4ff, 0.95);
    }
    if (near) npc.prompt.setPosition(this.player.x - 64, this.player.y + PLAYER_RADIUS + 18);
  }

  private tryTalkTownNpc(): void {
    const npc = this.townNpc;
    if (!npc || this.run.phase !== 'town' || this.overlay) return;
    if (Math.hypot(this.player.x - npc.x, this.player.y - npc.y) > TOWN_NPC_RADIUS) return;
    this.showTownDialogue();
  }

  private clearTransientOverlays(): void {
    for (const object of this.transientOverlays) {
      if (object.active) object.destroy();
    }
    this.transientOverlays = [];
  }

  private flashPlayer(): void {
    tintView(this.player, 0xff6b6b);
    this.time.delayedCall(110, () => {
      if (this.player instanceof Phaser.GameObjects.Sprite) this.player.clearTint();
      else this.player.setFillStyle(COLORS.player);
    });
  }

  // ───────────────────────── HUD와 오버레이

  /**
   * 판 없이 바닥 위에 얹는 글자.
   *
   * **테두리는 두르지 않는다.** 획이 서로 먹어 글자가 뭉쳐 보인다. 대신 옅은 그림자만
   * 깔아 밝은 타일 위에서 묻히지 않게 한다.
   */
  private hudText(x: number, y: number, fontSize: string, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, '', { fontSize, color, fontStyle: 'bold' })
      .setShadow(1, 1, '#05060a', 4, false, true)
      .setOrigin(0, 0.5)
      .setDepth(20);
  }

  private buildHud(): void {
    const barBack = this.add
      .rectangle(screenX(HUD_X), screenY(HUD_HP_Y), HUD_BAR_W, 14, 0x161b28, 0.92)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x05060a, 0.9)
      .setDepth(18);
    this.hpBarFill = this.add
      .rectangle(screenX(HUD_X), screenY(HUD_HP_Y), HUD_BAR_W, 14, 0x6ee7a8)
      .setOrigin(0, 0.5)
      .setDepth(19);
    this.hpText = this.hudText(screenX(HUD_LABEL_X), screenY(HUD_HP_Y), '12px', COLORS.text);
    this.shieldBarBack = this.add
      .rectangle(screenX(HUD_X), screenY(HUD_SHIELD_Y), HUD_BAR_W, 10, 0x161b28, 0.92)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x05060a, 0.9)
      .setDepth(18);
    this.shieldBarFill = this.add
      .rectangle(screenX(HUD_X), screenY(HUD_SHIELD_Y), HUD_BAR_W, 10, 0x7dd3fc)
      .setOrigin(0, 0.5)
      .setDepth(19);
    this.shieldText = this.hudText(screenX(HUD_LABEL_X), screenY(HUD_SHIELD_Y), '11px', '#d8f3ff');
    // **전투 수치는 물약 줄의 오른쪽 끝에 붙인다.** 방 이름과 한 줄에 두면 둘 다
    // 100 남짓이라 가운데에서 서로 닿아 한 덩어리로 읽혔다. 물약 줄은 오른쪽이 비어 있다.
    this.statsText = this.hudText(screenX(HUD_X + HUD_W), screenY(HUD_POTION_Y), '12px', COLORS.textDim)
      .setOrigin(1, 0.5);
    this.roomText = this.hudText(screenX(HUD_X), screenY(HUD_ROOM_Y), '12px', COLORS.text);
    this.handsText = this.hudText(screenX(HUD_X), screenY(HUD_HANDS_Y), '12px', COLORS.textDim);
    // **출구 안내는 왼쪽 구석에서 꺼낸다.** 방을 정리한 순간에만 뜨는 알림이라
    // 상태 표시 틈에 끼워 두면 놓친다. 콤보 배지 위, 화면 한가운데에 띄운다.
    this.hudNotice = this.hudText(screenX(VIEW_WIDTH / 2), screenY(VIEW_HEIGHT - 146), '15px', COLORS.accentText)
      .setOrigin(0.5, 0.5);
    this.statusLegend = this.createStatusLegend(screenX(VIEW_WIDTH - 560), screenY(82));
    // **액체가 병보다 뒤에 있어야 한다.** 병 그림은 안쪽이 뚫린 테두리라, 뒤에 깔면
    // 유리 안에 담긴 것처럼 보이고 테두리와 코르크가 그대로 살아난다. 위에 덮으면
    // 아트를 쓰고도 아트가 안 보인다.
    this.potionLiquid = this.add.graphics().setDepth(20);
    this.potionBottleFrame = this.textures.exists('potion')
      ? this.add
          .sprite(screenX(POTION_ICON_X), screenY(HUD_POTION_Y), 'potion')
          .setDisplaySize(POTION_ICON_W, POTION_ICON_H)
          .setDepth(21)
      : this.add
          .rectangle(screenX(POTION_ICON_X), screenY(HUD_POTION_Y), POTION_ICON_W, POTION_ICON_H, 0x10141f, 0.82)
          .setStrokeStyle(2, 0x8ea4ff, 0.95)
          .setDepth(21);
    this.potionText = this.hudText(screenX(POTION_ICON_X + 16), screenY(HUD_POTION_Y), '11px', COLORS.textDim);
    this.comboBadges = {
      left: this.createComboBadge(screenX(VIEW_WIDTH / 2 - 163), screenY(VIEW_HEIGHT - 66), '왼손'),
      right: this.createComboBadge(screenX(VIEW_WIDTH / 2 + 163), screenY(VIEW_HEIGHT - 66), '오른손'),
    };

    const hint = this.add
      .text(
        screenX(VIEW_WIDTH - 24),
        screenY(20),
        'WASD 이동 · 좌클릭 왼손 · 우클릭/Shift 오른손 · Space 대시 · Q 물약 · R 무기 · I 인벤토리 · M 지도 · B 마을 · P 메뉴',
        {
          fontSize: '12px',
          color: COLORS.textDim,
          align: 'right',
        },
      )
      .setOrigin(1, 0)
      .setDepth(20);

    // 카메라가 방을 따라 움직여도 HUD는 화면에 붙어 있어야 한다.
    pinToScreen(
      barBack,
      this.hpText,
      this.hpBarFill,
      this.shieldText,
      this.shieldBarBack,
      this.shieldBarFill,
      this.roomText,
      this.statsText,
      this.handsText,
      this.hudNotice,
      this.statusLegend,
      this.potionBottleFrame,
      this.potionLiquid,
      this.potionText,
      hint,
      ...this.comboBadgeObjects(this.comboBadges.left),
      ...this.comboBadgeObjects(this.comboBadges.right),
    );

    // 방이 화면보다 크므로 밖에 있는 대상을 가리키는 표시가 필요하다.
    // 없으면 남은 적을 찾아 헤매게 된다.
    this.offscreenMarks = Array.from({ length: 8 }, () =>
      this.add.triangle(0, 0, 0, -10, 8, 8, -8, 8, COLORS.accent, 0.8).setDepth(21).setScrollFactor(0).setVisible(false),
    );

    this.buildMinimap();
  }

  private createComboBadge(x: number, y: number, hand: string): ComboBadge {
    const back = this.add
      .rectangle(x, y, 310, 108, 0x0a0b0f, 0.78)
      .setStrokeStyle(1, 0x2a2f42)
      .setDepth(20);
    const title = this.add
      .text(x - 140, y - 42, hand, { fontSize: '13px', color: COLORS.text, fontStyle: 'bold' })
      .setOrigin(0, 0.5)
      .setDepth(21);
    const condition = this.add
      .text(x - 140, y - 21, '', { fontSize: '11px', color: COLORS.textDim, fontStyle: 'bold' })
      .setOrigin(0, 0.5)
      .setDepth(21);
    const value = this.add
      .text(x + 140, y - 3, '', { fontSize: '20px', color: COLORS.text, fontStyle: 'bold' })
      .setOrigin(1, 0.5)
      .setDepth(21);
    const effect = this.add
      .text(x - 140, y + 15, '', { fontSize: '10px', color: COLORS.textDim, lineSpacing: 2 })
      .setOrigin(0, 0)
      .setDepth(21);
    const timer = this.add.rectangle(x - 140, y + 50, 280, 3, COLORS.accent, 0.7).setOrigin(0, 0.5).setDepth(21);
    // 연계마다 요구치가 다르므로 최대치만큼 준비하고 필요한 눈금만 보여준다.
    const pips = Array.from({ length: COMBO_MAX }, (_, index) =>
      this.add.rectangle(x - 140 + index * 18, y - 3, 14, 14, 0x2a2f42, 0.9).setOrigin(0, 0.5).setDepth(21),
    );

    return { back, title, condition, value, effect, timer, pips };
  }

  private createStatusLegend(x: number, y: number): Phaser.GameObjects.Container {
    const container = this.add.container(x, y).setDepth(20);
    const entries: Array<{ status: StatusKind; label: string }> = [
      { status: 'wound', label: '상처' },
      { status: 'exposed', label: '약점' },
      { status: 'brand', label: '낙인' },
      { status: 'fracture', label: '균열' },
    ];

    container.add(
      this.add
        .text(0, 0, 'H 적 상태', { fontSize: '12px', color: COLORS.textDim, fontStyle: 'bold' })
        .setOrigin(0, 0.5),
    );
    let cursor = 68;
    for (const entry of entries) {
      const dot = this.add.circle(cursor, 0, 5, STATUS_COLORS[entry.status], 0.95).setStrokeStyle(1, 0x10131d, 0.9);
      const label = this.add
        .text(cursor + 9, 0, entry.label, {
          fontSize: '12px',
          color: COLORS.textDim,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);
      container.add([dot, label]);
      cursor += label.width + 26;
    }

    return container;
  }

  private comboBadgeObjects(
    badge: ComboBadge,
  ): (Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Visible)[] {
    return [badge.back, badge.title, badge.condition, badge.value, badge.effect, badge.timer, ...badge.pips];
  }

  /**
   * 미니맵.
   *
   * 가장자리 화살표는 방향만 알려줄 뿐 거리를 알려주지 않는다.
   * 방이 화면의 두 배가 넘으므로, 남은 적이 몇 걸음 거리인지 보이지 않으면
   * 넓은 곳을 가로지르는 판단을 할 수 없다.
   */
  private buildMinimap(): void {
    // 테두리는 방의 벽이다. 방 비율에 맞춰야 지금 어느 쪽 벽에 붙어 있는지 읽힌다.
    const frame = this.add
      .rectangle(0, 0, MINIMAP_MAX, MINIMAP_MAX, 0x0a0b0f, 0.55)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x2a2f42)
      .setDepth(19)
      .setScrollFactor(0);

    this.minimap = {
      frame,
      player: this.add.circle(0, 0, 3, COLORS.player).setDepth(21).setScrollFactor(0),
      exit: this.add.rectangle(0, 0, 6, 6, COLORS.accent).setDepth(21).setScrollFactor(0).setVisible(false),
      // 방마다 최대 적 수보다 넉넉하게 잡아둔다. 매 프레임 만들고 지우지 않는다.
      enemies: Array.from({ length: 40 }, () =>
        this.add.circle(0, 0, 2.5, 0xff6b6b).setDepth(20).setScrollFactor(0).setVisible(false),
      ),
    };
  }

  /** 미니맵이 그려지는 사각형. 방 비율을 유지한 채 우상단에 붙인다. */
  private minimapRect(): { left: number; top: number; width: number; height: number } {
    const room = this.minimapRoom;
    const width = room.width * room.scale;
    const height = room.height * room.scale;
    return { left: screenX(VIEW_WIDTH - 24) - width, top: screenY(46), width, height };
  }

  /** 방 좌표를 미니맵 안의 화면 좌표로 옮긴다. */
  private minimapPoint(x: number, y: number): { x: number; y: number } {
    const rect = this.minimapRect();
    return { x: rect.left + x * this.minimapRoom.scale, y: rect.top + y * this.minimapRoom.scale };
  }

  private updateMinimap(): void {
    const rect = this.minimapRect();
    this.minimap.frame.setPosition(rect.left, rect.top).setSize(rect.width, rect.height);

    const player = this.minimapPoint(this.player.x, this.player.y);
    this.minimap.player.setPosition(player.x, player.y);

    const alive = this.enemies.filter((e) => isAlive(e.state));
    for (const [index, dot] of this.minimap.enemies.entries()) {
      const enemy = alive[index];
      if (!enemy) {
        dot.setVisible(false);
        continue;
      }
      const point = this.minimapPoint(enemy.state.x, enemy.state.y);
      dot.setPosition(point.x, point.y).setVisible(true);
      // 보스는 크게 찍어 구분한다.
      dot.setRadius(isBossKind(enemy.state.kind) ? 5 : 2.5);
    }

    if (this.exitOpen) {
      const point = this.minimapPoint(this.exit.x, this.exit.y);
      this.minimap.exit.setPosition(point.x, point.y).setVisible(true);
    } else {
      this.minimap.exit.setVisible(false);
    }
  }

  private refreshHud(): void {
    const wave = ROOMS[this.run.roomIndex];
    const remaining = this.enemies.filter((e) => isAlive(e.state)).length;
    const inTown = this.run.phase === 'town';
    const shieldVisible = hasActiveShield(this.run);
    const shieldActive = this.shieldProtectionActive();
    this.hpText.setText(`체력 ${Math.ceil(this.run.hp)} / ${this.run.maxHp}`);
    this.hpBarFill.width = (HUD_BAR_W * this.run.hp) / this.run.maxHp;
    this.shieldText
      .setText(`보호막 ${Math.ceil(this.run.shieldEnergy)} / ${SHIELD_ENERGY_MAX}`)
      .setVisible(shieldVisible)
      .setAlpha(shieldActive ? 1 : 0.6);
    this.shieldBarBack.setVisible(shieldVisible).setAlpha(shieldActive ? 0.95 : 0.35);
    this.shieldBarFill.width = (HUD_BAR_W * this.run.shieldEnergy) / SHIELD_ENERGY_MAX;
    this.shieldBarFill.setVisible(shieldVisible).setAlpha(shieldActive ? 1 : 0.45);

    // 보호막 줄이 없으면 그 자리를 비워 두지 않고 아래를 끌어올린다.
    this.hudRowShift = shieldVisible ? 0 : HUD_ROW_GAP;
    this.statsText.y = screenY(HUD_POTION_Y - this.hudRowShift);
    this.roomText.y = screenY(HUD_ROOM_Y - this.hudRowShift);
    this.handsText.y = screenY(HUD_HANDS_Y - this.hudRowShift);

    const hands = describeByHand(this.run.loadout);
    this.roomText.setText(inTown ? '마을 · F 관리인 대화' : `${wave?.label ?? '-'}  ${this.run.roomIndex + 1}/${TOTAL_ROOMS}`);
    this.statsText.setText(inTown ? '→ 오른쪽 출구' : `적 ${remaining}  ·  처치 ${this.run.kills}`);
    this.handsText.setText(hands.map((hand) => `${hand.hand} ${hand.weapon}`).join('  ·  '));
    this.hudNotice
      .setText(this.exitOpen && !inTown ? '방 정리 완료 · 출구로 이동 →' : '')
      .setVisible(this.exitOpen && !inTown);
    this.updateStatusLegend();
    this.updatePotionHud();
    this.updateComboText();
  }

  private updateStatusLegend(): void {
    const rect = this.minimapRect();
    this.statusLegend.setPosition(rect.left - 264, rect.top + 12);
  }

  private updatePotionHud(): void {
    const fillRatio = Phaser.Math.Clamp(this.run.potionCharge / POTION_MAX_CHARGE, 0, 1);
    // 아이콘 중심. 병과 액체가 같은 기준점을 써야 액체가 유리 안에 머문다.
    const x = screenX(POTION_ICON_X);
    const centerY = screenY(HUD_POTION_Y - this.hudRowShift);

    this.potionBottleFrame.setPosition(x, centerY);
    this.drawPotionLiquid(x, centerY, fillRatio);
    this.potionText
      .setPosition(x + POTION_ICON_W / 2 + 9, centerY)
      .setText(`Q  ${Math.floor(this.run.potionCharge)} / ${POTION_MAX_CHARGE}`);
  }

  /**
   * 병 안쪽의 가로 폭을 **스프라이트에서 직접 읽는다.**
   *
   * 병은 위아래로 좁아지므로 폭이 고정된 사각형으로 채우면 목과 바닥에서 유리 밖으로
   * 삐져나온다. 실제로 100%와 10% 구간에서 넘쳤다. 손으로 병 윤곽을 따라 좌표를 적는
   * 방법도 있지만, 그러면 아트를 다시 뽑을 때마다 다시 맞춰야 한다.
   *
   * 그림에서 재면 아트가 바뀌어도 저절로 따라간다. 한 번 재고 캐시한다.
   */
  private potionBodySpans(): readonly { y: number; half: number }[] {
    if (this.potionSpanCache) return this.potionSpanCache;

    const spans: { y: number; half: number }[] = [];
    const texture = this.textures.get('potion');
    const source = texture?.getSourceImage() as HTMLImageElement | HTMLCanvasElement | undefined;
    if (source) {
      const canvas = this.textures.createCanvas(`potion-probe-${Date.now()}`, source.width, source.height);
      if (canvas) {
        canvas.draw(0, 0, source);
        for (let row = 0; row < source.height; row++) {
          let left = -1;
          let right = -1;
          for (let col = 0; col < source.width; col++) {
            if (canvas.getPixel(col, row).alpha > 120) {
              if (left < 0) left = col;
              right = col;
            }
          }
          if (left < 0) continue;
          const width = right - left;
          // 코르크와 목은 액체가 차지 않는다. 몸통으로 볼 만큼 넓은 행만 남긴다.
          if (width < source.width * 0.55) continue;
          spans.push({
            y: (row / source.height - 0.5) * POTION_ICON_H,
            half: (width / 2 / source.width) * POTION_ICON_W,
          });
        }
        canvas.destroy();
      }
    }
    this.potionSpanCache = spans;
    return spans;
  }

  /**
   * 병 안에 찬 액체.
   *
   * 병 그림의 안쪽이 뚫려 있어 **뒤에 깔기만 하면** 유리 안에 담긴 것처럼 보인다.
   * 위에 덮으면 아트를 쓰고도 테두리와 코르크가 가려진다.
   */
  private drawPotionLiquid(x: number, y: number, fillRatio: number): void {
    this.potionLiquid.clear().setPosition(0, 0);
    if (fillRatio <= 0) return;

    const spans = this.potionBodySpans();
    if (!spans.length) {
      // 스프라이트가 없는 환경. 폴백 사각형에 맞춰 단순하게 채운다.
      const half = (POTION_ICON_W * 0.72) / 2;
      const bottom = y + POTION_ICON_H / 2;
      const height = POTION_ICON_H * fillRatio;
      this.potionLiquid.fillStyle(POTION_LIQUID_COLOR, 0.92).fillRect(x - half, bottom - height, half * 2, height);
      return;
    }

    const top = spans[0].y;
    const bottom = spans[spans.length - 1].y;
    const surface = bottom - (bottom - top) * fillRatio;

    this.potionLiquid.fillStyle(POTION_LIQUID_COLOR, 0.92);
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      if (span.y < surface) continue;
      const next = spans[i + 1]?.y ?? span.y + 1;
      this.potionLiquid.fillRect(x - span.half, y + span.y, span.half * 2, next - span.y + 0.5);
    }
    if (fillRatio < 1) {
      const at = spans.find((span) => span.y >= surface) ?? spans[spans.length - 1];
      this.potionLiquid
        .lineStyle(1, 0xff7180, 0.95)
        .lineBetween(x - at.half, y + surface, x + at.half, y + surface);
    }
  }

  private updateComboText(): void {
    this.updateComboBadge(this.comboBadges.left, this.left);
    this.updateComboBadge(this.comboBadges.right, this.right);
  }

  private updateComboBadge(badge: ComboBadge, runtime: WeaponRuntime | null): void {
    // 콤보를 쓰지 않는 무기는 배지 자체를 숨긴다. 콤보를 읽는 연계를 안 붙였으면
    // 수치가 돌지 않으므로 0으로 굳은 눈금을 보여줄 이유가 없다.
    const rules = runtime ? this.comboRulesFor(runtime) : [];
    const visible = runtime !== null && rules.length > 0;
    for (const object of this.comboBadgeObjects(badge)) object.setVisible(visible);
    if (!runtime || !visible) return;

    const hand = runtime.hand;
    // 연계는 무기당 한 칸이므로 규칙도 하나다. 여러 개면 첫 번째를 보여준다.
    const rule = rules[0];
    const readout = comboReadout(this.combo, hand, rule.trigger);
    const targetHand = rule.effect.hand === 'self' ? hand : otherHand(hand);
    const targetRuntime = targetHand === 'left' ? this.left : this.right;
    const targetName = `${targetHand === 'left' ? '왼손' : '오른손'}${targetRuntime ? ` ${targetRuntime.weapon.name}` : ''}`;
    const more = empowerMore(this.empower, targetHand);
    const activeEmpower = this.empower[targetHand];

    // 지금 무슨 일이 일어나고 있는지를 한 단어로 알린다.
    // 강화가 수치보다 앞이다. 배율이 붙은 순간이 더 짧고 놓치기 쉽다.
    const [label, color] = more > 0
      ? ['강화 중', COLORS.accent]
      : [`${readout.value} / ${readout.required}`, runtime.weapon.color];
    const lit = more > 0;

    badge.back.setStrokeStyle(lit ? 2 : 1, color, lit ? 0.95 : 0.55);
    badge.title.setText(`${hand === 'left' ? '왼손' : '오른손'} ${runtime.weapon.name}  ·  ${rule.support.name}`);

    const otherRuntime = hand === 'left' ? this.right : this.left;
    const progressName =
      rule.trigger.reads === 'self'
        ? `${runtime.weapon.name} 콤보`
        : rule.trigger.reads === 'total'
          ? '양손 콤보 합계'
          : `${otherRuntime?.weapon.name ?? '반대손'} 콤보`;
    badge.condition.setText(progressName);

    const consumeName =
      rule.effect.consumes === 'total'
        ? '양손 콤보 소모'
        : rule.effect.consumes === 'self'
          ? `${runtime.weapon.name} 콤보 소모`
          : rule.effect.consumes === 'other'
            ? `${otherRuntime?.weapon.name ?? '반대손'} 콤보 소모`
            : null;
    const limit = [rule.effect.hits ? `${rule.effect.hits}회` : '', rule.effect.seconds ? `${rule.effect.seconds}초` : '']
      .filter(Boolean)
      .join('/');
    const remaining = activeEmpower
      ? [
          activeEmpower.hitsLeft !== undefined ? `${activeEmpower.hitsLeft}회` : '',
          activeEmpower.secondsLeft !== undefined ? `${activeEmpower.secondsLeft.toFixed(1)}초` : '',
        ].filter(Boolean).join(' / ')
      : '';
    const effectText = lit && activeEmpower
      ? `${targetName} 피해 +${Math.round(more * 100)}%\n${remaining ? `${remaining} 남음` : '조건 유지 중'}`
      : consumeName
        ? `${readout.required} 도달 · ${consumeName}\n${targetName} 피해 +${Math.round(rule.effect.more * 100)}%${limit ? ` · ${limit}` : ''}`
        : `${progressName} ${readout.required} 이상 유지\n${targetName} 피해 +${Math.round(rule.effect.more * 100)}%`;
    badge.effect.setText(effectText).setColor(lit ? COLORS.accentText : COLORS.textDim);
    // **세지 않는 조건에서는 눈금을 아예 지운다.**
    // 전에는 성립 여부에 따라 5칸을 한꺼번에 켜고 껐는데, 꺼진 다섯 칸이 그대로
    // `0 / 5 채워야 함`으로 읽혔다. 카운터를 뗀 이유가 그것이었는데 눈금이 같은
    // 오해를 그대로 하고 있었다. 게다가 글자가 그 위에 겹쳐 찍혔다.
    // 눈금 개수는 **요구치와 같아야 한다.** 예전에는 5칸이 박혀 있었는데, 조건이
    // 연계마다 달라진 뒤로는 `교차 2회`짜리에도 5칸이 떠서 2까지만 차고 멈춘
    // 눈금이 고장난 것처럼 보인다.
    const counting = true;
    for (const [index, pip] of badge.pips.entries()) {
      const used = counting && index < readout.required;
      pip.setVisible(used);
      if (used) {
        const filled = index < readout.value;
        pip.setFillStyle(filled ? color : 0x2a2f42, filled ? 0.95 : 0.9);
      }
    }

    const maxWidth = 104;
    badge.value.setFontSize(20);
    badge.value.setText(label);
    if (badge.value.width > maxWidth) {
      badge.value.setFontSize(Math.max(13, Math.floor((20 * maxWidth) / badge.value.width)));
    }
    badge.value.setColor(lit ? COLORS.accentText : '#ffffff');

    const duration = resolveFor(this.run.loadout, runtime.weapon.basic).stats.comboDuration ?? 5;
    const running = readout.value > 0;
    const ratio = lit && activeEmpower?.secondsLeft !== undefined && rule.effect.seconds
      ? Phaser.Math.Clamp(activeEmpower.secondsLeft / rule.effect.seconds, 0, 1)
      : running
        ? Phaser.Math.Clamp(this.combo.remaining / duration, 0, 1)
        : 0;
    badge.timer.width = 280 * ratio;
    badge.timer.setFillStyle(color, lit ? 0.9 : 0.65);
  }

  /**
   * 관리인의 말.
   *
   * **첫 마을에서는 무엇을 해야 하는지까지 말한다.** 소켓이 셋인데 무엇을 어디에
   * 끼우는지 아무도 알려주지 않으면, 패널을 열어 놓고도 그냥 나가게 된다.
   * 두 번째부터는 같은 말을 반복하지 않는다 — 아는 사람에게는 잔소리다.
   */
  private townDialogueText(): string {
    const first = this.run.progress.configs[this.run.progress.active.left].basicSkillId === null;
    if (!first) {
      return '그 장갑은 네가 지나온 싸움을 기억한다.\n나가기 전에, 어떤 형태를 손에 남길지 정해 두어라.';
    }
    return [
      '그 장갑은 네가 지나온 싸움을 기억한다.',
      '먼저 무기 설정에서 전투 중 R링에 띄울 왼손과 오른손 후보 무기를 정해 두어라.',
      '기술 설정에서 각 무기별 스킬을 장착할 수 있다. 장착된 스킬로 인해 기본 공격의 형태가 달라진다.',
    ].join('\n');
  }

  private showTownDialogue(): void {
    const container = this.add.container(0, 0).setDepth(30);
    this.clearTransientOverlays();
    pinContainer(this, container);

    container.add(this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH, VIEW_HEIGHT, 0x05060a, 0.68));
    const panel = this.add
      .rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT - 156, VIEW_WIDTH - 150, 154, 0x0a0b0f, 0.96)
      .setStrokeStyle(2, 0x3a4059, 0.95);
    container.add(panel);
    container.add(
      this.add
        .text(104, VIEW_HEIGHT - 212, '마을 관리인', {
          fontSize: '22px',
          color: COLORS.text,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );
    container.add(
      this.add
        .text(104, VIEW_HEIGHT - 162, this.townDialogueText(), {
          fontSize: '18px',
          color: COLORS.text,
          lineSpacing: 8,
          wordWrap: { width: VIEW_WIDTH - 240 },
        })
        .setOrigin(0, 0.5),
    );
    container.add(
      this.add
        .text(VIEW_WIDTH - 104, VIEW_HEIGHT - 98, 'F 장비 설정', {
          fontSize: '17px',
          color: COLORS.accentText,
          fontStyle: 'bold',
        })
        .setOrigin(1, 0.5),
    );

    panel.setInteractive({ useHandCursor: true });
    panel.on('pointerdown', () => this.showTown());
    this.overlay = container;
    this.overlayKind = 'town-dialogue';
  }

  private openWeaponWheel(): void {
    if (this.weaponWheel) return;

    const pointer = this.input.activePointer;
    // 포인터 위치에 띄우되 링이 화면 밖으로 나가지 않게 당긴다.
    // 화면 끝에서 열면 반쪽이 잘려 나가, 그쪽 손의 후보를 마우스로 고를 수 없다.
    const raw = pointerScreenLocal(this, pointer);
    const center = {
      x: Phaser.Math.Clamp(raw.x, WHEEL_RADIUS + 8, VIEW_WIDTH - WHEEL_RADIUS - 8),
      y: Phaser.Math.Clamp(raw.y, WHEEL_RADIUS + 8, VIEW_HEIGHT - WHEEL_RADIUS - 8),
    };
    const container = this.add.container(0, 0).setDepth(31);
    pinContainer(this, container);

    container.add(this.add.rectangle((VIEW_WIDTH / 2), (VIEW_HEIGHT / 2), VIEW_WIDTH, VIEW_HEIGHT, 0x1d1f28, 0.62));
    const leftZone = this.add
      .arc(center.x, center.y, WHEEL_RADIUS + 10, 90, 270, false, 0x4f8cff, 0.16)
      .setStrokeStyle(3, 0x8fb8ff, 0.65);
    const rightZone = this.add
      .arc(center.x, center.y, WHEEL_RADIUS + 10, 270, 90, false, 0xffc55c, 0.16)
      .setStrokeStyle(3, 0xffd38a, 0.65);
    container.add(leftZone);
    container.add(rightZone);
    const segments = this.createWheelSegments(container, center);
    container.add(this.add.rectangle(center.x, center.y, 4, WHEEL_RADIUS * 2 - 14, 0x0a0b0f, 0.82));
    container.add(
      this.add
        .text(center.x - WHEEL_RADIUS - 30, center.y, '왼손', {
          fontSize: '22px',
          color: '#cfe0ff',
          fontStyle: 'bold',
        })
        .setOrigin(1, 0.5),
    );
    container.add(
      this.add
        .text(center.x + WHEEL_RADIUS + 30, center.y, '오른손', {
          fontSize: '22px',
          color: '#ffe0a8',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );
    const core = this.add.circle(center.x, center.y, WHEEL_INNER_RADIUS, 0x0a0b0f, 0.92);
    container.add(core);
    container.add(
      this.add
        .text(center.x, center.y, 'R', { fontSize: '18px', color: COLORS.text, fontStyle: 'bold' })
        .setOrigin(0.5),
    );
    container.add(
      this.add
        .text(center.x, center.y + WHEEL_RADIUS + 26, '포인터 선택 · R 떼기', {
          fontSize: '13px',
          color: COLORS.textDim,
        })
        .setOrigin(0.5),
    );

    container.setAlpha(0.4);
    for (const segment of segments) {
      segment.wedge.setScale(0.2);
      segment.icon?.setAlpha(0);
      segment.label.setAlpha(0);
      segment.meta.setAlpha(0);
      segment.activeMark.setAlpha(0);
    }
    leftZone.setScale(0.2);
    rightZone.setScale(0.2);
    core.setScale(0.2);
    this.tweens.add({ targets: container, alpha: 1, duration: WHEEL_OPEN_MS, ease: 'Quad.easeOut' });
    this.tweens.add({
      targets: [leftZone, rightZone, ...segments.map((segment) => segment.wedge), core],
      scale: 1,
      duration: WHEEL_OPEN_MS,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: segments.flatMap((segment) => [segment.icon, segment.label, segment.meta, segment.activeMark].filter(Boolean)),
      alpha: 1,
      duration: WHEEL_OPEN_MS,
    });

    this.weaponWheel = {
      container,
      center,
      readyAt: this.time.now + WHEEL_OPEN_MS,
      selected: null,
      segments,
    };
  }

  private createWheelSegments(container: Phaser.GameObjects.Container, center: { x: number; y: number }): WheelSegment[] {
    const slots = [
      { hand: 'left' as const, index: 0 as const, start: 180, end: 270, labelDx: -62, labelDy: -54 },
      { hand: 'left' as const, index: 1 as const, start: 90, end: 180, labelDx: -62, labelDy: 54 },
      { hand: 'right' as const, index: 0 as const, start: 270, end: 360, labelDx: 62, labelDy: -54 },
      { hand: 'right' as const, index: 1 as const, start: 0, end: 90, labelDx: 62, labelDy: 54 },
    ];

    return slots.map((slot) => {
      const weapon = this.run.progress.wheel[slot.hand][slot.index];
      const color = weapon ? weaponOf(weapon).color : 0x2a2f42;
      const active = Boolean(weapon) && this.run.progress.active[slot.hand] === weapon;
      const weaponLabel = weapon ? weaponOf(weapon).name : '-';
      const metaLabel = `${slot.hand === 'left' ? 'L' : 'R'}${slot.index + 1}`;
      const iconKey = weapon ? WEAPON_SPRITE[weapon] : null;
      const wedge = this.add
        .arc(center.x, center.y, WHEEL_RADIUS, slot.start, slot.end, false, color, weapon ? 0.58 : 0.28)
        .setStrokeStyle(2, 0x0a0b0f, 0.9);
      const icon = iconKey && this.textures.exists(iconKey)
        ? this.add.image(center.x + slot.labelDx, center.y + slot.labelDy + 4, iconKey).setOrigin(0.5)
        : null;
      if (icon) {
        icon.setScale(48 / Math.max(icon.width, icon.height));
        icon.setAlpha(weapon ? 0.95 : 0.3);
      }
      const label = this.add
        .text(center.x + slot.labelDx, center.y + slot.labelDy + (icon ? 39 : 8), weaponLabel, {
          fontSize: icon ? '12px' : '20px',
          color: weapon ? COLORS.text : COLORS.textDim,
          fontStyle: weapon ? 'bold' : undefined,
          align: 'center',
        })
        .setOrigin(0.5);
      const meta = this.add
        .text(center.x + slot.labelDx, center.y + slot.labelDy - 18, metaLabel, {
          fontSize: '12px',
          color: slot.hand === 'left' ? '#cfe0ff' : '#ffe0a8',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const activeMark = this.add
        .text(center.x + slot.labelDx, center.y + slot.labelDy + (icon ? 54 : 30), active ? '장착 중' : '', {
          fontSize: icon ? '11px' : '13px',
          color: COLORS.accentText,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      container.add(wedge);
      container.add(meta);
      if (icon) container.add(icon);
      container.add(label);
      container.add(activeMark);
      return { hand: slot.hand, index: slot.index, weapon, equipped: Boolean(active), wedge, icon, label, meta, activeMark };
    });
  }

  private updateWeaponWheel(): void {
    const wheel = this.weaponWheel;
    if (!wheel) return;

    const point = pointerScreenLocal(this, this.input.activePointer);
    const selected = this.pickWheelSegment(point, wheel);
    wheel.selected = selected;
    const ready = this.time.now >= wheel.readyAt;

    if (ready && selected) this.equipWheelSelection(selected.hand, selected.index);

    // R링에서는 포인터가 올라간 후보가 곧바로 장착된다.
    // 그래서 `장착 중` 표시는 현재 진행 상태의 active를 기준으로 매 프레임 다시 계산한다.
    for (const segment of wheel.segments) {
      const hovered = Boolean(
        ready &&
        selected?.hand === segment.hand &&
        selected.index === segment.index &&
        segment.weapon,
      );
      const equipped = Boolean(segment.weapon) && this.run.progress.active[segment.hand] === segment.weapon;
      segment.equipped = equipped;
      const marked = equipped || hovered;

      segment.wedge.setAlpha(hovered ? 0.95 : equipped ? 0.78 : segment.weapon ? 0.5 : 0.22);
      segment.wedge.setStrokeStyle(
        hovered ? 5 : equipped ? 3 : 2,
        marked ? COLORS.accent : 0x0a0b0f,
        hovered ? 1 : equipped ? 0.75 : 0.9,
      );
      segment.label.setColor(marked ? COLORS.accentText : segment.weapon ? COLORS.text : COLORS.textDim);
      segment.label.setScale(hovered ? 1.16 : 1);
      segment.icon?.setScale((hovered ? 56 : equipped ? 52 : 48) / Math.max(segment.icon.width, segment.icon.height));
      segment.icon?.setAlpha(hovered ? 1 : equipped ? 0.95 : segment.weapon ? 0.72 : 0.25);
      segment.meta.setScale(hovered ? 1.12 : 1);
      segment.meta.setColor(marked ? COLORS.accentText : segment.hand === 'left' ? '#cfe0ff' : '#ffe0a8');
      segment.activeMark.setText(marked ? '장착 중' : '');
      segment.activeMark.setAlpha(hovered || marked ? 1 : 0);
    }
  }

  private pickWheelSegment(
    point: { x: number; y: number },
    wheel: WeaponWheelMenu,
  ): { hand: Hand; index: 0 | 1 } | null {
    const dx = point.x - wheel.center.x;
    const dy = point.y - wheel.center.y;
    const distance = Math.hypot(dx, dy);
    if (distance < WHEEL_INNER_RADIUS || distance > WHEEL_RADIUS) return null;

    if (dx < 0) return { hand: 'left', index: dy < 0 ? 0 : 1 };
    return { hand: 'right', index: dy < 0 ? 0 : 1 };
  }

  private closeWeaponWheel(tryEquip: boolean): void {
    const wheel = this.weaponWheel;
    this.weaponWheel = null;
    if (!wheel) return;

    const selection = this.time.now >= wheel.readyAt ? wheel.selected : null;
    if (tryEquip && selection) this.equipWheelSelection(selection.hand, selection.index);
    wheel.container.destroy(true);
  }

  private equipWheelSelection(hand: Hand, index: 0 | 1): boolean {
    const before = this.run.progress;
    const progress = equipFromWheel(before, hand, index);
    if (progress === before) return false;

    this.run = {
      ...this.run,
      progress,
      loadout: loadoutFromProgress(progress, this.run.loadout),
    };
    this.saveCurrentProgress();
    this.syncWeaponRuntimes();
    this.refreshHud();
    return true;
  }

  /**
   * 로드아웃이 바뀐 뒤 양손 런타임을 맞춘다.
   *
   * **무기가 실제로 바뀐 손만 새로 만든다.** 양쪽을 무조건 다시 만들면
   * 오른손 하나를 교체했을 뿐인데 건드리지도 않은 왼손 콤보까지 초기화된다.
   * 콤보 유지가 이 게임의 핵심 긴장인데 무기 교체가 그것을 통째로 날리게 된다.
   */
  private syncWeaponRuntimes(): void {
    const left = leftWeapon(this.run.loadout);
    const right = rightWeapon(this.run.loadout);

    if (this.left.weapon.id !== left.id) {
      this.left = { weapon: left, hand: 'left', readyAt: 0 };
    }
    if (this.right?.weapon.id !== right?.id) {
      this.right = right ? { weapon: right, hand: 'right', readyAt: 0 } : null;
    }

    tintView(this.comboRings.left, left.color);
    tintView(this.comboRings.right, right?.color ?? 0x2a2f42);
    this.refreshWeaponViews();
  }

  /** 마을 설정 패널을 처음 연다. 탭과 필터를 기본값으로 되돌린다. */
  private showTown(readOnly = false): void {
    // 튜토리얼 순서와 맞춘다. 먼저 R링에 나올 무기 후보를 정하고,
    // 그다음 기술 설정 탭에서 기본스킬/보조/연계를 끼운다.
    this.townTab = 1;
    this.townFilter = 'all';
    this.townPendingSlot = null;
    this.townDragSource = null;
    this.townReadOnly = readOnly;
    this.renderTown();
  }

  /**
   * 패널을 다시 그린다.
   *
   * 부분 갱신을 하지 않는 이유는 이 패널이 서로 물려 있기 때문이다. 칸을 하나
   * 채우면 인벤토리에서 그 항목이 빠지고, 점멸 대상이 바뀌고, 다른 칸의 후보도
   * 달라진다. 조각마다 갱신 경로를 만들면 어긋나는 곳이 생긴다.
  */
  private renderTown(): void {
    // 탭·필터 전환은 패널을 통째로 다시 그린다. 기존 오버레이를 닫는 과정에서
    // 읽기 전용 상태까지 초기화하면 전투 인벤토리가 마을 설정 화면으로 승격된다.
    const readOnly = this.townReadOnly;
    if (this.overlay) this.closeOverlay();
    this.townReadOnly = readOnly;
    // 다시 그리면 칸이 새로 만들어져 `pointerout`이 오지 않는다. 남은 설명을 먼저 지운다.
    this.hideTownTip();

    const container = this.add.container(0, 0).setDepth(30);
    this.clearTransientOverlays();
    pinContainer(this, container);

    // 패널이 화면보다 작아서 뒤로 HUD 글자가 비쳐 읽혔다. 전체를 덮는 막을 먼저 깐다.
    container.add(this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH, VIEW_HEIGHT, 0x05060a, 0.92));
    const panel = TOWN_UI.panel;
    container.add(
      this.add
        .rectangle(panel.x + panel.w / 2, panel.y + panel.h / 2, panel.w, panel.h, 0x0a0b0f, 0.94)
        .setStrokeStyle(2, 0x3a4059, 0.95),
    );
    container.add(
      this.add
        .text(VIEW_WIDTH / 2, panel.y + 24, this.townReadOnly ? '인벤토리' : '마을 관리인', {
          fontSize: '24px',
          color: COLORS.text,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    if (this.townReadOnly) {
      container.add(
        this.add
          .text(VIEW_WIDTH / 2, panel.y + 48, '보기 전용 — 장비 변경은 마을에서만 된다', {
            fontSize: '13px',
            color: '#ffb4a2',
          })
          .setOrigin(0.5),
      );
    }
    this.addOverlayCloseButton(container, panel.x + panel.w - 30, panel.y + 26, () => this.closeOverlay());

    this.renderTownMainTabs(container);
    if (this.townTab === 1) this.renderTownEquipTab(container);
    else this.renderTownSkillTab(container);
    this.renderTownInventory(container);

    container.add(
      this.add
        .text(VIEW_WIDTH / 2, VIEW_HEIGHT - 18, this.townReadOnly ? 'I / Esc 닫기' : 'R / Esc 닫기   ·   오른쪽 출구로 다음 전투', {
          fontSize: '14px',
          color: COLORS.accentText,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    this.overlay = container;
    this.overlayKind = 'town-config';
    this.refreshHud();
  }

  // ───────────────────────── 마을 설정 패널 (기획서 `UI구성.pptx`)

  /** 좌측 세로 탭. 무기 설정 / 기술 설정. */
  private renderTownMainTabs(container: Phaser.GameObjects.Container): void {
    const t = TOWN_UI.mainTab;
    const tabs = ['무기 설정', '기술 설정'] as const;
    for (const [index, label] of tabs.entries()) {
      const y = t.y + index * (t.h + t.gap);
      const active = this.townTab === index + 1;
      const rect = this.add
        .rectangle(t.x + t.w / 2, y + t.h / 2, t.w, t.h, active ? 0x2b3350 : 0x141824, 0.96)
        .setStrokeStyle(2, active ? COLORS.accent : 0x3a4059, active ? 1 : 0.8)
        .setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => {
        this.townTab = (index + 1) as 1 | 2;
        this.townPendingSlot = null;
        this.renderTown();
      });
      container.add(rect);
      container.add(
        this.add
          .text(t.x + t.w / 2, y + t.h / 2, label, {
            fontSize: '13px',
            color: active ? COLORS.accentText : COLORS.textDim,
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
    }
    container.add(
      this.add.text(TOWN_UI.content.x, TOWN_UI.content.y - 22, this.townTab === 1 ? '무기 설정' : '기술 설정', {
        fontSize: '17px',
        color: COLORS.text,
        fontStyle: 'bold',
      }),
    );
  }

  /** 탭① — 장비 스탯 자리와 R링 착용 칸. */
  private renderTownEquipTab(container: Phaser.GameObjects.Container): void {
    const c = TOWN_UI.content;

    // 기획서에 `장비 스탯 표시 부분 (현재는 장비 능력치에 대해 따로 개발된 내용이 없음)`
    // 이라고 적혀 있다. 자리를 잡아 두되 없는 수치를 지어내지 않는다.
    const statsH = 150;
    container.add(
      this.add.rectangle(c.x + c.w / 2, c.y + statsH / 2, c.w, statsH, 0x141824, 0.9).setStrokeStyle(1, 0x3a4059, 0.7),
    );
    container.add(
      this.add.text(c.x + 14, c.y + 12, '장비 스탯', { fontSize: '14px', color: COLORS.textDim }),
    );
    const left = weaponOf(this.run.progress.active.left).name;
    const right = this.run.progress.active.right ? weaponOf(this.run.progress.active.right).name : '없음';
    container.add(
      this.add.text(c.x + 14, c.y + 42, [`왼손 ${left}`, `오른손 ${right}`, '', '능력치 표시는 아직 없다'].join('\n'), {
        fontSize: '14px',
        color: COLORS.text,
        lineSpacing: 5,
      }),
    );

    // 착용 칸. 기획서의 `R키 눌렀을때 나오는 UI와 비슷하게`에 해당한다.
    const slotsY = c.y + statsH + 28;
    container.add(this.add.text(c.x, slotsY - 22, 'R링 무기 후보', { fontSize: '15px', color: COLORS.textDim }));

    const slots: Array<{ hand: Hand; index: 0 | 1; label: string }> = [
      { hand: 'left', index: 0, label: '왼손 1' },
      { hand: 'left', index: 1, label: '왼손 2' },
      { hand: 'right', index: 0, label: '오른손 1' },
      { hand: 'right', index: 1, label: '오른손 2' },
    ];
    const boxW = (c.w - 16) / 2;
    const boxH = 84;
    for (const [i, slot] of slots.entries()) {
      const x = c.x + (i % 2) * (boxW + 16);
      const y = slotsY + Math.floor(i / 2) * (boxH + 14);
      this.renderTownSlot(container, { kind: 'wheel', hand: slot.hand, index: slot.index }, x, y, boxW, boxH, slot.label);
    }
  }

  /** 탭② — 무기마다 보조·연계 칸. 보유 무기가 위, 미보유는 아래에 회색으로. */
  private renderTownSkillTab(container: Phaser.GameObjects.Container): void {
    const c = TOWN_UI.content;
    const rowH = 68;
    const labelW = 84;
    // 기획서(`UI구성.pptx`)의 행 구성이 `무기 ─ 기본스킬 ─ 보조 ─ 연계`다.
    // 같은 폭에 칸이 둘에서 셋으로 늘어 무기 이름 자리를 조금 줄였다.
    const gap = 8;
    const slotW = (c.w - labelW - gap * 2) / 3;
    const slotX = (index: number) => c.x + labelW + index * (slotW + gap);

    for (const [index, label] of ['기본스킬', '보조', '연계'].entries()) {
      container.add(this.add.text(slotX(index), c.y - 2, label, { fontSize: '13px', color: COLORS.textDim }));
    }

    // 보유한 무기를 먼저, 미보유를 뒤에. 기획서의 정렬 요구다.
    const owned = WEAPON_IDS.filter((id) => this.run.progress.unlockedWeapons.includes(id));
    const locked = WEAPON_IDS.filter((id) => !this.run.progress.unlockedWeapons.includes(id));

    for (const [index, weaponId] of [...owned, ...locked].entries()) {
      const y = c.y + 18 + index * rowH;
      const weapon = weaponOf(weaponId);
      const isOwned = owned.includes(weaponId);

      // 무기는 글자가 아니라 그림으로. 기획서 요구다.
      const iconKey = WEAPON_SPRITE[weaponId];
      if (this.textures.exists(iconKey)) {
        const icon = this.add.image(c.x + 26, y + 26, iconKey).setOrigin(0.5);
        icon.setScale(44 / Math.max(icon.width, icon.height));
        // 미보유는 회색으로 칠하고 선택이 불가능하다.
        if (!isOwned) icon.setTint(0x4a5062).setAlpha(0.55);
        container.add(icon);
      }
      container.add(
        this.add
          .text(c.x + 48, y + 26, weapon.name, {
            fontSize: '15px',
            color: isOwned ? COLORS.text : COLORS.textDim,
            fontStyle: isOwned ? 'bold' : 'normal',
          })
          .setOrigin(0, 0.5),
      );

      if (!isOwned) {
        container.add(
          this.add
            .rectangle(c.x + labelW + (c.w - labelW) / 2, y + 26, c.w - labelW, 52, 0x141824, 0.5)
            .setStrokeStyle(1, 0x2a2f42, 0.6),
        );
        container.add(
          this.add
            .text(c.x + labelW + (c.w - labelW) / 2, y + 26, '미보유', { fontSize: '13px', color: '#5a6070' })
            .setOrigin(0.5),
        );
        continue;
      }

      this.renderTownSlot(container, { kind: 'basic', weapon: weaponId }, slotX(0), y, slotW, 52);
      this.renderTownSlot(container, { kind: 'support', weapon: weaponId, slot: 'primary' }, slotX(1), y, slotW, 52);
      this.renderTownSlot(container, { kind: 'support', weapon: weaponId, slot: 'synergy' }, slotX(2), y, slotW, 52);
    }
  }

  /**
   * 이 보조형스킬을 **그 무기에 붙이면** 무엇이 달라지는지.
   *
   * 설명문(`description`)은 일반론이라 무기마다 다른 결과를 말해주지 못한다.
   * 같은 `다중투사체`도 활에 붙으면 화살이 몇 발이 되는지가 무기마다 다르다.
   * 실제로 붙여 본 수치를 비교해 그 무기 기준으로 알려준다.
   */
  private supportEffectFor(weaponId: WeaponId, support: Support): string {
    const weapon = weaponOf(weaponId);
    const skills = attachableSkills([weapon.basic, ...basicSkillsOf(weapon)], support);
    // 못 붙는 이유를 **무엇이 필요한지**로 말한다. `안 붙는다`만 쓰면 다른 무기를
    // 하나씩 눌러 보는 것 말고는 알 방법이 없다.
    if (!skills.length) return `${support.requires.join('·')} 스킬과만 연결 가능`;

    const lastSkill = skills[skills.length - 1];
    const last = lastSkill.name.charCodeAt(lastSkill.name.length - 1) - 0xac00;
    const conjunction = last >= 0 && last <= 0x2ba3 && last % 28 !== 0 ? '과' : '와';
    const lines: string[] = [`${skills.map((skill) => skill.name).join(' / ')}${conjunction} 연결 가능`];

    // 여러 스킬에 연결될 때는 호환 목록이 우선이다. 각 스킬의 원래 수치가 달라
    // 하나의 전후 값으로 합치면 거짓말이 되므로, 공통 변화는 위 설명문에 맡긴다.
    if (skills.length > 1) return lines.join('\n');

    const skill = skills[0];
    const before = resolveSkill(skill, []).stats;
    const after = resolveSkill(skill, [support]).stats;
    const pairs: [Stat, string][] = [
      ['damage', '피해'],
      ['projectileCount', '투사체'],
      ['areaRadius', '반경'],
      ['duration', '지속'],
      ['projectileSpeed', '속도'],
      ['tickInterval', '틱'],
    ];
    for (const [stat, label] of pairs) {
      const from = before[stat];
      const to = after[stat];
      if (from === undefined || to === undefined || Math.abs(from - to) < 0.001) continue;
      lines.push(`${label} ${this.formatStat(from)} → ${this.formatStat(to)}`);
    }

    // **여기에는 무기마다 달라지는 것만 적는다.**
    // 관통 횟수도 상처 증폭도 어느 무기에 붙이든 같은 값이고, 그 내용은 위의
    // `description`이 이미 말하고 있다. 같은 문장을 두 번 읽히면 정작 다른 부분인
    // 수치 변화가 묻힌다. 실제로 `연계 방출`이 설명문과 거의 같은 줄을 반복했다.
    return lines.join('\n');
  }

  /**
   * 이 연계가 어떤 갈래인지. 기획 표의 `분류` 칸이다.
   *
   * 연계 칸은 무기당 하나뿐이라 다섯이 한 자리를 놓고 경쟁한다. 갈래를 먼저
   * 알려주면 무엇과 무엇 중에 고르는지가 보인다. 거동에서 끌어내므로 데이터가
   * 늘어도 따로 손댈 곳이 없다.
   *
   * 성능만 보정하는 보조에는 붙이지 않는다. 전부 같은 갈래라 알려줄 것이 없다.
   */
  private supportCategory(support: Support): string | null {
    for (const behavior of support.behaviors ?? []) {
      if (behavior.kind === 'combo') return '콤보 효과';
      if (behavior.kind === 'statusDamage' || behavior.kind === 'additionalStatusStacks') return '상태 효과';
    }
    return null;
  }

  /**
   * 항목 설명을 띄운다.
   *
   * 보조·연계 스킬은 어디에서 마우스오버해도 전체 호환 관계를 보여준다. 현재 선택한
   * 슬롯이나 무기 해금 상태에 따라 목록이 달라지면 같은 아이템의 규칙이 상황마다
   * 다르게 보이기 때문이다.
   */
  private showTownTip(
    item: InventoryItem,
    x: number,
    y: number,
    avoid?: { x: number; y: number; w: number; h: number },
  ): void {
    this.hideTownTip();
    if (item.kind === 'weapon') {
      this.drawTownTip(this.weaponTipText(item.id), x, y, true, avoid);
      return;
    }
    // 기본스킬은 붙이는 게 아니라 형태를 바꾸는 것이라 설명이 짧다.
    if (item.kind === 'skill') {
      const weapon = weaponOf(item.weapon);
      const skill = basicSkillsOf(weapon).find((candidate) => candidate.id === item.id);
      if (!skill) return;
      this.drawTownTip(
        [
          item.name,
          '기본스킬',
          item.description,
          '',
          `[${weapon.name}]`,
          `${weapon.basic.name} 대신 나간다`,
          `공격 간격 ${weapon.cooldown}ms → ${attackIntervalFor(weapon, skill)}ms`,
          '',
          this.statusTipText(weapon.status),
        ].join('\n'),
        x,
        y,
        true,
        avoid,
      );
      return;
    }
    if (item.kind !== 'support') return;
    const support = findSupport(item.id);
    if (!support) return;

    const notAttachable = `${support.requires.join('·')} 스킬과만 연결 가능`;
    const category = this.supportCategory(support);
    const statusBehavior = findBehavior(support.behaviors ?? [], 'statusDamage');
    const head = [
      support.name,
      `${this.slotKindOf(item.slot).label}${category ? ` · ${category}` : ''}`,
      support.description,
    ].join('\n');

    const compatibleWeapons = WEAPON_IDS.filter((id) => this.supportEffectFor(id, support) !== notAttachable);
    const blocks = compatibleWeapons.map((id) => `[${weaponOf(id).name}]\n${this.supportEffectFor(id, support)}`);
    const body = blocks.length ? blocks.join('\n\n') : '붙일 수 있는 무기가 없다';

    const pending = this.townPendingSlot;

    // **넣을 수 없는 칸을 눌러둔 상태면 그것부터 말한다.**
    // 태그만 보고 효과를 설명하면, 보조 칸을 눌러둔 채 연계 스킬에 올렸을 때
    // 못 넣는데 넣을 수 있는 것처럼 읽힌다. 판정은 장착과 같은 함수를 쓴다.
    if (pending !== null && !this.townSlotAccepts(pending, item)) {
      const reason =
        pending.kind === 'wheel'
          ? '이 칸에는 무기만 들어간다'
          : pending.kind === 'basic'
            ? '이 칸에는 그 무기의 기본스킬만 들어간다'
            : item.slot !== pending.slot
              ? `이것은 ${this.slotKindOf(item.slot).label} 스킬이라 ${this.slotKindOf(pending.slot).label} 칸에 안 들어간다`
              : `이것은 ${support.requires.join('·')} 스킬과만 연결 가능해서 이 무기에는 안 들어간다`;
      this.drawTownTip(`${head}\n\n${body}\n\n[현재 선택]\n${reason}`, x, y, false, avoid);
      return;
    }
    const statusBody = statusBehavior ? `\n\n[필요한 상태]\n${this.statusTipText(statusBehavior.status)}` : '';

    this.drawTownTip(`${head}\n\n${body}${statusBody}`, x, y, true, avoid);
  }

  private weaponTipText(weaponId: WeaponId): string {
    const weapon = weaponOf(weaponId);
    const equippedSkill = equippedBasicSkill(this.run.progress, weaponId);
    const configured = this.run.progress.configs[weaponId].basicSkillId !== null;
    const lines = [
      weapon.name,
      weapon.concept,
      '',
      `기본 공격: ${weapon.basic.name}`,
      `기본스킬: ${basicSkillsOf(weapon).map((skill) => skill.name).join(' / ')}`,
      configured ? `현재 공격: ${equippedSkill.name}` : `현재 공격: ${weapon.basic.name}`,
      '',
      this.statusTipText(weapon.status),
    ];

    if (weaponId === 'shield') {
      lines.push(
        '',
        `방패 공격 중 보호막 ${SHIELD_ENERGY_MAX}이 체력보다 먼저 닳는다`,
        `보호 시간에는 받는 피해가 ${Math.round(SHIELD_GUARD_DAMAGE_TAKEN * 100)}%로 줄어든다`,
        '보호막은 방을 클리어해야 회복된다',
      );
    }

    return lines.join('\n');
  }

  private statusTipText(kind: StatusKind): string {
    return [`상태: ${STATUS_RULES[kind].label}`, ...this.statusHelpLines(kind)].join('\n');
  }

  /**
   * 상태이상 설명.
   *
   * 문구는 기획이 적어 준 표현을 그대로 쓴다. 예전에는 첫 줄을 `무기명 + 확률`로
   * 한 틀에서 찍어냈는데, 기획 표현이 상태마다 다르다(`부여` / `부착`, 괄호 안
   * 지속시간의 유무). 틀을 억지로 늘리는 대신 상태마다 제 문장을 들고 있게 했다.
   *
   * 숫자는 가능한 한 규칙 상수에서 끌어 쓴다. 손으로 적으면 밸런스를 만질 때
   * 조용히 어긋난다.
   */
  private statusHelpLines(kind: StatusKind): string[] {
    const rule = STATUS_RULES[kind];
    const chance = rule.chance >= 1 ? '항상' : `${Math.round(rule.chance * 100)}%`;
    const lines: Record<StatusKind, string[]> = {
      wound: [
        this.statusSourceText(kind, chance),
        '스택이 무한한 지속시간을 가짐',
        `${rule.maxStacks}스택이면 상처 폭발 ${WOUND_BURST_DAMAGE} 피해 후 초기화`,
        `다른 무기로 때리면 스택당 ${WOUND_CONSUME_PER_STACK} 피해를 주고 소모`,
      ],
      exposed: [
        `활 명중 시 ${chance} 확률로 부여 (${rule.duration}초)`,
        `대상이 받는 피해 +${Math.round(EXPOSED_DAMAGE_INCREASE * 100)}%`,
      ],
      brand: [
        `비전 명중 시 ${chance} 확률로 적에게 낙인 부착`,
        '낙인이 부착된 대상을 다시 공격 시 플레이어가 비전 흐름 획득',
        `비전 흐름: 비전 피해 +${Math.round(ARCANE_FLOW_MORE * 100)}% (${ARCANE_FLOW_DURATION}초)`,
      ],
      fracture: [
        `방패 공격 명중 시 ${chance} 확률로 적에게 균열 부여 (${rule.duration}초)`,
        `균열이 적에게 기절을 유발(${STUN_DURATION}초)`,
        `한번 균열로 인해 기절한 적은 ${FRACTURE_IMMUNITY}초 동안 재기절 면역`,
        '방패 넉백으로 벽에 부딪히면 확정 기절',
        '보스는 기본적으로 기절·넉백 면역',
      ],
    };
    return lines[kind];
  }

  private statusSourceText(kind: StatusKind, chance: string): string {
    const weapon = WEAPON_LIST.find((candidate) => candidate.status === kind);
    if (!weapon) return `명중 시 ${chance} 부여`;
    return `${weapon.name} 명중 시 ${chance} 부여`;
  }

  private drawTownTip(
    text: string,
    x: number,
    y: number,
    ok: boolean,
    avoid?: { x: number; y: number; w: number; h: number },
  ): void {
    const label = this.add.text(0, 0, text, {
      fontSize: '13px',
      color: ok ? COLORS.text : '#ffb4a2',
      lineSpacing: 4,
      wordWrap: { width: 300 },
    });
    const w = label.width + 20;
    const h = label.height + 16;
    // 기본은 대상 오른쪽에 띄우되, 오른쪽 끝 칸에서는 대상 왼쪽으로 뒤집는다.
    // 예전처럼 화면 안으로 clamp만 하면 툴팁이 hover 중인 아이템을 그대로 덮었다.
    const rightX = avoid ? avoid.x + avoid.w + 12 : x;
    const leftX = avoid ? avoid.x - w - 12 : x - w - 24;
    const preferredX = rightX + w <= VIEW_WIDTH - 12 ? rightX : leftX;
    const px = Phaser.Math.Clamp(preferredX, 12, VIEW_WIDTH - w - 12);
    const py = Math.min(y, VIEW_HEIGHT - h - 12);
    label.setPosition(px + 10, py + 8);

    const back = this.add
      .rectangle(px + w / 2, py + h / 2, w, h, 0x0d1018, 0.98)
      .setStrokeStyle(1, ok ? COLORS.accent : 0x8a4a4a, 0.85);

    const container = this.add.container(0, 0, [back, label]).setDepth(45);
    pinContainer(this, container);
    this.townTip = container;
  }

  private hideTownTip(): void {
    this.townTip?.destroy();
    this.townTip = null;
  }

  private formatStat(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  /** 이 칸에 지금 들어 있는 것. */
  private townSlotItem(target: TownSlotTarget): InventoryItem | null {
    if (target.kind === 'wheel') {
      const id = this.run.progress.wheel[target.hand][target.index];
      if (!id) return null;
      const weapon = weaponOf(id);
      return { kind: 'weapon', id, name: weapon.name, color: weapon.color };
    }
    const config = this.run.progress.configs[target.weapon];
    if (target.kind === 'basic') {
      if (config.basicSkillId === null) return null;
      return basicSkillItem(config.basicSkillId);
    }
    const id = target.slot === 'primary' ? config.primarySupportId : config.synergySupportId;
    if (!id) return null;
    const support = findSupport(id);
    if (!support) return null;
    return { kind: 'support', id, name: support.name, slot: supportSlotType(support), description: support.description };
  }

  /**
   * 이 항목을 그 칸에 넣을 수 있는지.
   *
   * 점멸 대상을 고를 때와 드롭을 받을 때 같은 판정을 써야 한다. 둘이 갈리면
   * 점멸했는데 안 들어가거나 그 반대가 된다.
   */
  private townSlotAccepts(target: TownSlotTarget, item: InventoryItem): boolean {
    if (target.kind === 'wheel') {
      return item.kind === 'weapon' && !this.wheelHasWeaponElsewhere(target, item.id);
    }
    // 첫 소켓은 그 무기의 기본스킬만 받는다. 활에서 멸검이 나가면 그림도 소리도 안 맞는다.
    if (target.kind === 'basic') return item.kind === 'skill' && item.weapon === target.weapon;
    if (item.kind !== 'support') return false;
    if (item.slot !== target.slot) return false;
    // **지금 나가는 공격에 붙을 수 있어야 한다.** 첫 소켓을 채웠는지에 따라 달라진다.
    // 검에 멸검을 끼우면 `지대`를 요구하는 보조가 그때부터 들어간다.
    const support = findSupport(item.id);
    if (!support) return false;
    return canAttach(equippedBasicSkill(this.run.progress, target.weapon), support, []).ok;
  }

  private wheelHasWeaponElsewhere(target: Extract<TownSlotTarget, { kind: 'wheel' }>, weapon: WeaponId): boolean {
    for (const hand of ['left', 'right'] as const) {
      for (const index of [0, 1] as const) {
        if (hand === target.hand && index === target.index) continue;
        if (this.run.progress.wheel[hand][index] === weapon) return true;
      }
    }
    return false;
  }

  private townRejectMessage(target: TownSlotTarget, item: InventoryItem): string {
    if (target.kind === 'wheel' && item.kind === 'weapon' && this.wheelHasWeaponElsewhere(target, item.id)) {
      return '이미 무기 후보에 등록되어 있습니다.';
    }
    return '무기 유형에 맞지 않습니다.';
  }

  /** 칸 하나를 그린다. 클릭하면 채우기 대기 상태가 되고, 드롭도 여기서 받는다. */
  private renderTownSlot(
    container: Phaser.GameObjects.Container,
    target: TownSlotTarget,
    x: number,
    y: number,
    w: number,
    h: number,
    label?: string,
  ): void {
    const item = this.townSlotItem(target);
    const pending = this.townPendingSlot !== null && this.sameTownSlot(this.townPendingSlot, target);

    const rect = this.add
      .rectangle(x + w / 2, y + h / 2, w, h, pending ? 0x2b3350 : 0x141824, 0.96)
      .setStrokeStyle(2, pending ? COLORS.accent : 0x3a4059, pending ? 1 : 0.8);
    container.add(rect);

    // 보기 전용에서는 칸을 아예 잡지 않는다. 누를 수 있게 두고 무시하면
    // 눌리는데 아무 일도 안 일어나는 것처럼 보여 고장으로 읽힌다.
    if (!this.townReadOnly) {
      // `dropZone`이 없으면 Phaser가 `drop` 이벤트를 주지 않는다. 드래그해서
      // 놓아도 아무 일이 일어나지 않아 기능이 없는 것처럼 보인다.
      rect.setInteractive({ useHandCursor: true, draggable: item !== null, dropZone: true });
      rect.setData('townSlot', target);
      rect.on('pointerdown', () => {
        // 무기 후보 칸에 이미 무기가 있으면 드래그 출발점이 된다. 여기서 다시 그리면
        // Phaser가 dragstart를 내기 전에 출발 객체가 사라져 슬롯 간 교체가 막힌다.
        if (target.kind === 'wheel' && item !== null) {
          this.time.delayedCall(120, () => {
            if (this.overlayKind !== 'town-config' || this.townDragSource !== null) return;
            this.townPendingSlot = pending ? null : target;
            this.renderTown();
          });
          return;
        }
        // 같은 칸을 다시 누르면 대기를 푼다. 잘못 눌렀을 때 빠져나갈 길이 있어야 한다.
        this.townPendingSlot = pending ? null : target;
        this.renderTown();
      });
    } else {
      // 설명 호버만 남긴다. 클릭과 드롭 대상으로는 등록하지 않는다.
      rect.setInteractive().setAlpha(0.75);
    }

    // **넣고 나서도 설명이 보여야 한다.**
    // 인벤토리에서는 올리면 설명이 뜨는데 장착하는 순간 이름만 남아서, 무엇을
    // 붙여 뒀는지 확인하려면 빼서 다시 올려보는 수밖에 없었다.
    // 칸의 무기 기준으로만 보여준다. 그 칸에서 실제로 일어나는 일이 그것이다.
    // 좌표는 오버레이 컨테이너의 지역 좌표다. 포인터의 월드 좌표를 그대로 넘기면
    // 컨테이너가 카메라에 핀으로 붙어 있어 엉뚱한 곳에 뜬다.
    if (item !== null && item.kind === 'support' && target.kind === 'support') {
      rect.on('pointerover', () => this.showTownTip(item, x + w + 10, y, { x, y, w, h }));
      rect.on('pointerout', () => this.hideTownTip());
    }

    if (label) {
      container.add(this.add.text(x + 10, y + 8, label, { fontSize: '12px', color: COLORS.textDim }));
    }

    const textY = label ? y + h / 2 + 8 : y + h / 2;
    if (item) {
      if (item.kind === 'weapon' && this.textures.exists(WEAPON_SPRITE[item.id])) {
        const icon = this.add.image(x + w - 28, y + h / 2, WEAPON_SPRITE[item.id]).setOrigin(0.5);
        icon.setScale(34 / Math.max(icon.width, icon.height));
        container.add(icon);
      }
      container.add(
        this.add.text(x + 10, textY, item.name, { fontSize: '15px', color: COLORS.text }).setOrigin(0, 0.5),
      );
      // 비우는 길. 기획서에 명시는 없지만 넣은 것을 뺄 수 없으면 되돌릴 방법이 없다.
      if (this.townReadOnly) return;
      const clear = this.add
        .text(x + w - 10, y + 10, '×', { fontSize: '15px', color: COLORS.textDim })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true });
      clear.on('pointerdown', (_p: unknown, _lx: unknown, _ly: unknown, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.applyTownSlot(target, null);
      });
      container.add(clear);
    } else {
      container.add(
        this.add
          .text(x + 10, textY, pending ? '인벤토리에서 고르시오' : '비어 있음', {
            fontSize: '14px',
            color: pending ? COLORS.accentText : '#5a6070',
          })
          .setOrigin(0, 0.5),
      );
    }
  }

  private sameTownSlot(a: TownSlotTarget, b: TownSlotTarget): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'wheel' && b.kind === 'wheel') return a.hand === b.hand && a.index === b.index;
    if (a.kind === 'basic' && b.kind === 'basic') return a.weapon === b.weapon;
    if (a.kind === 'support' && b.kind === 'support') return a.weapon === b.weapon && a.slot === b.slot;
    return false;
  }

  /** 칸에 항목을 넣거나(`item`) 비운다(`null`). */
  private applyTownSlot(target: TownSlotTarget, item: InventoryItem | null): void {
    if (this.townReadOnly) return;

    if (target.kind === 'wheel') {
      const weapon = item && item.kind === 'weapon' ? item.id : null;
      // 1번 칸을 바꾸면 손에 드는 무기도 바뀌어야 한다. 마을을 나갈 때까지 미루면
      // 패널에는 `왼손 1: 방패`라고 떠 있는데 캐릭터는 검을 든 채로 남는다.
      this.run = {
        ...this.run,
        progress: equipFirstWheelSlots(setWheelSlot(this.run.progress, target.hand, target.index, weapon)),
      };
    } else if (target.kind === 'basic') {
      const id = item && item.kind === 'skill' ? item.id : null;
      this.run = {
        ...this.run,
        progress: configureManifestation(this.run.progress, target.weapon, { basicSkillId: id }),
      };
    } else {
      const key = target.slot === 'primary' ? 'primarySupportId' : 'synergySupportId';
      const id = item && item.kind === 'support' ? item.id : null;
      this.run = { ...this.run, progress: configureManifestation(this.run.progress, target.weapon, { [key]: id }) };
    }
    this.run = { ...this.run, loadout: loadoutFromProgress(this.run.progress, this.run.loadout) };
    this.saveCurrentProgress();
    // 진행 상태만 바꾸면 화면과 전투 런타임이 옛 무기를 들고 있다.
    this.syncWeaponRuntimes();
    this.refreshHud();
    this.townPendingSlot = null;
    this.renderTown();
  }

  /** 우측 인벤토리. 필터 탭 3개 + 7×7 격자 + 자동정렬 버튼. */
  private renderTownInventory(container: Phaser.GameObjects.Container): void {
    const t = TOWN_UI.filterTab;
    const filters: Array<{ key: InventoryFilter; label: string }> = [
      { key: 'all', label: '전체' },
      { key: 'weapon', label: '무기' },
      { key: 'skill', label: '기본스킬' },
      { key: 'support', label: '보조형' },
    ];
    for (const [index, f] of filters.entries()) {
      const x = t.x + index * (t.w + t.gap);
      const active = this.townFilter === f.key;
      const rect = this.add
        .rectangle(x + t.w / 2, t.y + t.h / 2, t.w, t.h, active ? 0x2b3350 : 0x141824, 0.96)
        .setStrokeStyle(2, active ? COLORS.accent : 0x3a4059, active ? 1 : 0.8)
        .setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => {
        this.townFilter = f.key;
        this.renderTown();
      });
      container.add(rect);
      container.add(
        this.add
          .text(x + t.w / 2, t.y + t.h / 2, f.label, {
            fontSize: '14px',
            color: active ? COLORS.accentText : COLORS.textDim,
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
    }

    const inv = TOWN_UI.inventory;
    container.add(
      this.add.rectangle(inv.x + inv.w / 2, inv.y + inv.h / 2, inv.w, inv.h, 0x0d1018, 0.9).setStrokeStyle(1, 0x3a4059, 0.7),
    );

    const cells = cellsOf(this.run.progress, this.run.progress.inventory, this.townFilter);
    const step = TOWN_UI.cell + TOWN_UI.cellGap;
    const gridW = INVENTORY_COLUMNS * step - TOWN_UI.cellGap;
    const originX = inv.x + (inv.w - gridW) / 2;
    const originY = inv.y + 14;

    for (let i = 0; i < INVENTORY_COLUMNS * INVENTORY_ROWS; i++) {
      const cx = originX + (i % INVENTORY_COLUMNS) * step;
      const cy = originY + Math.floor(i / INVENTORY_COLUMNS) * step;
      const cell = cells[i];
      this.renderInventoryCell(container, i, cell?.item ?? null, cx, cy, cell?.matchesFilter ?? true);
    }

    const sortY = inv.y + inv.h - 26;
    const sortRect = this.add
      .rectangle(inv.x + inv.w / 2, sortY, 130, 32, 0x141824, 0.96)
      .setStrokeStyle(1, 0x3a4059, 0.9);
    if (!this.townReadOnly) {
      sortRect.setInteractive({ useHandCursor: true });
      sortRect.on('pointerdown', () => {
        this.run = { ...this.run, progress: sortInventory(this.run.progress) };
        this.saveCurrentProgress();
        this.renderTown();
      });
    } else {
      sortRect.setAlpha(0.45);
    }
    container.add(sortRect);
    container.add(
      this.add
        .text(inv.x + inv.w / 2, sortY, '자동정렬', {
          fontSize: '14px',
          color: this.townReadOnly ? COLORS.textDim : COLORS.text,
        })
        .setOrigin(0.5),
    );
  }

  /**
   * 보조형스킬의 슬롯 종류를 부르는 이름과 색.
   *
   * 격자 칸의 배지, 호버 설명, 거절 사유가 전부 이걸 쓴다. 세 곳이 각자 문자열을
   * 들고 있으면 한 곳만 고쳐져서 같은 것을 다르게 부르게 된다.
   */
  private slotKindOf(slot: 'primary' | 'synergy'): { label: string; color: number } {
    return slot === 'synergy' ? { label: '연계', color: COLORS.accent } : { label: '보조', color: 0x6ea8ff };
  }

  /** 격자 칸 하나. 드래그로 옮길 수 있고, 대기 중인 칸에 넣을 수 있으면 점멸한다. */
  private renderInventoryCell(
    container: Phaser.GameObjects.Container,
    index: number,
    item: InventoryItem | null,
    x: number,
    y: number,
    matchesFilter = true,
  ): void {
    const size = TOWN_UI.cell;
    const pending = this.townPendingSlot;
    const eligible = pending !== null && item !== null && this.townSlotAccepts(pending, item);

    const rect = this.add
      .rectangle(x + size / 2, y + size / 2, size, size, 0x161b28, 0.95)
      .setStrokeStyle(1, 0x2f3648, 0.9);
    if (this.townReadOnly) rect.setInteractive();
    else rect.setInteractive({ useHandCursor: true, draggable: true, dropZone: true });
    rect.setData('cellIndex', index);
    container.add(rect);

    // 칸을 이루는 조각들. 점멸과 흐리기를 **칸 전체**에 걸어야 해서 모아 둔다.
    // 배경만 흐리게 했더니 배지와 이름이 밝게 남아, 못 넣는 것이 넣을 수 있는 것처럼
    // 보였다. 배지를 넣고 나서 그 차이가 눈에 띄게 커졌다.
    const parts: Phaser.GameObjects.GameObject[] = [rect];
    const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      container.add(object);
      parts.push(object);
      return object;
    };

    if (item) {
      if (item.kind === 'weapon' && this.textures.exists(WEAPON_SPRITE[item.id])) {
        const icon = add(this.add.image(x + size / 2, y + size / 2 - 6, WEAPON_SPRITE[item.id]).setOrigin(0.5));
        icon.setScale(30 / Math.max(icon.width, icon.height));
      } else if (item.kind === 'skill') {
        // 기본스킬은 무기 색을 그대로 쓰고 마름모로 그린다. 무기와 같은 계열이지만
        // 무기가 아니라는 것이 한눈에 갈려야 한다.
        add(this.add.rectangle(x + size / 2, y + 7, size - 2, 13, item.color, 0.22));
        add(
          this.add
            .text(x + size / 2, y + 7, '기본', { fontSize: '9px', color: COLORS.text, fontStyle: 'bold' })
            .setOrigin(0.5),
        );
        const diamond = this.add.rectangle(x + size / 2, y + size / 2 + 1, 13, 13, item.color, 0.9);
        diamond.setRotation(Math.PI / 4);
        add(diamond);
      } else if (item.kind === 'support') {
        // **보조형스킬은 종류를 글자로 적는다.**
        // 전에는 점 색깔로만 갈랐는데, 색만으로는 어느 쪽이 연계인지 알 방법이 없어
        // 칸을 눌러 점멸시켜 보기 전에는 구분이 안 됐다. 배지는 칸 위쪽 띠에 둔다.
        const kind = this.slotKindOf(item.slot);
        add(this.add.rectangle(x + size / 2, y + 7, size - 2, 13, kind.color, 0.22));
        add(
          this.add
            .text(x + size / 2, y + 7, kind.label, { fontSize: '9px', color: COLORS.text, fontStyle: 'bold' })
            .setOrigin(0.5),
        );
        // 띠가 자리를 차지하므로 점은 조금 작게, 조금 아래로 내린다.
        add(this.add.circle(x + size / 2, y + size / 2 + 1, 9, kind.color, 0.85));
      } else if (item.kind === 'key' && this.textures.exists(KEY_SPRITE[item.id])) {
        // 열쇠는 어디에도 장착하지 않는다. 배지 없이 그림만 두어 소켓에 들어가는
        // 것들과 한눈에 갈리게 한다.
        const icon = add(this.add.image(x + size / 2, y + size / 2 - 6, KEY_SPRITE[item.id]).setOrigin(0.5));
        icon.setScale(30 / Math.max(icon.width, icon.height));
      } else {
        add(this.add.circle(x + size / 2, y + size / 2 - 6, 11, item.kind === 'key' ? item.color : 0x6ea8ff, 0.85));
      }
      add(
        this.add
          .text(x + size / 2, y + size - 11, item.name, { fontSize: '10px', color: COLORS.textDim })
          .setOrigin(0.5),
      );
    }

    if (eligible) {
      // 넣을 수 있는 것만 점멸시킨다. 기획서의 `점멸되어 표시됨`이다.
      rect.setStrokeStyle(2, COLORS.accent, 1);
      this.tweens.add({ targets: parts, alpha: 0.45, duration: 420, yoyo: true, repeat: -1 });
    } else if (pending !== null && item !== null) {
      // 대기 중인데 못 넣는 것은 눌러서 헤매지 않도록 흐리게 둔다.
      for (const part of parts) (part as unknown as { setAlpha(v: number): void }).setAlpha(0.4);
    } else if (!matchesFilter && item !== null) {
      // 필터에 걸리지 않는 항목도 위치를 유지해 보여준다. 사라지면 드래그 배치가
      // 당겨진 것처럼 보여 헷갈리므로, 회색으로만 낮춘다.
      for (const part of parts) (part as unknown as { setAlpha(v: number): void }).setAlpha(0.28);
    }

    rect.on('pointerdown', () => {
      if (this.townReadOnly) return;
      if (!item) return;
      if (pending === null) return;
      if (!this.townSlotAccepts(pending, item)) {
        this.showTownToast(this.townRejectMessage(pending, item));
        return;
      }
      this.applyTownSlot(pending, item);
    });

    // 올려두면 이 항목이 **그 무기에서** 무엇을 하는지 알려준다.
    // 설명문만으로는 무기마다 다른 결과를 알 수 없다.
    rect.on('pointerover', () => {
      if (item) this.showTownTip(item, x + size + 10, y, { x, y, w: size, h: size });
    });
    rect.on('pointerout', () => this.hideTownTip());
    rect.setData('dragParts', parts);
  }

  /**
   * 드래그앤드롭.
   *
   * 격자 칸끼리 놓으면 자리를 맞바꾸고, 좌측 칸에 놓으면 장착한다.
   * 타입이 맞지 않으면 기획서대로 화면 최하단에 안내를 띄운다.
   */
  private setupTownDragAndDrop(): void {
    this.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (this.overlayKind !== 'town-config' || this.townReadOnly) return;
      const index = obj.getData('cellIndex');
      if (typeof index === 'number') {
        this.townDragSource = { kind: 'inventory', index };
        this.captureTownDragParts(obj);
        return;
      }
      const target = obj.getData('townSlot') as TownSlotTarget | undefined;
      this.townDragSource = target && this.townSlotItem(target) !== null ? { kind: 'townSlot', target } : null;
      if (this.townDragSource?.kind === 'townSlot') this.createTownSlotDragGhost(obj, this.townDragSource.target);
    });

    this.input.on('drag', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, x: number, y: number) => {
      if (this.overlayKind !== 'town-config' || this.townReadOnly) return;
      if (this.townDragSource?.kind === 'townSlot') {
        // 장착 슬롯 자체는 dropZone이기도 하다. 원본 사각형을 포인터 아래로 끌고 가면
        // 드롭 순간에 대상 슬롯이 아니라 자기 자신이 잡힐 수 있어, 슬롯끼리 교체가
        // 같은 칸 드롭으로 끝난다. 슬롯은 제자리에 두고 살짝 흐리게만 표시한다.
        (obj as Phaser.GameObjects.Rectangle).setAlpha(0.55);
        this.townDragGhost?.setPosition(x, y);
        return;
      }
      // 끌고 있는 칸만 따라다니게 한다. 놓으면 다시 그리므로 위치는 원복된다.
      this.moveTownDragParts(obj, x, y);
    });

    this.input.on('drop', (_p: Phaser.Input.Pointer, _obj: Phaser.GameObjects.GameObject, zone: Phaser.GameObjects.GameObject) => {
      if (this.overlayKind !== 'town-config' || this.townReadOnly) return;
      this.handleTownDrop(zone);
    });

    this.input.on('dragend', (_p: Phaser.Input.Pointer, _obj: Phaser.GameObjects.GameObject, dropped: boolean) => {
      if (this.overlayKind !== 'town-config' || this.townReadOnly) return;
      this.townDragSource = null;
      this.destroyTownDragGhost();
      // 놓을 곳이 아니면 원래 자리로 돌아가야 한다. 다시 그리는 것이 가장 확실하다.
      if (!dropped) this.renderTown();
    });
  }

  private createTownSlotDragGhost(obj: Phaser.GameObjects.GameObject, target: TownSlotTarget): void {
    this.destroyTownDragGhost();
    const item = this.townSlotItem(target);
    if (!item) return;

    const rect = obj as Phaser.GameObjects.Rectangle;
    const w = rect.width;
    const h = rect.height;
    const ghost = this.add.container(rect.x, rect.y).setDepth(55);
    ghost.add(this.add.rectangle(0, 0, w, h, 0x2b3350, 0.72).setStrokeStyle(2, COLORS.accent, 0.95));

    if (item.kind === 'weapon' && this.textures.exists(WEAPON_SPRITE[item.id])) {
      const icon = this.add.image(w / 2 - 32, 0, WEAPON_SPRITE[item.id]).setOrigin(0.5);
      icon.setScale(34 / Math.max(icon.width, icon.height));
      ghost.add(icon);
    }
    ghost.add(
      this.add
        .text(-w / 2 + 14, 0, item.name, { fontSize: '15px', color: COLORS.accentText, fontStyle: 'bold' })
        .setOrigin(0, 0.5),
    );
    this.overlay?.add(ghost);
    this.townDragGhost = ghost;
  }

  private destroyTownDragGhost(): void {
    this.townDragGhost?.destroy(true);
    this.townDragGhost = null;
  }

  private captureTownDragParts(obj: Phaser.GameObjects.GameObject): void {
    const rect = obj as Phaser.GameObjects.Rectangle;
    const parts = (obj.getData('dragParts') as Phaser.GameObjects.GameObject[] | undefined) ?? [obj];
    obj.setData(
      'dragOffsets',
      parts.map((part) => ({
        part,
        dx: (part as unknown as { x: number }).x - rect.x,
        dy: (part as unknown as { y: number }).y - rect.y,
      })),
    );
  }

  private moveTownDragParts(obj: Phaser.GameObjects.GameObject, x: number, y: number): void {
    const offsets = obj.getData('dragOffsets') as
      | { part: Phaser.GameObjects.GameObject; dx: number; dy: number }[]
      | undefined;
    if (!offsets) {
      (obj as Phaser.GameObjects.Rectangle).setPosition(x, y).setDepth(40);
      return;
    }
    for (const { part, dx, dy } of offsets) {
      (part as unknown as { setPosition(x: number, y: number): void }).setPosition(x + dx, y + dy);
      if ('setDepth' in part) (part as Phaser.GameObjects.GameObject & { setDepth(depth: number): void }).setDepth(40);
    }
  }

  private handleTownDrop(zone: Phaser.GameObjects.GameObject): void {
    if (this.townReadOnly) return;

    const source = this.townDragSource;
    this.townDragSource = null;
    if (source === null) return;

    // 격자 칸끼리 — 자리 맞바꾸기.
    const toIndex = zone.getData('cellIndex');
    if (source.kind === 'inventory' && typeof toIndex === 'number') {
      this.run = { ...this.run, progress: moveInventoryItem(this.run.progress, source.index, toIndex) };
      this.saveCurrentProgress();
      this.renderTown();
      return;
    }

    // 좌측 칸에 놓기 — 장착.
    const target = zone.getData('townSlot') as TownSlotTarget | undefined;
    if (!target) {
      this.renderTown();
      return;
    }

    if (source.kind === 'townSlot') {
      this.handleTownSlotDrop(source.target, target);
      return;
    }

    const item = cellsOf(this.run.progress, this.run.progress.inventory)[source.index]?.item ?? null;
    if (!item) {
      this.renderTown();
      return;
    }
    if (!this.townSlotAccepts(target, item)) {
      this.showTownToast(this.townRejectMessage(target, item));
      this.renderTown();
      return;
    }
    this.applyTownSlot(target, item);
  }

  private handleTownSlotDrop(from: TownSlotTarget, to: TownSlotTarget): void {
    if (this.townReadOnly) return;

    if (this.sameTownSlot(from, to)) {
      this.renderTown();
      return;
    }
    if (from.kind !== 'wheel' || to.kind !== 'wheel') {
      this.showTownToast('무기 후보 칸끼리만 교체할 수 있습니다.');
      this.renderTown();
      return;
    }

    const progress = equipFirstWheelSlots(swapWheelSlots(this.run.progress, from, to));
    this.run = {
      ...this.run,
      progress,
      loadout: loadoutFromProgress(progress, this.run.loadout),
    };
    this.saveCurrentProgress();
    this.syncWeaponRuntimes();
    this.refreshHud();
    this.townPendingSlot = null;
    this.renderTown();
  }

  /**
   * 화면 최하단 안내.
   *
   * 기획서가 `무기 유형에 맞지 않습니다.` 문구를 4~5초 띄웠다가 사라지게 해달라고
   * 적고 있다. 패널을 다시 그려도 살아남아야 하므로 오버레이 바깥에 둔다.
   */
  private showTownToast(message: string): void {
    this.townToast?.destroy();
    const label = this.add
      // `setScrollFactor(0)`만으로는 카메라 확대 때문에 자리가 밀린다.
      // `render.ts`에 적힌 대로 HUD와 같은 고정 좌표 변환을 쓴다.
      .text(screenX(VIEW_WIDTH / 2), screenY(VIEW_HEIGHT - 40), message, {
        fontSize: '16px',
        color: '#ffb4a2',
        fontStyle: 'bold',
        backgroundColor: '#1a1015',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setScrollFactor(0);
    this.townToast = label;
    this.time.delayedCall(4500, () => {
      if (this.townToast === label) this.townToast = null;
      label.destroy();
    });
  }

  private saveCurrentProgress(): void {
    if (!this.persistProgress) return;
    saveRunCheckpoint(this.checkpointFromRun(this.run));
  }

  private checkpointFromRun(run: RunState): RunCheckpoint {
    return {
      phase: run.phase,
      roomIndex: run.roomIndex,
      hp: run.hp,
      maxHp: run.maxHp,
      shieldEnergy: run.shieldEnergy,
      potionCharge: run.potionCharge,
      progress: run.progress,
      roomStartProgress: run.roomStartProgress,
      roomStartKills: run.roomStartKills,
      clearedRooms: run.clearedRooms,
      kills: run.kills,
      gained: run.gained,
      elapsed: run.elapsed,
    };
  }

  private restoreCheckpoint(checkpoint: RunCheckpoint): RunState {
    return {
      ...checkpoint,
      phase: checkpoint.phase === 'lost' ? 'combat' : checkpoint.phase,
      loadout: loadoutFromProgress(checkpoint.progress),
      invulnerable: 0,
    };
  }

  private closeTopOverlayByEscape(): boolean {
    if (this.weaponWheel) {
      this.closeWeaponWheel(false);
      return true;
    }
    if (this.overlayKind === 'map') {
      this.closeMap();
      return true;
    }
    if (this.overlayKind === 'status-help') {
      this.closeStatusHelp();
      return true;
    }
    if (this.overlayKind === 'pause') {
      this.closePause();
      return true;
    }
    if (this.overlay) {
      this.closeOverlay();
      return true;
    }
    return false;
  }

  private closeOverlay(): void {
    // 설명은 오버레이 밖에 있어 함께 사라지지 않는다. 명시적으로 지운다.
    this.hideTownTip();
    this.destroyTownDragGhost();
    this.townReadOnly = false;
    const overlay = this.overlay;
    this.overlay = null;
    this.overlayKind = null;
    if (!overlay) return;

    overlay.setVisible(false);
    for (const child of overlay.list) {
      if ('disableInteractive' in child) (child as Phaser.GameObjects.GameObject).disableInteractive();
    }
    this.time.delayedCall(0, () => overlay.destroy(true));
  }

  private addOverlayCloseButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    onClose: () => void,
  ): void {
    const hit = this.add
      .rectangle(x, y, 32, 32, 0x141824, 0.92)
      .setStrokeStyle(1, 0x3a4059, 0.95)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x, y - 1, 'X', {
        fontSize: '18px',
        color: COLORS.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    hit.on('pointerover', () => {
      hit.setFillStyle(0x2b3350, 0.98);
      label.setColor(COLORS.accentText);
    });
    hit.on('pointerout', () => {
      hit.setFillStyle(0x141824, 0.92);
      label.setColor(COLORS.text);
    });
    hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      onClose();
    });

    container.add([hit, label]);
  }

  private showWorldMap(): void {
    this.paused = true;

    const container = this.add.container(0, 0).setDepth(30);
    pinContainer(this, container);
    container.add(this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH, VIEW_HEIGHT, 0x05060a, 0.78));

    const panel = { x: 70, y: 74, w: VIEW_WIDTH - 140, h: VIEW_HEIGHT - 148 };
    container.add(
      this.add
        .rectangle(panel.x + panel.w / 2, panel.y + panel.h / 2, panel.w, panel.h, 0x0a0b0f, 0.96)
        .setStrokeStyle(2, 0x3a4059, 0.95),
    );
    container.add(
      this.add
        .text(panel.x + 28, panel.y + 28, '전체 지도', {
          fontSize: '28px',
          color: COLORS.text,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );
    container.add(
      this.add
        .text(panel.x + panel.w - 62, panel.y + 30, 'M / Esc', {
          fontSize: '15px',
          color: COLORS.accentText,
          fontStyle: 'bold',
        })
        .setOrigin(1, 0.5),
    );
    this.addOverlayCloseButton(container, panel.x + panel.w - 28, panel.y + 30, () => this.closeMap());

    const missing = missingKeys(this.run.progress.ownedKeys);
    for (const [from, to] of WORLD_MAP_LINKS) {
      const a = WORLD_MAP_NODES[from];
      const b = WORLD_MAP_NODES[to];
      const known = this.worldMapNodeKnown(a) || this.worldMapNodeKnown(b);
      // 봉인된 문으로 가는 길은 열쇠가 다 모이기 전까지 붉게 둔다. 선이 다 같으면
      // 왜 못 지나가는지 지도만 봐서는 알 수 없다.
      const sealed =
        (a.kind === 'room' && a.roomIndex === SEALED_ROOM_INDEX)
        || (b.kind === 'room' && b.roomIndex === SEALED_ROOM_INDEX);
      const locked = sealed && missing.length > 0;
      container.add(
        this.add
          .line(
            0, 0,
            panel.x + a.x, panel.y + a.y, panel.x + b.x, panel.y + b.y,
            locked ? 0x7a4048 : known ? 0x4b5874 : 0x2a2f42,
            locked ? 0.9 : known ? 0.85 : 0.45,
          )
          .setOrigin(0),
      );
    }

    for (const node of WORLD_MAP_NODES) {
      this.drawWorldMapNode(container, panel.x + node.x, panel.y + node.y, node);
    }

    container.add(
      this.add
        .text(panel.x + 28, panel.y + panel.h - 34, this.worldMapLegend(), {
          fontSize: '14px',
          color: COLORS.textDim,
        })
        .setOrigin(0, 0.5),
    );

    this.overlay = container;
    this.overlayKind = 'map';
  }

  private worldMapLegend(): string {
    const missing = missingKeys(this.run.progress.ownedKeys);
    if (!missing.length) return '회색 구역은 아직 가보지 않은 곳이다';
    return `회색 구역은 아직 가보지 않은 곳이다   ·   붉은 길은 봉인 — ${missing.map((k) => k.name).join(' · ')} 필요`;
  }

  private drawWorldMapNode(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    node: WorldMapNode,
  ): void {
    const known = this.worldMapNodeKnown(node);
    const current = this.worldMapNodeCurrent(node);
    const cleared = this.worldMapNodeCleared(node);
    const label = node.kind === 'town' ? '마을' : ROOMS[node.roomIndex]?.label ?? `구역 ${node.roomIndex + 1}`;
    // **마을은 가보기 전에도 이름을 보인다.** 번호가 없는 항목이라 `미확인`으로 두면
    // 이름도 번호도 없는 빈 상자가 되어 고장난 것처럼 보인다. 첫 보스를 잡으면
    // 반드시 지나는 곳이라 감출 이유도 없다.
    const showLabel = known || node.kind === 'town';
    const index = node.kind === 'town' ? '' : `${node.roomIndex + 1}`;
    const fill = current ? 0x2b3350 : known ? 0x141824 : 0x1a1c22;
    const stroke = current ? COLORS.accent : cleared ? 0x6ea8ff : known ? 0x3a4059 : 0x2a2f42;
    const alpha = known ? 0.98 : 0.62;

    // 높이는 `현재` 라벨까지 담아야 한다. 68로는 글자가 아래 테두리를 넘어갔다.
    container.add(
      this.add
        .rectangle(x, y, node.kind === 'town' ? 96 : 112, node.kind === 'town' ? 62 : 84, fill, alpha)
        .setStrokeStyle(current ? 3 : 2, stroke, current ? 1 : 0.8),
    );
    container.add(
      this.add
        .text(x, y - 20, showLabel ? label : '미확인', {
          fontSize: node.kind === 'town' ? '15px' : '13px',
          color: known ? COLORS.text : '#717786',
          fontStyle: current ? 'bold' : undefined,
          align: 'center',
          wordWrap: { width: 92 },
        })
        .setOrigin(0.5),
    );
    if (index) {
      container.add(
        this.add
          .text(x, y + 6, index, {
            fontSize: '12px',
            color: current ? COLORS.accentText : known ? COLORS.textDim : '#5a6070',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
    }
    if (current) {
      container.add(
        this.add
          .text(x, y + 26, '현재', { fontSize: '12px', color: COLORS.accentText, fontStyle: 'bold' })
          .setOrigin(0.5),
      );
    }
  }

  private worldMapNodeKnown(node: WorldMapNode): boolean {
    if (node.kind === 'town') return this.run.progress.weaponSwitchUnlocked || this.run.phase === 'town';
    if (this.run.clearedRooms.includes(node.roomIndex) || node.roomIndex === this.run.roomIndex) return true;
    if (node.roomIndex <= TRIAL_ROOM_INDEX) return node.roomIndex <= this.run.roomIndex || this.run.clearedRooms.includes(TRIAL_ROOM_INDEX);
    if (node.roomIndex === UPPER_BRANCH_ROOM_INDEX || node.roomIndex === LOWER_BRANCH_ROOM_INDEX) {
      return this.run.clearedRooms.includes(TRIAL_ROOM_INDEX) || this.run.roomIndex === TRIAL_ROOM_INDEX;
    }
    if (node.roomIndex === SEALED_ROOM_INDEX) {
      return missingKeys(this.run.progress.ownedKeys).length === 0 || this.run.roomIndex >= SEALED_ROOM_INDEX;
    }
    return this.run.roomIndex >= node.roomIndex;
  }

  private worldMapNodeCurrent(node: WorldMapNode): boolean {
    if (node.kind === 'town') return this.run.phase === 'town';
    return this.run.phase === 'combat' && node.roomIndex === this.run.roomIndex;
  }

  private worldMapNodeCleared(node: WorldMapNode): boolean {
    if (node.kind === 'town') return this.run.progress.weaponSwitchUnlocked;
    return this.run.clearedRooms.includes(node.roomIndex) || this.run.phase === 'won';
  }

  private closeMap(): void {
    this.paused = false;
    this.closeOverlay();
  }

  private showStatusHelp(): void {
    this.paused = true;

    const container = this.add.container(0, 0).setDepth(30);
    pinContainer(this, container);
    container.add(this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH, VIEW_HEIGHT, 0x05060a, 0.72));

    const panel = { x: 260, y: 92, w: VIEW_WIDTH - 520, h: VIEW_HEIGHT - 184 };
    container.add(
      this.add
        .rectangle(panel.x + panel.w / 2, panel.y + panel.h / 2, panel.w, panel.h, 0x0a0b0f, 0.96)
        .setStrokeStyle(2, 0x3a4059, 0.95),
    );
    container.add(
      this.add
        .text(panel.x + 28, panel.y + 30, '적 상태 설명', {
          fontSize: '28px',
          color: COLORS.text,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );
    container.add(
      this.add
        .text(panel.x + panel.w - 62, panel.y + 30, 'H / Esc', {
          fontSize: '15px',
          color: COLORS.accentText,
          fontStyle: 'bold',
        })
        .setOrigin(1, 0.5),
    );
    this.addOverlayCloseButton(container, panel.x + panel.w - 28, panel.y + 30, () => this.closeStatusHelp());

    const columns = 2;
    const cardGap = 20;
    const cardsTop = panel.y + 82;
    const cardW = (panel.w - 76) / columns;
    const cardH = 162;
    for (const [index, status] of STATUS_ORDER.entries()) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = panel.x + 28 + col * (cardW + cardGap);
      const y = cardsTop + row * (cardH + cardGap);
      const rule = STATUS_RULES[status];

      container.add(
        this.add
          .rectangle(x + cardW / 2, y + cardH / 2, cardW, cardH, 0x141824, 0.92)
          .setStrokeStyle(1, STATUS_COLORS[status], 0.75),
      );
      container.add(this.add.circle(x + 20, y + 24, 8, STATUS_COLORS[status], 0.95).setStrokeStyle(1, 0x10131d, 0.9));
      container.add(
        this.add
          .text(x + 36, y + 24, rule.label, {
            fontSize: '17px',
            color: COLORS.text,
            fontStyle: 'bold',
          })
          .setOrigin(0, 0.5),
      );
      container.add(
        this.add.text(x + 18, y + 54, this.statusHelpLines(status).join('\n'), {
          fontSize: '12px',
          color: COLORS.textDim,
          lineSpacing: 3,
          wordWrap: { width: cardW - 36 },
        }),
      );
    }

    const footerY = cardsTop + cardH * 2 + cardGap + 36;
    container.add(
      this.add
        .text(panel.x + 28, footerY, '상태 연계는 이미 걸린 상처/균열 등을 읽어 추가 피해를 낸다.', {
          fontSize: '14px',
          color: COLORS.textDim,
        })
        .setOrigin(0, 0.5),
    );

    this.overlay = container;
    this.overlayKind = 'status-help';
  }

  private closeStatusHelp(): void {
    this.paused = false;
    this.closeOverlay();
  }

  /**
   * 일시정지 화면.
   *
   * 판 도중에 기록을 지우고 처음부터 볼 수 있어야 한다.
   * 결과 화면에만 초기화가 있으면 "지금 처음부터 다시 보고 싶다"에 답할 수 없다.
   */
  private showPause(): void {
    this.paused = true;

    const container = this.add.container(0, 0).setDepth(30);
    pinContainer(this, container);
    container.add(this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH, VIEW_HEIGHT, 0x0a0b0f, 0.82));
    container.add(
      this.add
        .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 80, '일시정지', { fontSize: '44px', color: COLORS.text, fontStyle: 'bold' })
        .setOrigin(0.5),
    );
    container.add(
      this.add
        .text(
          VIEW_WIDTH / 2,
          VIEW_HEIGHT / 2 + 10,
          this.run.phase === 'town'
            ? `마을   처치 ${this.run.kills}`
            : `${ROOMS[this.run.roomIndex]?.label ?? ''} (${this.run.roomIndex + 1}/${TOTAL_ROOMS})   처치 ${this.run.kills}`,
          { fontSize: '16px', color: COLORS.textDim },
        )
        .setOrigin(0.5),
    );
    container.add(
      this.add
        .text(
          VIEW_WIDTH / 2,
          VIEW_HEIGHT / 2 + 80,
          'P / Esc 이어하기\nR 체크포인트에서 다시 시작\nShift+R 처음부터 시작',
          { fontSize: '18px', color: COLORS.textDim, align: 'center', lineSpacing: 10 },
        )
        .setOrigin(0.5),
    );
    this.overlay = container;
    this.overlayKind = 'pause';
  }

  private closePause(): void {
    this.paused = false;
    this.closeOverlay();
  }

  private showResult(won: boolean): void {
    const container = this.add.container(0, 0).setDepth(30);
    // scrollFactor 대신 컨테이너 자체를 화면 좌상단에 맞춘다.
    // 자식 좌표는 화면 좌표(0~1280, 0~720)를 그대로 쓴다.
    pinContainer(this, container);
    container.add(this.add.rectangle((VIEW_WIDTH / 2), (VIEW_HEIGHT / 2), VIEW_WIDTH, VIEW_HEIGHT, 0x0a0b0f, 0.88));
    container.add(
      this.add
        .text((VIEW_WIDTH / 2), 150, won ? '승리' : '패배', {
          fontSize: '56px',
          color: won ? '#6ee7a8' : '#ff6b6b',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    const hands = describeByHand(this.run.loadout);
    // 방의 보상이 아니라 이번 판에서 실제로 새로 얻은 것만 적는다.
    const reward = won ? this.run.gained : undefined;
    const body = this.add
      .text(
        (VIEW_WIDTH / 2),
        226,
        [
          this.right ? `${this.left.weapon.name} + ${this.right.weapon.name}` : `${this.left.weapon.name}`,
          `처치 ${this.run.kills}   시간 ${this.run.elapsed.toFixed(1)}초`,
          hands.map((h) => `${h.hand} ${h.weapon}` + (h.lines.length ? ` — ${h.lines.join(', ')}` : '')).join('\n'),
          ...this.rewardLines(reward, '이번 판에서 얻은 것'),
        ].join('\n'),
        { fontSize: '16px', color: COLORS.text, align: 'center', lineSpacing: 8, wordWrap: { width: VIEW_WIDTH - 180 } },
      )
      .setOrigin(0.5, 0);
    container.add(body);

    const controlsY = Math.min(VIEW_HEIGHT - 62, body.y + body.height + 46);
    container.add(
      this.add
        .text((VIEW_WIDTH / 2), controlsY, 'R 키로 처음부터 시작\nShift+R 기록 지우고 처음부터', {
          fontSize: '18px',
          color: COLORS.textDim,
          align: 'center',
          lineSpacing: 8,
        })
        .setOrigin(0.5),
    );
    this.overlay = container;
    this.overlayKind = 'result';
  }

  private rewardLines(reward: RoomReward | undefined, title = '획득'): string[] {
    if (!reward) return [];

    const lines: string[] = [title];
    const weapons = reward.weapons?.map((id) => weaponOf(id).name) ?? [];
    if (weapons.length) lines.push(`무기: ${weapons.join(' / ')}`);

    // 강화기술은 무기에 딸린 상태값이라 별도 보유 목록에는 없다. 그래도 무엇이 딸려
    // 왔는지는 알려야 한다. 얻은 무기에서 끌어내므로 보상 정의와 어긋날 수가 없다.
    const basicSkills = reward.basicSkills?.flatMap((id) => {
      const skill = WEAPON_IDS.map(weaponOf).flatMap((weapon) => basicSkillsOf(weapon)).find((candidate) => candidate.id === id);
      return skill ? [skill.name] : [];
    }) ?? [];
    if (basicSkills.length) lines.push(`기본스킬: ${basicSkills.join(' / ')}`);

    const supports = reward.supports?.flatMap((id) => {
      const support = findSupport(id);
      return support ? [support.name] : [];
    }) ?? [];
    if (supports.length) lines.push(`보조형: ${supports.join(' / ')}`);

    return lines.length > 1 ? lines : [];
  }
}
