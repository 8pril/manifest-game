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
import { awakenedAttackInterval, deliveryOf, weaponOf, WEAPON_IDS, type Weapon, type WeaponId } from '@/data/weapons';
import { findSupport } from '@/data/supports';
import { findSkill } from '@/data/skills';
import { canAttach, findBehavior, resolveSkill, supportSlotType, type Behavior, type Skill, type Support } from '@/engine/support';
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
import type { Stat } from '@/engine/modifiers';
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
  WOUND_BURST_DAMAGE,
  consumeWound,
  WOUND_CONSUME_PER_STACK,
  ARCANE_FLOW_MORE,
  ARCANE_FLOW_DURATION,
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
import { leftWeapon, rightWeapon, resolveFor, describeByHand, loadoutFromProgress } from '@/game/loadout';
import {
  createCombo,
  gainCombo,
  sustainCombo,
  tickCombo,
  consumeCombo,
  comboRulesOf,
  comboTriggerMet,
  comboTotal,
  comboOf,
  otherHand,
  COMBO_REQUIRED,
  type ComboState,
} from '@/game/combo';
import { grantEmpower, empowerMore, spendEmpower, tickEmpower, type EmpowerByHand } from '@/game/empower';
import {
  createRun,
  clearRoom,
  collectRoomReward,
  leaveTown,
  damagePlayer as applyPlayerDamage,
  addKill,
  advanceTime,
  hasActiveShield,
  isOver,
  newPartsOfReward,
  SHIELD_ENERGY_MAX,
  type RunState,
} from '@/game/run';
import { configureManifestation, createInitialProgress, equipFirstWheelSlots, equipFromWheel, grantComboSupport, hasComboSkill, unlockWeapons, setWheelSlot, type Hand, type PlayerProgress, type WheelSlot } from '@/game/progression';
import { parseDebugStart } from '@/game/debug-start';
import { clearSavedProgress, loadProgress, saveProgress } from '@/game/progress-storage';
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
  /** 몸 앞을 막는 자세라 가장 세운다. */
  shield: -1.15,
};

const ENEMY_SPRITE: Record<EnemyKind, string> = {
  chaser: 'enemy-chaser',
  archer: 'enemy-archer',
  brute: 'enemy-brute',
  gatekeeper: 'enemy-boss',
  collapsedDoor: 'enemy-boss2',
};

interface EnemyEntity {
  state: Enemy;
  view: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Rectangle;
  statusDots: Phaser.GameObjects.Rectangle[];
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

type OverlayKind = 'town-dialogue' | 'town-config' | 'pause' | 'result';

interface ComboBadge {
  back: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
  timer: Phaser.GameObjects.Rectangle;
  pips: Phaser.GameObjects.Rectangle[];
}

interface RewardDrop {
  reward: RoomReward;
  label: string;
  color: number;
  x: number;
  y: number;
  pickupEnabledAt: number;
  collected: boolean;
  marker: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;
  glow: Phaser.GameObjects.Arc;
  prompt: Phaser.GameObjects.Text;
}

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

  private hud!: Phaser.GameObjects.Text;
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private shieldBarBack!: Phaser.GameObjects.Rectangle;
  private shieldBarFill!: Phaser.GameObjects.Rectangle;
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
  /** 비전 흐름이 걸린 동안 플레이어를 감싸는 오라. 버프가 살아 있다는 유일한 표시다. */
  private arcaneAura!: Phaser.GameObjects.Arc;
  private overlay: Phaser.GameObjects.Container | null = null;
  private overlayKind: OverlayKind | null = null;
  private transientOverlays: Phaser.GameObjects.GameObject[] = [];
  private rewardDrops: RewardDrop[] = [];
  private townNpc: TownNpc | null = null;
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
  /** 규칙 발동 횟수. 개발 빌드 검증용이며 게임 로직에는 쓰이지 않는다. */
  private ruleEvents = { burst: 0, wallSlam: 0, brand: 0, woundConsume: 0, fracture: 0 };
  private weapons: { left: WeaponId; right: WeaponId | null } = { left: 'sword', right: null };
  /** 현재 방의 이동 가능 영역. 방마다 크기가 다르다. */
  private bounds = { minX: WALL, minY: WALL, maxX: GAME_WIDTH - WALL, maxY: GAME_HEIGHT - WALL };
  private exit!: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;
  private exitLabel!: Phaser.GameObjects.Text;
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
    const debugStart = parseDebugStart(location.search, TOTAL_ROOMS);
    const hasDebugWeapons = debugStart.left !== undefined || debugStart.right !== undefined;
    const ignoresSavedProgress =
      hasDebugWeapons ||
      debugStart.roomIndex !== undefined ||
      debugStart.town === true ||
      debugStart.combo !== null;
    // 저장을 안 읽는 개발 진입은 저장도 하지 않는다. 안 그러면 실제 진행을 덮어쓴다.
    this.persistProgress = !ignoresSavedProgress;
    let progress = data?.progress ?? (ignoresSavedProgress ? null : loadProgress()) ?? createInitialProgress();
    // 개발용: `?combo=`면 콤보 계열 연계를 미리 물려 콤보 빌드로 시작한다.
    // `?left=`/`?right=`로 지정한 무기까지 해금해야 그 무기에도 보조가 붙는다.
    // 콤보는 양손을 오가며 성립하므로, 두 파라미터를 같이 쓰는 것이 기본 사용법이다.
    if (debugStart.combo) {
      const forced = [debugStart.left, debugStart.right].filter((id): id is WeaponId => !!id);
      progress = grantComboSupport(unlockWeapons(progress, forced), debugStart.combo);
    }
    // 콤보 보조를 물렸으면 그 진행을 살려야 한다. 무기만 지정한 경우에는 예전대로 버린다.
    this.initialProgress = hasDebugWeapons && !debugStart.combo ? null : progress;
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

    this.run = { ...createRun(this.weapons.left, this.weapons.right, this.initialProgress ?? undefined), roomIndex: this.startRoomIndex };
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
    this.refreshWeaponViews();

