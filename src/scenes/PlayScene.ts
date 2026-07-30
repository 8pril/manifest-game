import Phaser from 'phaser';
import { applyRenderScale, followInRoom, pinToScreen, screenX, screenY, VIEW_WIDTH, VIEW_HEIGHT } from '@/render';
import { ring, flash, floatingText, impact, hitSpark, deathBurst } from '@/effects';
import { publishDebugState, DEBUG_ENABLED } from '@/debug';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, STATUS_COLORS } from '@/config';
import { SUPPORTS } from '@/data/supports';
import { deliveryOf, type Weapon, type WeaponId } from '@/data/weapons';
import type { Skill } from '@/engine/support';
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
  WOUND_BURST_DAMAGE,
  consumeWound,
  WOUND_CONSUME_PER_STACK,
  ARCANE_FLOW_MORE,
  ARCANE_FLOW_DURATION,
  type StatusKind,
} from '@/engine/status';
import {
  ENEMY_STATS,
  createEnemy,
  enemySpeed,
  isAlive,
  resetEnemyIds,
  desiredDirection,
  readyToFire,
  markFired,
  type Enemy,
} from '@/game/enemy';
import { ROOMS, TOTAL_ROOMS } from '@/game/rooms';
import { loreFor, LORE_RADIUS } from '@/data/lore';
import { rollOffer, type OfferItem } from '@/game/offer';
import { leftWeapon, rightWeapon, resolveFor, describeByHand, handOf } from '@/game/loadout';
import { createCombo, gainCombo, sustainCombo, tickCombo, isComboReady, COMBO_REQUIRED, type ComboState } from '@/game/combo';
import { createRun, clearRoom, pickSupport, damagePlayer, addKill, advanceTime, type RunState } from '@/game/run';

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
/** 선택 창이 뜰 때의 페이드인(ms). 입력은 처음부터 받는다. */
const OFFER_FADE_MS = 140;

interface EnemyEntity {
  state: Enemy;
  view: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
  statusDots: Phaser.GameObjects.Rectangle[];
}

interface ProjectileEntity {
  state: Projectile;
  view: Phaser.GameObjects.Arc;
  /** 이 투사체를 쏜 무기. 명중 시 콤보와 상태이상을 누구에게 귀속할지 결정한다. */
  weapon: Weapon;
  /** 기본 공격인지. 상태이상은 기본 공격 명중에서만 부여된다. */
  basic: boolean;
}

interface WeaponRuntime {
  weapon: Weapon;
  combo: ComboState;
  readyAt: number;
  /** 발동 스킬이 다시 나갈 수 있는 시각. */
  comboReadyAt: number;
}

/** 한 판의 전투 화면. 진행 규칙과 승패 판정은 game/run.ts가 갖는다. */
export class PlayScene extends Phaser.Scene {
  private run!: RunState;
  private left!: WeaponRuntime;
  private right!: WeaponRuntime;

  private player!: Phaser.GameObjects.Arc;
  private aimLine!: Phaser.GameObjects.Line;
  private enemies: EnemyEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  /** 지대는 어느 무기가 만들었는지 함께 들고 있는다. 지속피해로도 콤보가 유지되게 하기 위함이다. */
  private areas: { state: Area; view: Phaser.GameObjects.Arc; owner: WeaponRuntime | null }[] = [];
  /** 적이 쏜 투사체. 플레이어 투사체와 충돌 대상이 반대라 따로 관리한다. */
  private enemyShots: { state: Projectile; view: Phaser.GameObjects.Arc; damage: number }[] = [];