    this.buildHud();
    this.bindInput();
    // `?town=1`로 시작하면 첫 진입부터 마을이다. 무조건 enterRoom을 부르면
    // 상태는 마을인데 화면은 전투 방이 되어, 적이 스폰되고 NPC는 없는 잡탕이 된다.
    if (this.run.phase === 'town') this.enterTownRoom();
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
      // 판이 끝났으면 다시 시작. 이 분기가 없으면 죽은 뒤 새로고침 말고는
      // 빠져나갈 방법이 없다. 결과 화면이 R을 안내하는데 아무 반응이 없었다.
      // 일시정지 중에도 같은 길을 연다.
      if (isOver(this.run) || this.paused) {
        if (this.keys.shift.isDown) clearSavedProgress();
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
    keyboard.on('keydown-ESC', togglePause);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.weaponWheel) return;
      if (this.paused) return;
      if (this.run.phase !== 'combat') return;
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
      if (this.run.phase !== 'combat') return;
      if (this.right) this.useWeapon(this.right);
    });
  }

  private tryDash(): void {
    if (this.weaponWheel || this.paused) return;
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
    if (this.canUseComboSkill(runtime)) {
      runtime.readyAt = this.time.now + awakenedAttackInterval(runtime.weapon);
      this.useSkill(runtime, runtime.weapon.combo, angle, false);
    } else {
      runtime.readyAt = this.time.now + runtime.weapon.cooldown;
      this.useSkill(runtime, runtime.weapon.basic, angle, true);
    }
    this.refreshHud();
  }

  private openShieldProtection(runtime: WeaponRuntime): void {
    if (runtime.weapon.id !== 'shield') return;
    this.shieldGuardUntil = Math.max(this.shieldGuardUntil, this.time.now + (runtime.weapon.swingDuration || 140));
  }

  /**
   * 이 무기에 콤보 전환이 열려 있는지.
   *
   * 기본 공격에 `콤보 개방` 연계가 붙어 있어야만 열린다. 콤보는 더 이상
   * 모든 무기의 기본 규칙이 아니라 골라서 얹는 것이다.
   */
  private comboRulesFor(runtime: WeaponRuntime) {
    return comboRulesOf(resolveFor(this.run.loadout, runtime.weapon.basic).behaviors);
  }

  /** 이 무기가 콤보를 쓰는가. 콤보를 읽는 연계가 하나라도 붙어 있으면 그렇다. */
  private usesCombo(runtime: WeaponRuntime): boolean {
    return this.comboRulesFor(runtime).length > 0;
  }

  private canUseComboSkill(runtime: WeaponRuntime): boolean {
    if (!hasComboSkill(this.run.progress, runtime.weapon.combo.id)) return false;
    return this.comboRulesFor(runtime).some(
      ({ trigger, effect }) =>
        effect.kind === 'comboSkill' && comboTriggerMet(this.combo, runtime.hand, trigger),
    );
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
    for (const { trigger, effect } of this.comboRulesFor(runtime)) {
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
      floatingText(this, this.player.x, this.player.y - PLAYER_RADIUS - 34, '연계 방출', COLORS.accentText);
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
      for (const { trigger, effect } of this.comboRulesFor(runtime)) {
        if (effect.kind !== 'empower' || effect.consumes) continue;

        const target = effect.hand === 'self' ? runtime.hand : otherHand(runtime.hand);
        const met = comboTriggerMet(this.combo, runtime.hand, trigger);
        const on = empowerMore(this.empower, target) > 0;
        if (met && !on) {
          this.empower = grantEmpower(this.empower, target, { more: effect.more });
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
  private useSkill(runtime: WeaponRuntime, skill: Skill, angle: number, basic: boolean): void {
    const resolved = resolveFor(this.run.loadout, skill);
    playSfx(basic ? 'attack' : 'combo');

    switch (deliveryOf(skill)) {
      case 'projectile':
        this.fireProjectiles(runtime.weapon, skill, resolved.stats, resolved.behaviors, angle, basic);
        break;
      case 'melee':
        this.swingMelee(runtime, skill, resolved.stats, resolved.behaviors, angle, basic);
        break;
      case 'area':
        this.dropArea(resolved.stats, resolved.behaviors, angle, basic ? null : runtime);
        break;
    }
  }

  private fireProjectiles(
    weapon: Weapon,
    _skill: Skill,
    stats: ReturnType<typeof resolveFor>['stats'],
    behaviors: ReturnType<typeof resolveFor>['behaviors'],
    angle: number,
    basic: boolean,
  ): void {
    for (const state of spawnProjectiles(stats, behaviors, { x: this.player.x, y: this.player.y }, angle)) {
      this.projectiles.push({
        state,
        view: this.createBoltView(BOLT_SPRITE[weapon.id], state.x, state.y, 22, state.angle, weapon.color),
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
    const result = canApplyStatus ? applyStatus(enemy, weapon.status) : { applied: false, burst: false };
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
  private enterRoom(): void {
    const room = ROOMS[this.run.roomIndex];
    if (!room) return;

    this.clearTransientOverlays();
    this.rewardDrops = [];
    this.townNpc = null;
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
    this.roomFloor.push(this.floorView(cx, cy, room.width, room.height, COLORS.background, 0x1b1e2b));
    // 서술 오브젝트를 먼저 놓아야 장식물이 그 자리를 피할 수 있다.
    this.placeLore(room);
    this.roomFloor.push(...this.propViews(room, this.run.roomIndex + 1, room.props));
    this.roomFloor.push(...this.wallViews(room.width, room.height, 0x2a2f42, cy));
    // 색조는 바닥·장식물·벽을 모두 덮어야 한 장소로 읽힌다. 그래서 마지막에 얹는다.
    this.roomFloor.push(this.toneView(cx, cy, room.width, room.height, room.tone));

    // 출구는 오른쪽 벽 가운데. 방을 정리하기 전에는 닫혀 있다.
    this.exit = this.exitView(room.width - WALL / 2, cy, 0x2a2f42);
    this.exitLabel = this.add
      .text(room.width - WALL - 110, cy, '', { fontSize: '17px', color: COLORS.accentText, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2);
    this.roomFloor.push(this.exit, this.exitLabel);

    // 플레이어는 왼쪽에서 들어온다.
    this.player.setPosition(WALL + 90, cy);
    followInRoom(this, this.player, room.width, room.height);

    for (const spawn of room.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        const at = this.edgeSpawnPoint();
        this.enemies.push(this.createEnemyEntity(spawn.kind, at.x, at.y));
      }
    }
    this.refreshHud();
  }

  /** 마을은 전투를 멈추는 전체 화면 모달이 아니라 직접 걸어 다니는 비전투 방이다. */
  private enterTownRoom(): void {
    this.clearTransientOverlays();
    this.rewardDrops = [];
    for (const object of this.roomFloor) object.destroy();
    this.roomFloor = [];
    for (const projectile of this.projectiles) projectile.view.destroy();
    this.projectiles = [];
    for (const area of this.areas) area.view.destroy();
    this.areas = [];
    for (const shot of this.enemyShots) shot.view.destroy();
    this.enemyShots = [];
    this.enemies = [];

    this.exitOpen = true;
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
    this.roomFloor.push(...this.wallViews(TOWN_WIDTH, TOWN_HEIGHT, 0x3a4059, cy));
    this.roomFloor.push(this.toneView(cx, cy, TOWN_WIDTH, TOWN_HEIGHT, TOWN_TONE));

    this.exit = this.exitView(TOWN_WIDTH - WALL / 2, cy, COLORS.accent);
    this.exitLabel = this.add
      .text(TOWN_WIDTH - WALL - 110, cy, '다음 전투 →', { fontSize: '17px', color: COLORS.accentText, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2);
    this.roomFloor.push(this.exit, this.exitLabel);

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
    // 손잡이 쪽을 회전 중심으로 둔다. 가운데를 중심으로 돌리면 무기가 손에서 떨어져 나간다.
    return this.add.sprite(0, 0, 'weapon-sword').setOrigin(0.2, 0.5).setDepth(11).setVisible(false);
  }

  /** 손에 든 무기가 바뀌면 그림도 바꾼다. R링 교체와 마을 설정 뒤에 불린다. */
  private refreshWeaponViews(): void {
    for (const [hand, runtime] of [['left', this.left], ['right', this.right]] as const) {
      const view = this.weaponViews[hand];
      if (!view) continue;
      if (!runtime) {
        view.setVisible(false);
        continue;
      }
      view.setTexture(WEAPON_SPRITE[runtime.weapon.id]);
      view.setScale(WEAPON_VIEW_SIZE / Math.max(view.width, view.height));
      view.setVisible(true);
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

      // 캐릭터가 좌우로 뒤집히면 손 위치도 같이 뒤집힌다.
      const offset = WEAPON_HAND_OFFSET[hand];
      view.setPosition(
        this.player.x + offset.x * width * (flipped ? -1 : 1),
        this.player.y + offset.y * height,
      );

      // 좌우 반전은 각도를 거울에 비추는 것과 같다. 위아래도 같이 뒤집어야 자세가 선다.
      const runtime = hand === 'left' ? this.left : this.right;
      const pose = WEAPON_POSE_ANGLE[runtime?.weapon.id ?? 'sword'];
      view.setRotation(flipped ? Math.PI - pose : pose);
      view.setFlipY(flipped);
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
  private wallViews(width: number, height: number, lineColor: number, exitY?: number): Phaser.GameObjects.GameObject[] {
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
    const span = width - WALL * 2;
    const bands: Phaser.GameObjects.TileSprite[] = [
      this.add.tileSprite(width / 2, WALL / 2, span, WALL, 'tile-wall'),
      this.add.tileSprite(width / 2, height - WALL / 2, span, WALL, 'tile-wall').setFlipY(true),
      this.add.tileSprite(WALL / 2, height / 2, height, WALL, 'tile-wall').setAngle(90).setFlipY(true),
    ];

    // 오른쪽 벽은 출구 자리에서 끊는다. 통로가 벽 위에 얹힌 물체가 아니라
    // 벽이 뚫린 자리로 보이려면, 그 구간에 벽을 그리지 않아야 한다.
    if (exitY === undefined) {
      bands.push(this.add.tileSprite(width - WALL / 2, height / 2, height, WALL, 'tile-wall').setAngle(90));
    } else {
      const top = exitY - EXIT_SIZE / 2;
      const bottom = height - (exitY + EXIT_SIZE / 2);
      if (top > 0) bands.push(this.add.tileSprite(width - WALL / 2, top / 2, top, WALL, 'tile-wall').setAngle(90));
      if (bottom > 0) {
        bands.push(
          this.add.tileSprite(width - WALL / 2, height - bottom / 2, bottom, WALL, 'tile-wall').setAngle(90),
        );
      }
    }
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

  private createEnemyEntity(kind: Enemy['kind'], x: number, y: number): EnemyEntity {
    const enemy = createEnemy(kind, x, y);
    const stats = ENEMY_STATS[enemy.kind];

    return {
      state: enemy,
      view: this.spriteOrShape(ENEMY_SPRITE[enemy.kind], enemy.x, enemy.y, stats.radius * 2, stats.color),
      hpBar: this.add.rectangle(enemy.x, enemy.y - stats.radius - 9, stats.radius * 2, 4, 0x6ee7a8).setDepth(6),
      statusDots: STATUS_ORDER.map((status, index) =>
        this.add
          .rectangle(enemy.x + (index - 1.5) * 9, enemy.y - stats.radius - 16, 5, 5, STATUS_COLORS[status])
          .setDepth(6)
          .setVisible(false),
      ),
    };
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

  /**
   * 방을 정리하면 출구가 열린다. 바로 넘어가지 않고 걸어 나가야 한다.
   * 마지막 방(최종 보스)만 보상 연출을 잠시 보여준 뒤 승리로 간다.
   */
  private checkRoomCleared(): void {
    if (this.run.phase !== 'combat' || this.exitOpen || this.resultScheduled) return;
    if (this.enemies.some((e) => isAlive(e.state))) return;
    if (this.rewardDrops.some((drop) => !drop.collected)) return;

    if (this.run.roomIndex >= TOTAL_ROOMS - 1) {
      this.resultScheduled = true;
      this.run = clearRoom(this.run);
      this.saveCurrentProgress();
      this.time.delayedCall(1200, () => this.showResult(true));
      if (DEBUG_ENABLED) this.publishDebug();
      return;
    }

    const room = ROOMS[this.run.roomIndex];
    this.exitOpen = true;
    tintView(this.exit, COLORS.accent);
    this.exitLabel.setText(room?.entersTown ? '마을 →' : '출구 →');
    this.tweens.add({ targets: this.exit, alpha: 0.55, duration: 500, yoyo: true, repeat: -1 });
  }

  /** 열린 출구에 닿으면 다음 방으로 넘어간다. */
  private checkExitReached(): void {
    if (this.run.phase !== 'combat') return;
    if (!this.exitOpen) return;
    if (Math.abs(this.player.x - this.exit.x) > WALL + PLAYER_RADIUS) return;
    if (Math.abs(this.player.y - this.exit.y) > EXIT_SIZE / 2 + PLAYER_RADIUS) return;

    this.exitOpen = false;
    this.run = clearRoom(this.run);
    this.saveCurrentProgress();

    if (this.run.phase === 'town') this.enterTownRoom();
    else this.enterRoom();

    if (DEBUG_ENABLED) this.publishDebug();
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
    if (this.run.phase === 'town') {
      if (this.overlay) {
        if (DEBUG_ENABLED) this.publishDebug();
        return;
      }
      const dt = delta / 1000;
      this.movePlayer(dt);
      this.updateAim();
      this.updateComboRings();
      this.updateTownNpcPrompt();
      this.updateMinimap();
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
    this.updateComboRings();
    this.updateComboText();
    this.updateArcaneAura();
    this.updateOffscreenMarks();
    this.updateMinimap();
    this.updateLore();
    this.updateRewardDropPrompt();
    if (DEBUG_ENABLED) this.publishDebug();
    this.updateAreas(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateEnemyShots(dt);
    this.checkRoomCleared();
    this.checkExitReached();
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
      comboSkill: {
        left: this.canUseComboSkill(this.left),
        right: this.right ? this.canUseComboSkill(this.right) : false,
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
      // 강화기술을 아직 못 얻은 무기는 게이지가 차도 발동하지 않는다.
      // 링만 준비 완료로 돌면 배지의 `잠김`과 서로 다른 말을 하게 된다.
      const ready = this.canUseComboSkill(runtime);
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
          this.hitPlayer(isBossKind(enemy.kind) ? bossContactDamage(enemy) : stats.contactDamage);
          if (this.run.phase === 'lost') {
            this.showResult(false);
            if (DEBUG_ENABLED) this.publishDebug();
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
      this.hitPlayer(damage);
      if (this.run.phase === 'lost') this.showResult(false);
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
          this.showResult(false);
          if (DEBUG_ENABLED) this.publishDebug();
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

  private hitPlayer(amount: number): void {
    const shieldActive = this.shieldProtectionActive();
    const damage = this.guardedPlayerDamage(amount);
    const before = this.run;
    this.run = applyPlayerDamage(this.run, damage, shieldActive);
    if (this.run === before) return;

    if (damage < amount) this.showShieldGuardFeedback(amount - damage);
    playSfx('playerHit');
    this.flashPlayer();
    this.refreshHud();
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
      dot.setVisible(hasStatus(enemy, kind));
      dot.setPosition(enemy.x + (index - 1.5) * 9, enemy.y - radius - 16);
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
        this.combo = sustainCombo(this.combo, owner.hand, resolveFor(this.run.loadout, owner.weapon.basic).stats);
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
      this.run = addKill(this.run);
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
    const reward = newPartsOfReward(this.run.progress, ROOMS[this.run.roomIndex]?.reward);
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

  private rewardItems(reward: RoomReward): Array<Pick<RewardDrop, 'reward' | 'label' | 'color'>> {
    return [
      ...(reward.weapons ?? []).map((id) => {
        const weapon = weaponOf(id);
        return { reward: { weapons: [id] }, label: weapon.name, color: weapon.color };
      }),
      ...(reward.comboSkills ?? []).map((id) => {
        const skill = findSkill(id);
        return { reward: { comboSkills: [id] }, label: skill?.name ?? id, color: BOSS_PATTERN_COLOR };
      }),
      ...(reward.supports ?? []).flatMap((id) => {
        const support = findSupport(id);
        return support ? [{ reward: { supports: [id] }, label: support.name, color: COLORS.accent }] : [];
      }),
    ];
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
    floatingText(this, this.player.x, this.player.y - PLAYER_RADIUS - 12, `${drop.label} 획득`, COLORS.accentText);
    this.showPendingHint(drop);

    drop.marker.destroy();
    drop.glow.destroy();
    drop.prompt.destroy();
    this.rewardDrops = this.rewardDrops.filter((item) => item !== drop);
    this.refreshHud();
    if (DEBUG_ENABLED) this.publishDebug();
  }

  /**
   * 지금은 아직 쓸 수 없는 보상이라는 것을 알린다.
   *
   * 1번 방 보상은 무엇을 주든 2번 방에서 쓸 수 없다. 보조형스킬 장착도 R링 교체도
   * 마을에서 열리는데 마을은 첫 보스 뒤에 나오기 때문이다. 전에는 강화기술만 예외라
   * 주우면 바로 나갔는데, 콤보가 `콤보 개방`을 요구하게 되면서 그 예외가 사라졌다.
   *
   * 예치되는 것 자체는 이상하지 않다. 첫 마을이 게임이 열리는 순간이고 이 드랍은 거기서
   * 조립할 재료다. 문제는 **주웠는데 아무 일도 안 일어난 이유를 모른다**는 것이라,
   * 언제 쓸 수 있는지를 말해준다.
   */
  private showPendingHint(drop: RewardDrop): void {
    const pending = (drop.reward.comboSkills ?? []).filter((id) => {
      const weapon = WEAPON_IDS.map(weaponOf).find((w) => w.combo.id === id);
      // 그 무기에 `콤보 개방`이 붙어 있으면 바로 쓸 수 있으므로 안내하지 않는다.
      return weapon ? comboRulesOf(resolveFor(this.run.loadout, weapon.basic).behaviors).length === 0 : false;
    });
    if (!pending.length) return;

    floatingText(
      this,
      this.player.x,
      this.player.y - PLAYER_RADIUS - 34,
      '콤보 개방을 붙이면 쓸 수 있다',
      COLORS.textDim,
    );
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

  private buildHud(): void {
    const barBack = this.add.rectangle(screenX(24), screenY(26), 240, 14, 0x2a2f42).setOrigin(0, 0.5).setDepth(19);
    this.hpBarFill = this.add.rectangle(screenX(24), screenY(26), 240, 14, 0x6ee7a8).setOrigin(0, 0.5).setDepth(20);
    this.shieldBarBack = this.add.rectangle(screenX(24), screenY(44), 240, 10, 0x20263a).setOrigin(0, 0.5).setDepth(19);
    this.shieldBarFill = this.add.rectangle(screenX(24), screenY(44), 240, 10, 0x7dd3fc).setOrigin(0, 0.5).setDepth(20);
    this.hud = this.add
      .text(screenX(24), screenY(58), '', { fontSize: '14px', color: COLORS.text, lineSpacing: 3 })
      .setDepth(20);
    this.comboBadges = {
      left: this.createComboBadge(screenX(VIEW_WIDTH / 2 - 142), screenY(VIEW_HEIGHT - 54), '왼손'),
      right: this.createComboBadge(screenX(VIEW_WIDTH / 2 + 142), screenY(VIEW_HEIGHT - 54), '오른손'),
    };

    const hint = this.add
      .text(screenX(VIEW_WIDTH - 24), screenY(20), 'WASD 이동 · 좌클릭 왼손 · 우클릭/Shift 오른손 · Space 대시 · R 무기 교체 · P 메뉴', {
        fontSize: '13px',
        color: COLORS.textDim,
      })
      .setOrigin(1, 0)
      .setDepth(20);

    // 카메라가 방을 따라 움직여도 HUD는 화면에 붙어 있어야 한다.
    pinToScreen(
      barBack,
      this.hpBarFill,
      this.shieldBarBack,
      this.shieldBarFill,
      this.hud,
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
      .rectangle(x, y, 260, 66, 0x0a0b0f, 0.74)
      .setStrokeStyle(1, 0x2a2f42)
      .setDepth(20);
    const title = this.add
      .text(x - 112, y - 24, hand, { fontSize: '13px', color: COLORS.textDim, fontStyle: 'bold' })
      .setOrigin(0, 0.5)
      .setDepth(21);
    const value = this.add
      .text(x + 112, y - 8, '', { fontSize: '32px', color: COLORS.text, fontStyle: 'bold' })
      .setOrigin(1, 0.5)
      .setDepth(21);
    const timer = this.add.rectangle(x - 112, y + 23, 224, 4, COLORS.accent, 0.7).setOrigin(0, 0.5).setDepth(21);
    const pips = Array.from({ length: COMBO_REQUIRED }, (_, index) =>
      this.add.rectangle(x - 112 + index * 24, y + 3, 18, 16, 0x2a2f42, 0.9).setOrigin(0, 0.5).setDepth(21),
    );

    return { back, title, value, timer, pips };
  }

  private comboBadgeObjects(
    badge: ComboBadge,
  ): (Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Visible)[] {
    return [badge.back, badge.title, badge.value, badge.timer, ...badge.pips];
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
    this.hpBarFill.width = (240 * this.run.hp) / this.run.maxHp;
    this.shieldBarBack.setVisible(shieldVisible).setAlpha(shieldActive ? 0.95 : 0.35);
    this.shieldBarFill.width = (240 * this.run.shieldEnergy) / SHIELD_ENERGY_MAX;
    this.shieldBarFill.setVisible(shieldVisible).setAlpha(shieldActive ? 1 : 0.45);

    const hands = describeByHand(this.run.loadout);
    this.hud.setText(
      [
        `체력 ${Math.ceil(this.run.hp)} / ${this.run.maxHp}`,
        ...(shieldVisible ? [`보호막 ${Math.ceil(this.run.shieldEnergy)} / ${SHIELD_ENERGY_MAX}`] : []),
        inTown ? `마을   NPC 근처 F 대화   오른쪽 출구로 이동` : `${wave?.label ?? '-'} (${this.run.roomIndex + 1}/${TOTAL_ROOMS})   남은 적 ${remaining}   처치 ${this.run.kills}`,
        ...hands.map(
          (h) => `${h.hand} ${h.weapon}` + (h.lines.length ? `   ${h.lines.join('  ·  ')}` : ''),
        ),
        ...(this.exitOpen && !inTown ? ['방을 정리했다. 출구로 이동 →'] : []),
      ].join('\n'),
    );
    this.updateComboText();
  }

  private updateComboText(): void {
    this.updateComboBadge(this.comboBadges.left, this.left);
    this.updateComboBadge(this.comboBadges.right, this.right);
  }

  private updateComboBadge(badge: ComboBadge, runtime: WeaponRuntime | null): void {
    // 콤보를 쓰지 않는 무기는 배지 자체를 숨긴다. 콤보를 읽는 연계를 안 붙였으면
    // 수치가 돌지 않으므로 0으로 굳은 눈금을 보여줄 이유가 없다.
    const visible = runtime !== null && this.usesCombo(runtime);
    for (const object of this.comboBadgeObjects(badge)) object.setVisible(visible);
    if (!runtime || !visible) return;

    const hand = runtime.hand;
    const count = comboOf(this.combo, hand);
    const unlocked = hasComboSkill(this.run.progress, runtime.weapon.combo.id);
    const firing = this.canUseComboSkill(runtime);
    const more = empowerMore(this.empower, hand);

    // 지금 무슨 일이 일어나고 있는지를 한 단어로 알린다.
    // 강화가 강화기술보다 앞이다. 배율이 붙은 순간이 더 짧고 놓치기 쉽다.
    const [label, color] = more > 0
      ? [`강화 +${Math.round(more * 100)}%`, COLORS.accent]
      : firing
        ? ['발동', COLORS.accent]
        : unlocked
          ? [`${count}`, runtime.weapon.color]
          : ['잠김', runtime.weapon.color];
    const lit = more > 0 || firing;

    badge.back.setStrokeStyle(lit ? 2 : 1, color, lit ? 0.95 : 0.55);
    badge.title.setText(`${hand === 'left' ? '왼손' : '오른손'} ${runtime.weapon.name}   합계 ${comboTotal(this.combo)}`);
    badge.value.setText(label);
    badge.value.setColor(lit ? COLORS.accentText : '#ffffff');

    for (const [index, pip] of badge.pips.entries()) {
      const filled = index < count;
      pip.setFillStyle(filled ? color : 0x2a2f42, filled ? 0.95 : 0.9);
    }

    const duration = resolveFor(this.run.loadout, runtime.weapon.basic).stats.comboDuration ?? 5;
    const ratio = count > 0 ? Phaser.Math.Clamp(this.combo.remaining / duration, 0, 1) : 0;
    badge.timer.width = 224 * ratio;
    badge.timer.setFillStyle(color, lit ? 0.9 : 0.65);
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
        .text(104, VIEW_HEIGHT - 162, '그 장갑은 네가 지나온 싸움을 기억한다.\n나가기 전에, 어떤 형태를 손에 남길지 정해 두어라.', {
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

  private showTown(): void {
    if (this.overlay) this.closeOverlay();

    const container = this.add.container(0, 0).setDepth(30);
    this.clearTransientOverlays();
    pinContainer(this, container);

    // 패널이 화면보다 작아서 뒤로 HUD 글자가 비쳐 읽혔다. 전체를 덮는 막을 먼저 깐다.
    container.add(this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH, VIEW_HEIGHT, 0x05060a, 0.92));
    container.add(
      this.add
        .rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH - 116, VIEW_HEIGHT - 82, 0x0a0b0f, 0.94)
        .setStrokeStyle(2, 0x3a4059, 0.95),
    );
    container.add(
      this.add
        .text((VIEW_WIDTH / 2), 74, '마을 관리인', {
          fontSize: '34px',
          color: COLORS.text,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    container.add(
      this.add
        .text((VIEW_WIDTH / 2), 116, '장갑이 기억한 무기와 강화기술을 여기서 정리해 두게.', {
          fontSize: '16px',
          color: COLORS.textDim,
        })
        .setOrigin(0.5),
    );

    // 획득 내역은 적지 않는다. 바닥 드랍에 가까이 갔을 때 이미 알렸고,
    // 여기서 또 띄우면 이미 받은 것을 시스템이 다시 알리는 표시가 된다.
    const unlocked = this.run.progress.unlockedWeapons.map((id) => weaponOf(id).name).join(' / ');
    container.add(
      this.add
        .text((VIEW_WIDTH / 2), 162, [`보유 무기: ${unlocked}`, `전투 중 R링 교체 가능`].join('\n'), {
          fontSize: '15px',
          color: COLORS.text,
          align: 'center',
          lineSpacing: 4,
          wordWrap: { width: VIEW_WIDTH - 180 },
        })
        .setOrigin(0.5),
    );

    this.renderManifestationPanel(container);
    this.renderWheelSetupPanel(container);

    container.add(
      this.add
        .text((VIEW_WIDTH / 2), VIEW_HEIGHT - 48, 'R 닫기   ·   오른쪽 출구로 다음 전투', {
          fontSize: '17px',
          color: COLORS.accentText,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    this.overlay = container;
    this.overlayKind = 'town-config';
    this.refreshHud();
  }

  private renderManifestationPanel(container: Phaser.GameObjects.Container): void {
    const startX = 98;
    const startY = 286;
    const rowHeight = 58;
    const column = {
      weapon: startX,
      combo: startX + 170,
      primary: startX + 410,
      synergy: startX + 660,
    };

    container.add(this.add.text(startX, startY - 42, '실체화 장비 설정', { fontSize: '21px', color: COLORS.text, fontStyle: 'bold' }));
    container.add(this.add.text(column.weapon, startY - 14, '무기', { fontSize: '13px', color: COLORS.textDim }));
    container.add(this.add.text(column.combo, startY - 14, '강화기술', { fontSize: '13px', color: COLORS.textDim }));
    container.add(this.add.text(column.primary, startY - 14, '보조', { fontSize: '13px', color: COLORS.textDim }));
    container.add(this.add.text(column.synergy, startY - 14, '연계', { fontSize: '13px', color: COLORS.textDim }));

    for (const [index, weaponId] of this.run.progress.unlockedWeapons.entries()) {
      const weapon = weaponOf(weaponId);
      const config = this.run.progress.configs[weaponId];
      const y = startY + 24 + index * rowHeight;
      const comboName = findSkill(config.comboSkillId)?.name ?? weapon.combo.name;
      const primary = config.primarySupportId ? findSupport(config.primarySupportId) : undefined;
      const synergy = config.synergySupportId ? findSupport(config.synergySupportId) : undefined;
      const primaryCandidates = this.supportCandidates(weapon.combo, 'primary');
      const synergyCandidates = this.supportCandidates(weapon.combo, 'synergy');

      container.add(this.add.text(column.weapon, y, weapon.name, { fontSize: '18px', color: COLORS.text, fontStyle: 'bold' }).setOrigin(0, 0.5));
      container.add(this.add.text(column.combo, y, comboName, { fontSize: '16px', color: COLORS.text }).setOrigin(0, 0.5));
      this.addSlotButton(container, column.primary, y, this.supportSlotLabel(weapon.combo, primary, primaryCandidates), primaryCandidates.length > 0, () => {
        this.cycleSupport(weaponId, 'primarySupportId', primaryCandidates);
      });
      this.addSlotButton(container, column.synergy, y, this.supportSlotLabel(weapon.combo, synergy, synergyCandidates), synergyCandidates.length > 0, () => {
        this.cycleSupport(weaponId, 'synergySupportId', synergyCandidates);
      });
    }
  }

  private supportSlotLabel(skill: Skill, current: Support | undefined, candidates: readonly Support[]): string {
    // 이 칸에 넣을 수 있는 후보가 하나도 없으면 `비어 있음`만 남는다.
    // 왜 비었는지 말해주지 않으면 기능이 고장 난 것처럼 읽힌다.
    if (candidates.length === 0) return '아직 없음\n보스 드랍으로 얻는다';

    const currentIndex = current ? candidates.findIndex((support) => support.id === current.id) : -1;
    const counter = ` (${currentIndex >= 0 ? currentIndex + 1 : 0}/${candidates.length})`;
    if (!current) return `비어 있음${counter}`;
    const preview = this.supportPreview(skill, current);
    return `${current.name}${counter}\n${preview || this.shortSupportSummary(current)}`;
  }

  private supportPreview(skill: Skill, support: Support): string {
    const before = resolveSkill(skill, []).stats;
    const after = resolveSkill(skill, [support]).stats;
    const pairs: [Stat, string][] = [
      ['projectileCount', '투사체'],
      ['areaRadius', '반경'],
      ['duration', '지속'],
      ['tickInterval', '틱'],
      ['damage', '피해'],
      ['projectileSpeed', '속도'],
      ['comboGain', '콤보'],
    ];

    for (const [stat, label] of pairs) {
      const from = before[stat];
      const to = after[stat];
      if (from === undefined || to === undefined || Math.abs(from - to) < 0.001) continue;
      return `${label} ${this.formatStat(from)}→${this.formatStat(to)}`;
    }
    const behavior = support.behaviors?.find((item) => item.kind === 'statusDamage');
    if (behavior?.kind === 'statusDamage') return `상태 대상 피해 +${Math.round(behavior.more * 100)}%`;
    const pierce = support.behaviors?.find((item) => item.kind === 'pierce');
    if (pierce?.kind === 'pierce') return pierce.count === 'all' ? '모든 대상 관통' : `관통 +${pierce.count}`;
    const chain = support.behaviors?.find((item) => item.kind === 'chain');
    if (chain?.kind === 'chain') return `연쇄 +${chain.count}`;
    const fork = support.behaviors?.find((item) => item.kind === 'fork');
    if (fork?.kind === 'fork') return `갈래 +${fork.count}`;
    const ricochet = support.behaviors?.find((item) => item.kind === 'ricochet');
    if (ricochet?.kind === 'ricochet') return `튕김 +${ricochet.count}`;
    return '';
  }

  private shortSupportSummary(support: Support): string {
    if (support.tags.includes('지대')) return '지대 성질 변경';
    if (support.tags.includes('투사체')) return '투사체 성질 변경';
    return '스킬 성능 변경';
  }

  private formatStat(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  private supportCandidates(skill: Skill, slot: 'primary' | 'synergy'): Support[] {
    return this.run.progress.ownedSupports.flatMap((id) => {
      const support = findSupport(id);
      if (!support) return [];
      if (supportSlotType(support) !== slot) return [];
      return canAttach(skill, support).ok ? [support] : [];
    });
  }

  private addSlotButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    enabled: boolean,
    onClick: () => void,
  ): { rect: Phaser.GameObjects.Rectangle; width: number; height: number } {
    const width = 220;
    const height = 48;
    const fill = enabled ? 0x242a3a : 0x171923;
    const stroke = enabled ? COLORS.accent : 0x3a4059;
    const rect = this.add
      .rectangle(x, y, width, height, fill, 0.92)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, stroke, enabled ? 0.75 : 0.35);
    const text = this.add
      .text(x + 14, y, label, {
        fontSize: label.includes('\n') ? '13px' : '15px',
        color: enabled ? COLORS.text : COLORS.textDim,
        lineSpacing: 2,
        wordWrap: { width: width - 28 },
      })
      .setOrigin(0, 0.5);

    if (enabled) {
      rect.setInteractive({ useHandCursor: true });
      text.setInteractive({ useHandCursor: true });
      rect.on('pointerover', () => rect.setFillStyle(0x2e3650, 0.96));
      rect.on('pointerout', () => rect.setFillStyle(fill, 0.92));
      rect.on('pointerdown', onClick);
      text.on('pointerover', () => rect.setFillStyle(0x2e3650, 0.96));
      text.on('pointerout', () => rect.setFillStyle(fill, 0.92));
      text.on('pointerdown', onClick);
    }

    container.add(rect);
    container.add(text);
    return { rect, width, height };
  }

  private cycleSupport(weapon: WeaponId, slot: 'primarySupportId' | 'synergySupportId', candidates: readonly Support[]): void {
    const current = this.run.progress.configs[weapon][slot];
    const ids = [null, ...candidates.map((support) => support.id)] as const;
    const nextId = ids[(ids.indexOf(current) + 1) % ids.length] ?? null;
    const progress = configureManifestation(this.run.progress, weapon, { [slot]: nextId });

    this.run = {
      ...this.run,
      progress,
      loadout: loadoutFromProgress(progress, this.run.loadout),
    };
    this.saveCurrentProgress();
    this.refreshHud();
    this.reopenTownOverlay();
  }

  private renderWheelSetupPanel(container: Phaser.GameObjects.Container): void {
    const y = VIEW_HEIGHT - 132;
    const startX = 98;
    container.add(this.add.text(startX, y - 38, 'R링 무기 후보', { fontSize: '20px', color: COLORS.text, fontStyle: 'bold' }));

    this.addWheelSlotButton(container, startX, y + 18, '왼손 1', this.run.progress.wheel.left[0], 'left', 0);
    this.addWheelSlotButton(container, startX + 240, y + 18, '왼손 2', this.run.progress.wheel.left[1], 'left', 1);
    this.addWheelSlotButton(container, startX + 500, y + 18, '오른손 1', this.run.progress.wheel.right[0], 'right', 0);
    this.addWheelSlotButton(container, startX + 740, y + 18, '오른손 2', this.run.progress.wheel.right[1], 'right', 1);
  }

  private addWheelSlotButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    weapon: WheelSlot,
    hand: Hand,
    index: 0 | 1,
  ): void {
    const equipped = Boolean(weapon) && this.run.progress.active[hand] === weapon;
    const { rect, width } = this.addSlotButton(
      container,
      x,
      y,
      `${label}\n${weapon ? weaponOf(weapon).name : '비어 있음'}`,
      true,
      () => this.cycleWheelSlot(hand, index),
    );

    // 지금 손에 들려 있는 후보는 테두리와 배경으로 구분한다.
    // `장착 중`이라는 글자만으로는 눈에 들어오지 않는다.
    if (equipped) {
      rect.setStrokeStyle(3, COLORS.accent, 1);
      rect.setFillStyle(0x2b3350, 0.96);
      container.add(
        this.add
          .text(x + width - 12, y - 15, '장착 중', { fontSize: '12px', color: COLORS.accentText, fontStyle: 'bold' })
          .setOrigin(1, 0.5),
      );
    }

    // 무기 그림을 슬롯 안에 넣는다. 이름만 바뀌면 클릭이 먹혔는지 알기 어렵다.
    if (weapon && this.textures.exists(WEAPON_SPRITE[weapon])) {
      const icon = this.add.image(x + width - 34, y + 6, WEAPON_SPRITE[weapon]).setOrigin(0.5);
      icon.setScale(38 / Math.max(icon.width, icon.height));
      container.add(icon);
    }
  }

  private cycleWheelSlot(hand: Hand, index: 0 | 1): void {
    const current = this.run.progress.wheel[hand][index];
    const candidates: WheelSlot[] = [null, ...this.wheelCandidatesForHand(hand)];
    const next = candidates[(candidates.indexOf(current) + 1) % candidates.length] ?? null;
    // 1번 칸을 바꾸면 손에 드는 무기가 바뀐다. 마을을 나갈 때까지 미루면 패널에는
    // `왼손 1: 방패`라고 떠 있는데 캐릭터는 검을 든 채로 남아 설정과 화면이 어긋난다.
    const progress = equipFirstWheelSlots(setWheelSlot(this.run.progress, hand, index, next));

    this.run = {
      ...this.run,
      progress,
      loadout: loadoutFromProgress(progress, this.run.loadout),
    };
    this.saveCurrentProgress();
    this.syncWeaponRuntimes();
    this.refreshHud();
    this.reopenTownOverlay();
  }

  private wheelCandidatesForHand(hand: Hand): WeaponId[] {
    const preferred: readonly WeaponId[] = hand === 'left'
      ? ['sword', 'shield', 'bow', 'arcane']
      : ['bow', 'arcane', 'shield', 'sword'];
    return preferred.filter((weapon) => this.run.progress.unlockedWeapons.includes(weapon));
  }

  private saveCurrentProgress(): void {
    if (!this.persistProgress) return;
    saveProgress(this.run.progress);
  }

  private reopenTownOverlay(): void {
    this.closeOverlay();
    this.time.delayedCall(0, () => this.showTown());
  }

  /**
   * 오버레이를 치운다.
   *
   * **카드의 클릭 핸들러 안에서 그 카드를 바로 파괴하면 안 된다.** Phaser가 아직
   * 그 포인터 이벤트를 처리하는 중이라 입력 플러그인이 죽은 오브젝트를 붙들게 되고,
   * 그 뒤로 클릭이 먹지 않는다. 화면에서 즉시 감추고 파괴는 다음 틱으로 미룬다.
   */
  private closeOverlay(): void {
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
          'P 이어하기\nR 이 판만 다시 시작 (해금 유지)\nShift+R 기록 지우고 처음부터',
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
        .text((VIEW_WIDTH / 2), (VIEW_HEIGHT / 2) - 90, won ? '승리' : '패배', {
          fontSize: '56px',
          color: won ? '#6ee7a8' : '#ff6b6b',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    const hands = describeByHand(this.run.loadout);
    // 방의 보상이 아니라 이번 판에서 실제로 새로 얻은 것만 적는다.
    const reward = won ? this.run.gained : undefined;
    container.add(
      this.add
        .text(
          (VIEW_WIDTH / 2),
          (VIEW_HEIGHT / 2) - 10,
          [
            this.right ? `${this.left.weapon.name} + ${this.right.weapon.name}` : `${this.left.weapon.name}`,
            `처치 ${this.run.kills}   시간 ${this.run.elapsed.toFixed(1)}초`,
            hands.map((h) => `${h.hand} ${h.weapon}` + (h.lines.length ? ` — ${h.lines.join(', ')}` : '')).join('\n'),
            ...this.rewardLines(reward, '이번 판에서 얻은 것'),
          ].join('\n'),
          { fontSize: '16px', color: COLORS.text, align: 'center', lineSpacing: 8, wordWrap: { width: VIEW_WIDTH - 180 } },
        )
        .setOrigin(0.5),
    );
    container.add(
      this.add
        .text((VIEW_WIDTH / 2), (VIEW_HEIGHT / 2) + 90, 'R 키로 다시 시작\nShift+R 기록 지우고 처음부터', {
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

    const comboSkills = reward.comboSkills?.map((id) => findSkill(id)?.name ?? id) ?? [];
    if (comboSkills.length) lines.push(`강화기술: ${comboSkills.join(' / ')}`);

    const supports = reward.supports?.flatMap((id) => {
      const support = findSupport(id);
      return support ? [support.name] : [];
    }) ?? [];
    if (supports.length) lines.push(`보조형: ${supports.join(' / ')}`);

    return lines.length > 1 ? lines : [];
  }
}