  private hud!: Phaser.GameObjects.Text;
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private comboText!: Phaser.GameObjects.Text;
  /** 콤보가 찼을 때 플레이어 주위에 도는 링. 손마다 하나씩. */
  private comboRings!: { left: Phaser.GameObjects.Arc; right: Phaser.GameObjects.Arc };
  /** 비전 흐름이 걸린 동안 플레이어를 감싸는 오라. 버프가 살아 있다는 유일한 표시다. */
  private arcaneAura!: Phaser.GameObjects.Arc;
  private overlay: Phaser.GameObjects.Container | null = null;

  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private dashUntil = 0;
  private dashReadyAt = 0;
  private dashAngle = 0;
  private arcaneFlowUntil = 0;
  private currentOffer: OfferItem[] = [];
  /** 규칙 발동 횟수. 개발 빌드 검증용이며 게임 로직에는 쓰이지 않는다. */
  private ruleEvents = { burst: 0, wallSlam: 0, brand: 0, woundConsume: 0 };
  /** 지금 고른 보조능력. 같은 카드를 한 번 더 눌러야 확정된다. */
  private selectedOffer: number | null = null;
  private offerCards: Phaser.GameObjects.Rectangle[] = [];
  /** 카드마다 '다시 눌러 결정' 안내. 고른 카드에만 뜬다. */
  private offerConfirmLabels: Phaser.GameObjects.Text[] = [];
  private weapons: { left: WeaponId; right: WeaponId } = { left: 'sword', right: 'bow' };
  /** 현재 방의 이동 가능 영역. 방마다 크기가 다르다. */
  private bounds = { minX: WALL, minY: WALL, maxX: GAME_WIDTH - WALL, maxY: GAME_HEIGHT - WALL };
  private exit!: Phaser.GameObjects.Rectangle;
  private exitLabel!: Phaser.GameObjects.Text;
  private roomFloor: Phaser.GameObjects.GameObject[] = [];
  /** 방을 정리해 출구가 열렸는지. */
  private exitOpen = false;
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
    mark: Phaser.GameObjects.Rectangle;
    plate: Phaser.GameObjects.Rectangle;
    text: Phaser.GameObjects.Text;
  }[] = [];
  private startRoomIndex = 0;

  constructor() {
    super('Play');
  }

  init(data: { left?: WeaponId; right?: WeaponId }): void {
    // 씬을 직접 열었을 때(개발용 ?scene=Play)를 위한 기본값.
    this.weapons = { left: data?.left ?? 'sword', right: data?.right ?? 'bow' };

    // 개발용: ?wave=2 로 특정 웨이브부터 시작한다.
    // 후반 웨이브를 확인할 때마다 앞 웨이브를 다시 클리어하지 않아도 되게 한다.
    const requested = Number(new URLSearchParams(location.search).get('wave'));
    this.startRoomIndex =
      Number.isFinite(requested) && requested >= 1 && requested <= TOTAL_ROOMS ? requested - 1 : 0;
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
    this.arcaneFlowUntil = 0;

    this.run = { ...createRun(this.weapons.left, this.weapons.right), roomIndex: this.startRoomIndex };
    this.left = { weapon: leftWeapon(this.run.loadout), combo: createCombo(), readyAt: 0, comboReadyAt: 0 };
    this.right = { weapon: rightWeapon(this.run.loadout), combo: createCombo(), readyAt: 0, comboReadyAt: 0 };


    this.player = this.add.circle(0, 0, PLAYER_RADIUS, COLORS.player).setDepth(10);
    this.aimLine = this.add.line(0, 0, 0, 0, 0, 0, COLORS.accent).setOrigin(0, 0).setLineWidth(2).setDepth(9);

    // 콤보가 차면 숫자를 읽지 않아도 알 수 있게 플레이어에 링을 띄운다.
    this.comboRings = {
      left: this.add.circle(0, 0, 32).setStrokeStyle(3, this.left.weapon.color).setDepth(11).setVisible(false),
      right: this.add.circle(0, 0, 40).setStrokeStyle(3, this.right.weapon.color).setDepth(11).setVisible(false),
    };

    this.arcaneAura = this.add
      .circle(0, 0, PLAYER_RADIUS + 9, BRAND_COLOR, 0.22)
      .setDepth(9)
      .setVisible(false);

    this.buildHud();
    this.bindInput();
    this.enterRoom();
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
    };

    keyboard.on('keydown-SPACE', () => this.tryDash());
    keyboard.on('keydown-R', () => this.scene.start('Select'));
    for (const [index, name] of ['ONE', 'TWO', 'THREE'].entries()) {
      keyboard.on(`keydown-${name}`, () => this.selectOffer(index));
    }
    keyboard.on('keydown-ENTER', () => this.confirmOffer());

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.run.phase !== 'combat') return;
      // 트랙패드에서는 두 손가락 탭이 꺼져 있거나 브라우저가 다르게 넘겨줄 수 있어
      // 눌린 버튼 상태와 이벤트의 버튼 번호를 모두 본다.
      const isRight = pointer.rightButtonDown() || pointer.button === 2;
      this.useWeapon(isRight ? this.right : this.left);
    });

    // 오른손 무기를 키로도 쓸 수 있게 한다.
    // 트랙패드에서 우클릭을 반복하는 것은 사실상 불가능하고,
    // 왼손이 WASD에 있으므로 새끼손가락으로 닿는 Shift가 가장 편하다.
    keyboard.on('keydown-SHIFT', () => {
      if (this.run.phase !== 'combat') return;
      this.useWeapon(this.right);
    });
  }

  private tryDash(): void {
    if (this.run.phase !== 'combat' || this.time.now < this.dashReadyAt) return;

    const direction = this.moveDirection();
    this.dashAngle = direction ? Math.atan2(direction.y, direction.x) : this.aimAngle();
    this.dashUntil = this.time.now + DASH_DURATION_MS;
    this.dashReadyAt = this.time.now + DASH_COOLDOWN_MS;
  }

  private aimAngle(): number {
    const pointer = this.input.activePointer;
    return Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
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

  private useWeapon(runtime: WeaponRuntime): void {
    if (this.time.now < runtime.readyAt) return;
    runtime.readyAt = this.time.now + runtime.weapon.cooldown;

    const angle = this.aimAngle();

    // 기본 공격은 언제나 나간다. 발동 스킬이 이를 대체하면 콤보 달성이
    // 보상이 아니라 손해가 된다. 멸검(지대 26/0.4초)이 베기(46/0.3초)를
    // 대체했을 때 웨이브 1도 넘기지 못하는 것을 측정으로 확인했다.
    this.useSkill(runtime, runtime.weapon.basic, angle, true);

    // 콤보가 유지되는 동안에는 발동 스킬이 자기 간격으로 함께 나간다.
    // 원안의 "n콤보 이상 시 전환"과 기획의 "추가효과가 계속 유지"를 합친 형태다.
    if (isComboReady(runtime.combo) && this.time.now >= runtime.comboReadyAt) {
      runtime.comboReadyAt = this.time.now + runtime.weapon.comboInterval;
      this.useSkill(runtime, runtime.weapon.combo, angle, false);
    }
    this.refreshHud();
  }

  /** 스킬 하나를 전달 방식에 맞게 내보낸다. */
  private useSkill(runtime: WeaponRuntime, skill: Skill, angle: number, basic: boolean): void {
    const resolved = resolveFor(this.run.loadout, skill);

    switch (deliveryOf(skill)) {
      case 'projectile':
        this.fireProjectiles(runtime.weapon, skill, resolved.stats, resolved.behaviors, angle, basic);
        break;
      case 'melee':
        this.swingMelee(runtime, skill, resolved.stats, angle, basic);
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
        view: this.add.circle(state.x, state.y, 7, weapon.color).setDepth(8),
        weapon,
        basic,
      });
    }
  }

  private swingMelee(
    runtime: WeaponRuntime,
    _skill: Skill,
    stats: ReturnType<typeof resolveFor>['stats'],
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
      this.enemies.filter((e) => isAlive(e.state)).map((e) => e.state),
    );

    for (const target of targets) {
      const entity = this.enemies.find((e) => e.state.id === target.id);
      if (!entity) continue;

      this.resolveHit(entity, stats.damage ?? 0, runtime.weapon, basic, runtime);
      this.pushEnemy(entity, stats.knockback ?? 0);
    }
  }

  /**
   * 적을 밀어낸다. 벽까지 밀리면 추가 피해와 확정 기절을 준다.
   * 방패의 정체성이 수치가 아니라 이 동작에서 나온다.
   */
  private pushEnemy(entity: EnemyEntity, distance: number): void {
    if (distance <= 0 || !isAlive(entity.state)) return;

    const radius = ENEMY_STATS[entity.state.kind].radius;
    const result = applyKnockback(
      { x: this.player.x, y: this.player.y },
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
      applyStatus(entity.state, 'fracture', Math.random, true);
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
    });
  }

  /** 명중 처리. 상태이상 부여, 약점 노출 증폭, 낙인 소비를 모두 여기서 한다. */
  private resolveHit(
    entity: EnemyEntity,
    rawDamage: number,
    weapon: Weapon,
    basic: boolean,
    runtime?: WeaponRuntime,
  ): void {
    const enemy = entity.state;
    let damage = rawDamage * incomingDamageMultiplier(enemy);

    // 평범한 명중에도 반응이 있어야 한다. 지금까지는 체력바만 줄었다.
    hitSpark(this, enemy.x, enemy.y, weapon.color);

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

        const radius = ENEMY_STATS[enemy.kind].radius;
        ring(this, enemy.x, enemy.y, BURST_COLOR, { to: radius * 2.4, duration: 280 });
        floatingText(this, enemy.x, enemy.y - radius - 12, `상처 소모 ${bonus}`, '#ffb4a2');
      }
    }

    if (basic) {
      // 낙인이 걸린 적을 비전으로 때리면 낙인을 소비하고 비전 흐름을 얻는다.
      if (weapon.id === 'arcane' && consumeBrand(enemy)) {
        this.arcaneFlowUntil = this.time.now + ARCANE_FLOW_DURATION * 1000;
        this.ruleEvents.brand++;
        ring(this, enemy.x, enemy.y, BRAND_COLOR, { to: 110, duration: 420 });
        floatingText(this, this.player.x, this.player.y - 24, '비전 흐름', '#c9a8ff');
      }

      const result = applyStatus(enemy, weapon.status);
      if (result.burst) {
        damage += WOUND_BURST_DAMAGE;
        this.ruleEvents.burst++;
        // 규칙상으로만 터지고 화면에는 아무것도 안 나오던 지점.
        const radius = ENEMY_STATS[enemy.kind].radius;
        ring(this, enemy.x, enemy.y, BURST_COLOR, { to: radius * 3.2 });
        flash(this, enemy.x, enemy.y, radius * 2.2, BURST_COLOR);
        // 플래시와 겹치지 않도록 적 위쪽에서 띄운다. 가장 읽혀야 할 순간이다.
        floatingText(this, enemy.x, enemy.y - radius - 12, `상처 폭발 ${WOUND_BURST_DAMAGE}`, '#ff9b9b');
      }

      if (runtime) {
        const stats = resolveFor(this.run.loadout, weapon.basic).stats;
        runtime.combo = gainCombo(runtime.combo, stats);
      }
    } else if (runtime) {
      // 발동 스킬 명중은 게이지를 올리지 않고 지속시간만 갱신한다.
      // 계속 맞혀야 발동 상태가 유지된다.
      runtime.combo = sustainCombo(runtime.combo, resolveFor(this.run.loadout, weapon.basic).stats);
    }

    this.damageEnemy(entity, damage);
  }

  // ───────────────────────── 방

  /** 방에 들어설 때. 크기를 잡고 바닥과 벽을 그린 뒤 적을 채운다. */
  private enterRoom(): void {
    const room = ROOMS[this.run.roomIndex];
    if (!room) return;

    for (const object of this.roomFloor) object.destroy();
    this.roomFloor = [];

    this.exitOpen = false;
    this.bounds = { minX: WALL, minY: WALL, maxX: room.width - WALL, maxY: room.height - WALL };
    // 방마다 크기가 다르므로 긴 변을 기준으로 맞춰 비율을 유지한다.
    this.minimapRoom = {
      width: room.width,
      height: room.height,
      scale: MINIMAP_MAX / Math.max(room.width, room.height),
    };

    const cx = room.width / 2;
    const cy = room.height / 2;
    this.roomFloor.push(
      this.add.grid(cx, cy, room.width, room.height, 64, 64, COLORS.background, 1, 0x1b1e2b, 1).setDepth(0),
      this.add
        .rectangle(cx, cy, room.width - WALL * 2, room.height - WALL * 2)
        .setStrokeStyle(3, 0x2a2f42)
        .setDepth(0),
    );

    // 출구는 오른쪽 벽 가운데. 방을 정리하기 전에는 닫혀 있다.
    this.exit = this.add.rectangle(room.width - WALL / 2, cy, WALL, EXIT_SIZE, 0x2a2f42).setDepth(1);
    this.exitLabel = this.add
      .text(room.width - WALL - 110, cy, '', { fontSize: '17px', color: COLORS.accentText, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2);
    this.roomFloor.push(this.exit, this.exitLabel);

    this.placeLore(room);

    // 플레이어는 왼쪽에서 들어온다.
    this.player.setPosition(WALL + 90, cy);
    followInRoom(this, this.player, room.width, room.height);

    for (const spawn of room.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        const at = this.edgeSpawnPoint();
        const enemy = createEnemy(spawn.kind, at.x, at.y);
        const stats = ENEMY_STATS[enemy.kind];

        const view = this.add.rectangle(enemy.x, enemy.y, stats.radius * 2, stats.radius * 2, stats.color).setDepth(5);
        const hpBar = this.add.rectangle(enemy.x, enemy.y - stats.radius - 9, stats.radius * 2, 4, 0x6ee7a8).setDepth(6);
        const statusDots = STATUS_ORDER.map((kind, index) =>
          this.add
            .rectangle(enemy.x + (index - 1.5) * 9, enemy.y - stats.radius - 16, 5, 5, STATUS_COLORS[kind])
            .setDepth(6)
            .setVisible(false),
        );

        this.enemies.push({ state: enemy, view, hpBar, statusDots });
      }
    }
    this.refreshHud();
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
      const mark = this.add.rectangle(x, y, 15, 15, 0x3a4059).setAngle(45).setDepth(1);
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
      note.mark.setFillStyle(near ? 0x6b7396 : 0x3a4059);
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
   * 마지막 방(보스)만 정리 즉시 승리로 간다.
   */
  private checkRoomCleared(): void {
    if (this.run.phase !== 'combat' || this.exitOpen) return;
    if (this.enemies.some((e) => isAlive(e.state))) return;

    if (this.run.roomIndex >= TOTAL_ROOMS - 1) {
      this.run = clearRoom(this.run, false);
      this.showResult(true);
      if (DEBUG_ENABLED) this.publishDebug();
      return;
    }

    this.exitOpen = true;
    this.exit.setFillStyle(COLORS.accent);
    this.exitLabel.setText('출구 →');
    this.tweens.add({ targets: this.exit, alpha: 0.55, duration: 500, yoyo: true, repeat: -1 });
  }

  /** 열린 출구에 닿으면 다음 방으로 넘어간다. */
  private checkExitReached(): void {
    if (!this.exitOpen) return;
    if (Math.abs(this.player.x - this.exit.x) > WALL + PLAYER_RADIUS) return;
    if (Math.abs(this.player.y - this.exit.y) > EXIT_SIZE / 2 + PLAYER_RADIUS) return;

    this.exitOpen = false;
    const room = ROOMS[this.run.roomIndex];
    this.run = clearRoom(this.run, room?.offersSupport ?? false);

    if (this.run.phase === 'offer') this.showOffer();
    else this.enterRoom();

    if (DEBUG_ENABLED) this.publishDebug();
  }

  // ───────────────────────── 갱신 루프

  update(_time: number, delta: number): void {
    if (this.run.phase !== 'combat') return;
    const dt = delta / 1000;

    this.run = advanceTime(this.run, dt);
    this.left.combo = tickCombo(this.left.combo, dt);
    this.right.combo = tickCombo(this.right.combo, dt);

    this.movePlayer(dt);
    this.updateAim();
    this.updateComboRings();
    this.updateArcaneAura();
    this.updateOffscreenMarks();
    this.updateMinimap();
    this.updateLore();
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
        })),
      combo: {
        left: this.left.combo.value,
        right: this.right.combo.value,
        required: COMBO_REQUIRED,
      },
      offerCount: this.currentOffer.length,
      exit: this.exitOpen ? { x: this.exit.x, y: this.exit.y } : null,
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
      const ready = isComboReady(runtime.combo);
      ring.setVisible(ready);
      if (!ready) continue;

      ring.setPosition(this.player.x, this.player.y);
      // 회전하는 대신 맥동시켜 준비 상태를 눈에 띄게 한다.
      const pulse = 1 + Math.sin(this.time.now / 110) * 0.12;
      ring.setScale(pulse);
    }
  }

  private updateAim(): void {
    const angle = this.aimAngle();
    this.aimLine.setTo(this.player.x, this.player.y, this.player.x + Math.cos(angle) * 44, this.player.y + Math.sin(angle) * 44);
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
        const direction = desiredDirection(enemy, { x: this.player.x, y: this.player.y });
        if (direction) {
          const step = enemySpeed(enemy) * dt;
          const radius = ENEMY_STATS[enemy.kind].radius;
          enemy.x = Phaser.Math.Clamp(enemy.x + direction.x * step, this.bounds.minX + radius, this.bounds.maxX - radius);
          enemy.y = Phaser.Math.Clamp(enemy.y + direction.y * step, this.bounds.minY + radius, this.bounds.maxY - radius);
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
          const before = this.run;
          this.run = damagePlayer(this.run, stats.contactDamage);

          if (this.run !== before) {
            this.flashPlayer();
            this.refreshHud();
          }
          if (this.run.phase === 'lost') {
            this.showResult(false);
            if (DEBUG_ENABLED) this.publishDebug();
            return;
          }
        }
      }
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
      view: this.add.circle(state.x, state.y, 8, stats.color).setDepth(8),
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
        const before = this.run;
        this.run = damagePlayer(this.run, shot.damage);
        if (this.run !== before) {
          this.flashPlayer();
          this.refreshHud();
        }
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

  private syncEnemyView(entity: EnemyEntity): void {
    const enemy = entity.state;
    const radius = ENEMY_STATS[enemy.kind].radius;

    entity.view.setPosition(enemy.x, enemy.y);
    entity.view.setAlpha(isStunned(enemy) ? 0.5 : 1);
    entity.hpBar.setPosition(enemy.x, enemy.y - radius - 9);

    for (const [index, kind] of STATUS_ORDER.entries()) {
      const dot = entity.statusDots[index];
      dot.setVisible(hasStatus(enemy, kind));
      dot.setPosition(enemy.x + (index - 1.5) * 9, enemy.y - radius - 16);
    }
  }

  private updateAreas(dt: number): void {
    // 이동 방해는 매 프레임 다시 계산한다.
    for (const entity of this.enemies) entity.state.hindered = false;

    for (let i = this.areas.length - 1; i >= 0; i--) {
      const { state, view, owner } = this.areas[i];
      const result = tickArea(state, dt);
      let damagedSomething = false;

      for (const entity of this.enemies) {
        if (!isAlive(entity.state) || !containsPoint(state, entity.state)) continue;
        if (state.hinders) entity.state.hindered = true;
        if (result.ticked) {
          this.damageEnemy(entity, state.damagePerTick * incomingDamageMultiplier(entity.state));
          damagedSomething = true;
        }
      }

      // 지대형 발동 스킬도 지속피해가 들어가는 동안은 콤보를 유지시킨다.
      if (damagedSomething && owner) {
        owner.combo = sustainCombo(owner.combo, resolveFor(this.run.loadout, owner.weapon.basic).stats);
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
          const runtime = entity.weapon.id === this.left.weapon.id ? this.left : this.right;
          this.resolveHit(hit, outcome.damage, entity.weapon, entity.basic, runtime);

          for (const spawned of outcome.spawned) {
            this.projectiles.push({
              state: spawned,
              view: this.add.circle(spawned.x, spawned.y, 7, entity.weapon.color).setDepth(8),
              weapon: entity.weapon,
              basic: entity.basic,
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
      deathBurst(this, enemy.x, enemy.y, ENEMY_STATS[enemy.kind].color, radius * 2);
      entity.view.destroy();
      entity.hpBar.destroy();
      for (const dot of entity.statusDots) dot.destroy();
      this.run = addKill(this.run);
      this.refreshHud();
    }
  }

  private flashPlayer(): void {
    this.player.setFillStyle(0xff6b6b);
    this.time.delayedCall(110, () => this.player.setFillStyle(COLORS.player));
  }

  // ───────────────────────── HUD와 오버레이

  private buildHud(): void {
    const barBack = this.add.rectangle(screenX(24), screenY(26), 240, 14, 0x2a2f42).setOrigin(0, 0.5).setDepth(19);
    this.hpBarFill = this.add.rectangle(screenX(24), screenY(26), 240, 14, 0x6ee7a8).setOrigin(0, 0.5).setDepth(20);
    this.hud = this.add
      .text(screenX(24), screenY(44), '', { fontSize: '14px', color: COLORS.text, lineSpacing: 3 })
      .setDepth(20);
    this.comboText = this.add
      .text(screenX(VIEW_WIDTH / 2), screenY(VIEW_HEIGHT - 40), '', { fontSize: '16px', color: COLORS.textDim })
      .setOrigin(0.5)
      .setDepth(20);

    const hint = this.add
      .text(screenX(VIEW_WIDTH - 24), screenY(20), 'WASD 이동 · 좌클릭 왼손 · 우클릭/Shift 오른손 · Space 대시 · R 재시작', {
        fontSize: '13px',
        color: COLORS.textDim,
      })
      .setOrigin(1, 0)
      .setDepth(20);

    // 카메라가 방을 따라 움직여도 HUD는 화면에 붙어 있어야 한다.
    pinToScreen(barBack, this.hpBarFill, this.hud, this.comboText, hint);

    // 방이 화면보다 크므로 밖에 있는 대상을 가리키는 표시가 필요하다.
    // 없으면 남은 적을 찾아 헤매게 된다.
    this.offscreenMarks = Array.from({ length: 8 }, () =>
      this.add.triangle(0, 0, 0, -10, 8, 8, -8, 8, COLORS.accent, 0.8).setDepth(21).setScrollFactor(0).setVisible(false),
    );

    this.buildMinimap();
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
      dot.setRadius(enemy.state.kind === 'boss' ? 5 : 2.5);
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
    this.hpBarFill.width = (240 * this.run.hp) / this.run.maxHp;

    const hands = describeByHand(this.run.loadout);
    this.hud.setText(
      [
        `체력 ${Math.ceil(this.run.hp)} / ${this.run.maxHp}`,
        `${wave?.label ?? '-'} (${this.run.roomIndex + 1}/${TOTAL_ROOMS})   남은 적 ${remaining}   처치 ${this.run.kills}`,
        ...hands.map(
          (h) => `${h.hand} ${h.weapon}` + (h.lines.length ? `   ${h.lines.join('  ·  ')}` : ''),
        ),
        ...(this.exitOpen ? ['방을 정리했다. 출구로 이동 →'] : []),
      ].join('\n'),
    );
    this.updateComboText();
  }

  private updateComboText(): void {
    const label = (runtime: WeaponRuntime) =>
      isComboReady(runtime.combo)
        ? `${runtime.weapon.name} ▶ ${runtime.weapon.combo.name} 발동 준비`
        : `${runtime.weapon.name} ${runtime.combo.value}/${COMBO_REQUIRED}`;
    this.comboText.setText(`${label(this.left)}      ${label(this.right)}`);
  }

  private showOffer(): void {
    this.currentOffer = rollOffer(this.run.loadout, SUPPORTS);

    if (this.currentOffer.length === 0) {
      this.run = pickSupport(this.run, undefined);
      this.enterRoom();
      return;
    }

    this.selectedOffer = null;
    this.offerCards = [];
    this.offerConfirmLabels = [];

    const container = this.add.container(0, 0).setDepth(30);
    container.add(this.add.rectangle(screenX(VIEW_WIDTH / 2), screenY(VIEW_HEIGHT / 2), VIEW_WIDTH, VIEW_HEIGHT, 0x0a0b0f, 0.82));
    container.add(
      this.add
        .text(screenX(VIEW_WIDTH / 2), screenY(140), '보조능력을 하나 고르세요', { fontSize: '30px', color: COLORS.text, fontStyle: 'bold' })
        .setOrigin(0.5),
    );

    const cardWidth = 300;
    const gap = 32;
    const total = this.currentOffer.length * cardWidth + (this.currentOffer.length - 1) * gap;
    const startX = screenX((VIEW_WIDTH - total) / 2 + cardWidth / 2);

    for (const [index, item] of this.currentOffer.entries()) {
      const x = startX + index * (cardWidth + gap);
      const card = this.add
        .rectangle(x, screenY(VIEW_HEIGHT / 2), cardWidth, 250, 0x171a26)
        .setStrokeStyle(2, 0x2a2f42)
        .setInteractive({ useHandCursor: true });
      // 처음 누르면 고르기만 하고, 고른 것을 다시 누르면 확정한다.
      card.on('pointerdown', () => this.selectOffer(index));
      container.add(card);
      this.offerCards.push(card);

      const confirmLabel = this.add
        .text(x, screenY(VIEW_HEIGHT / 2) + 100, '', { fontSize: '14px', color: COLORS.accentText, fontStyle: 'bold' })
        .setOrigin(0.5);
      container.add(confirmLabel);
      this.offerConfirmLabels.push(confirmLabel);

      container.add(this.add.text(x, screenY(VIEW_HEIGHT / 2) - 88, `${index + 1}`, { fontSize: '18px', color: COLORS.textDim }).setOrigin(0.5));
      container.add(
        this.add.text(x, screenY(VIEW_HEIGHT / 2) - 50, item.support.name, { fontSize: '24px', color: COLORS.text, fontStyle: 'bold' }).setOrigin(0.5),
      );
      // 어느 스킬에 붙는지 함께 보여준다. 태그 때문에 붙을 곳이 정해진다.
      const hand = handOf(this.run.loadout, item.skill.id);
      container.add(
        this.add
          .text(x, screenY(VIEW_HEIGHT / 2) - 18, `→ ${hand ? `${hand} ` : ''}${item.skill.name}`, {
            fontSize: '15px',
            color: COLORS.accentText,
          })
          .setOrigin(0.5),
      );
      container.add(
        this.add
          .text(x, screenY(VIEW_HEIGHT / 2) + 42, item.support.description, {
            fontSize: '13px',
            color: COLORS.textDim,
            align: 'center',
            wordWrap: { width: cardWidth - 40 },
            lineSpacing: 5,
          })
          .setOrigin(0.5),
      );
    }

    container.add(
      this.add
        .text(screenX(VIEW_WIDTH / 2), screenY(VIEW_HEIGHT - 120), '숫자키 1-3으로 고르고, 고른 카드를 다시 누르거나 Enter로 결정', {
          fontSize: '15px',
          color: COLORS.textDim,
        })
        .setOrigin(0.5),
    );

    // 자식을 전부 넣은 뒤에 걸어야 한다. 컨테이너에만 걸면 그리기는 고정되지만
    // 클릭 판정은 자식 자신의 scrollFactor를 보기 때문에 서로 어긋난다.
    container.setScrollFactor(0, 0, true);

    // 페이드인만 짧게 한다. 입력은 처음부터 받는다.
    container.setAlpha(0.4);
    this.tweens.add({ targets: container, alpha: 1, duration: OFFER_FADE_MS, ease: 'Quad.easeOut' });
    this.refreshOfferSelection();

    this.overlay = container;
  }

  /**
   * 카드를 고른다. 이미 고른 것을 또 누르면 확정한다.
   *
   * 고르기와 확정을 나눈 이유가 있다. 전투 중 연타하던 클릭이 창이 뜨자마자
   * 카드에 꽂혀 선택지를 읽기도 전에 골라지는 문제가 있었는데, 처음에는
   * 창이 뜬 뒤 800ms 동안 입력을 막아 해결했다. 그런데 그 800ms 동안 누른 것이
   * **조용히 사라졌다.** 첫 창은 선택지를 읽느라 800ms를 넘겨서 멀쩡했고,
   * 두 번째부터는 뭘 고를지 알고 바로 누르기 때문에 클릭이 통째로 먹히지 않았다.
   *
   * 시간으로 막는 대신 단계를 하나 두었다. 흘러든 클릭은 기껏해야 카드를 바꿀 뿐
   * 판을 진행시키지 못하고, 지연이 없으니 아무리 빨리 눌러도 받는다.
   */
  private selectOffer(index: number): void {
    if (this.run.phase !== 'offer') return;
    if (!this.currentOffer[index]) return;

    if (this.selectedOffer === index) {
      this.confirmOffer();
      return;
    }
    this.selectedOffer = index;
    this.refreshOfferSelection();
  }

  /** 무엇을 골랐는지 눈에 보이게 한다. */
  private refreshOfferSelection(): void {
    for (const [index, card] of this.offerCards.entries()) {
      const chosen = index === this.selectedOffer;
      card.setStrokeStyle(chosen ? 4 : 2, chosen ? COLORS.accent : 0x2a2f42);
      card.setFillStyle(chosen ? 0x232838 : 0x171a26);
    }
    for (const [index, label] of this.offerConfirmLabels.entries()) {
      label.setText(index === this.selectedOffer ? '다시 눌러 결정' : '');
    }
  }

  /** 고른 것을 확정하고 다음 방으로 넘어간다. */
  private confirmOffer(): void {
    if (this.run.phase !== 'offer' || this.selectedOffer === null) return;

    const item = this.currentOffer[this.selectedOffer];
    if (!item) return;

    this.overlay?.destroy(true);
    this.overlay = null;
    this.offerCards = [];
    this.offerConfirmLabels = [];
    this.selectedOffer = null;
    this.run = pickSupport(this.run, { support: item.support, skillId: item.skill.id });
    this.enterRoom();
  }

  private showResult(won: boolean): void {
    const container = this.add.container(0, 0).setDepth(30);
    container.add(this.add.rectangle(screenX(VIEW_WIDTH / 2), screenY(VIEW_HEIGHT / 2), VIEW_WIDTH, VIEW_HEIGHT, 0x0a0b0f, 0.88));
    container.add(
      this.add
        .text(screenX(VIEW_WIDTH / 2), screenY(VIEW_HEIGHT / 2) - 90, won ? '승리' : '패배', {
          fontSize: '56px',
          color: won ? '#6ee7a8' : '#ff6b6b',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    const hands = describeByHand(this.run.loadout);
    container.add(
      this.add
        .text(
          screenX(VIEW_WIDTH / 2),
          screenY(VIEW_HEIGHT / 2) - 10,
          [
            `${this.left.weapon.name} + ${this.right.weapon.name}`,
            `처치 ${this.run.kills}   시간 ${this.run.elapsed.toFixed(1)}초`,
            hands.map((h) => `${h.hand} ${h.weapon}` + (h.lines.length ? ` — ${h.lines.join(', ')}` : '')).join('\n'),
          ].join('\n'),
          { fontSize: '16px', color: COLORS.text, align: 'center', lineSpacing: 8 },
        )
        .setOrigin(0.5),
    );
    container.add(
      this.add.text(screenX(VIEW_WIDTH / 2), screenY(VIEW_HEIGHT / 2) + 90, 'R 키로 무기를 다시 골라 시작', { fontSize: '18px', color: COLORS.textDim }).setOrigin(0.5),
    );
    // 자식을 전부 넣은 뒤에 건다. 자세한 이유는 showOffer 참고.
    container.setScrollFactor(0, 0, true);
    this.overlay = container;
  }
}
