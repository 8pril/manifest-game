import Phaser from 'phaser';
import { applyRenderScale } from '@/render';
import { ring, flash, floatingNumber, impact } from '@/effects';
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
import { WAVES, TOTAL_WAVES } from '@/game/waves';
import { rollOffer, type OfferItem } from '@/game/offer';
import { leftWeapon, rightWeapon, resolveFor, describeSupports } from '@/game/loadout';
import { createCombo, gainCombo, tickCombo, isComboReady, consumeCombo, COMBO_REQUIRED, type ComboState } from '@/game/combo';
import { createRun, clearWave, pickSupport, damagePlayer, addKill, advanceTime, type RunState } from '@/game/run';

const MOVE_SPEED = 300;
const DASH_SPEED = 900;
const DASH_DURATION_MS = 130;
const DASH_COOLDOWN_MS = 900;
const PLAYER_RADIUS = 20;
/**
 * 실제 전투가 벌어지는 영역.
 *
 * HUD가 위쪽(체력·웨이브·조작 안내)과 아래쪽(콤보 게이지)을 쓰므로,
 * 적과 플레이어가 그 위로 올라오면 글자와 겹쳐 둘 다 읽기 어려워진다.
 * 개체가 커질수록 눈에 띄어서 영역을 분리했다.
 */
const PLAYFIELD = {
  minX: 24,
  minY: 100,
  maxX: GAME_WIDTH - 24,
  maxY: GAME_HEIGHT - 60,
};
const STATUS_ORDER: StatusKind[] = ['wound', 'exposed', 'brand', 'fracture'];
/** 벽까지 밀린 적이 받는 추가 피해. */
const WALL_SLAM_DAMAGE = 40;
/** 상태 연출 색. 상태 표시 점과 같은 색을 써서 무엇이 터졌는지 연결되게 한다. */
const BURST_COLOR = 0xff6b6b;
const BRAND_COLOR = 0xb08bff;
/**
 * 보조능력 선택 화면이 뜬 뒤 입력을 받기까지의 지연(ms).
 *
 * 전투 중 연타하던 클릭이 화면이 뜨자마자 그대로 카드에 꽂혀서,
 * 선택지를 읽기도 전에 골라지는 문제가 있었다.
 * 이 시간 동안 카드는 흐리게 떠 있고 입력을 받지 않는다.
 */
const OFFER_INPUT_DELAY = 800;

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
  private areas: { state: Area; view: Phaser.GameObjects.Arc }[] = [];
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
  private ruleEvents = { burst: 0, wallSlam: 0, brand: 0 };
  /** 이 시각 이후에야 보조능력을 고를 수 있다. */
  private offerReadyAt = 0;
  private weapons: { left: WeaponId; right: WeaponId } = { left: 'sword', right: 'bow' };
  private startWaveIndex = 0;

  constructor() {
    super('Play');
  }

  init(data: { left?: WeaponId; right?: WeaponId }): void {
    // 씬을 직접 열었을 때(개발용 ?scene=Play)를 위한 기본값.
    this.weapons = { left: data?.left ?? 'sword', right: data?.right ?? 'bow' };

    // 개발용: ?wave=2 로 특정 웨이브부터 시작한다.
    // 후반 웨이브를 확인할 때마다 앞 웨이브를 다시 클리어하지 않아도 되게 한다.
    const requested = Number(new URLSearchParams(location.search).get('wave'));
    this.startWaveIndex =
      Number.isFinite(requested) && requested >= 1 && requested <= TOTAL_WAVES ? requested - 1 : 0;
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

    this.run = { ...createRun(this.weapons.left, this.weapons.right), waveIndex: this.startWaveIndex };
    this.left = { weapon: leftWeapon(this.run.loadout), combo: createCombo(), readyAt: 0 };
    this.right = { weapon: rightWeapon(this.run.loadout), combo: createCombo(), readyAt: 0 };

    this.add.grid(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 64, 64, COLORS.background, 1, 0x1b1e2b, 1);
    // 전장 경계. 어디까지 움직일 수 있는지 보이게 한다.
    this.add
      .rectangle(
        (PLAYFIELD.minX + PLAYFIELD.maxX) / 2,
        (PLAYFIELD.minY + PLAYFIELD.maxY) / 2,
        PLAYFIELD.maxX - PLAYFIELD.minX,
        PLAYFIELD.maxY - PLAYFIELD.minY,
      )
      .setStrokeStyle(1, 0x2a2f42)
      .setDepth(0);

    this.player = this.add
      .circle(GAME_WIDTH / 2, (PLAYFIELD.minY + PLAYFIELD.maxY) / 2, PLAYER_RADIUS, COLORS.player)
      .setDepth(10);
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
    this.startWave();
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
      keyboard.on(`keydown-${name}`, () => this.choose(index));
    }

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.run.phase !== 'combat') return;
      this.useWeapon(pointer.rightButtonDown() ? this.right : this.left);
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

    // 콤보가 차 있으면 이번 공격이 발동 스킬로 전환된다.
    const useCombo = isComboReady(runtime.combo);
    const skill = useCombo ? runtime.weapon.combo : runtime.weapon.basic;
    if (useCombo) runtime.combo = consumeCombo();

    const resolved = resolveFor(this.run.loadout, skill);
    const angle = this.aimAngle();

    switch (deliveryOf(skill)) {
      case 'projectile':
        this.fireProjectiles(runtime.weapon, skill, resolved.stats, resolved.behaviors, angle, !useCombo);
        break;
      case 'melee':
        this.swingMelee(runtime, skill, resolved.stats, angle, !useCombo);
        break;
      case 'area':
        this.dropArea(resolved.stats, resolved.behaviors, angle);
        break;
    }
    this.refreshHud();
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
        minX: PLAYFIELD.minX + radius,
        minY: PLAYFIELD.minY + radius,
        maxX: PLAYFIELD.maxX - radius,
        maxY: PLAYFIELD.maxY - radius,
      },
    );

    entity.state.x = result.x;
    entity.state.y = result.y;

    if (result.hitWall) {
      // 벽꿍. 확률 판정을 건너뛰고 확정으로 건다.
      applyStatus(entity.state, 'fracture', Math.random, true);
      this.ruleEvents.wallSlam++;
      impact(this, entity.state.x, entity.state.y);
      floatingNumber(this, entity.state.x, entity.state.y, `+${WALL_SLAM_DAMAGE}`, '#ffe08a');
      this.damageEnemy(entity, WALL_SLAM_DAMAGE);
    }
    this.syncEnemyView(entity);
  }

  private dropArea(
    stats: ReturnType<typeof resolveFor>['stats'],
    behaviors: ReturnType<typeof resolveFor>['behaviors'],
    angle: number,
  ): void {
    // 지대는 조준 방향 앞쪽에 깔린다.
    const distance = 90;
    const at = { x: this.player.x + Math.cos(angle) * distance, y: this.player.y + Math.sin(angle) * distance };
    const area = createArea(stats, behaviors, at);

    this.areas.push({
      state: area,
      view: this.add.circle(area.x, area.y, area.radius, AREA_COLORS[area.kind], 0.3).setDepth(1),
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

    // 비전 흐름: 낙인을 소비해 얻은 증폭
    if (weapon.id === 'arcane' && this.time.now < this.arcaneFlowUntil) {
      damage *= 1 + ARCANE_FLOW_MORE;
    }

    if (basic) {
      // 낙인이 걸린 적을 비전으로 때리면 낙인을 소비하고 비전 흐름을 얻는다.
      if (weapon.id === 'arcane' && consumeBrand(enemy)) {
        this.arcaneFlowUntil = this.time.now + ARCANE_FLOW_DURATION * 1000;
        this.ruleEvents.brand++;
        ring(this, enemy.x, enemy.y, BRAND_COLOR, { to: 110, duration: 420 });
        floatingNumber(this, this.player.x, this.player.y - 24, '비전 흐름', '#c9a8ff');
      }

      const result = applyStatus(enemy, weapon.status);
      if (result.burst) {
        damage += WOUND_BURST_DAMAGE;
        this.ruleEvents.burst++;
        // 규칙상으로만 터지고 화면에는 아무것도 안 나오던 지점.
        const radius = ENEMY_STATS[enemy.kind].radius;
        ring(this, enemy.x, enemy.y, BURST_COLOR, { to: radius * 3.2 });
        flash(this, enemy.x, enemy.y, radius * 2.2, BURST_COLOR);
        floatingNumber(this, enemy.x, enemy.y, `+${WOUND_BURST_DAMAGE}`, '#ff9b9b');
      }

      if (runtime) {
        const stats = resolveFor(this.run.loadout, weapon.basic).stats;
        runtime.combo = gainCombo(runtime.combo, stats);
      }
    }

    this.damageEnemy(entity, damage);
  }

  // ───────────────────────── 웨이브

  private startWave(): void {
    const wave = WAVES[this.run.waveIndex];
    if (!wave) return;

    for (const spawn of wave.spawns) {
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

  private edgeSpawnPoint(): { x: number; y: number } {
    for (let attempt = 0; attempt < 12; attempt++) {
      const onVertical = Math.random() < 0.5;
      const point = onVertical
        ? {
            x: Math.random() < 0.5 ? PLAYFIELD.minX + 30 : PLAYFIELD.maxX - 30,
            y: Phaser.Math.Between(PLAYFIELD.minY + 30, PLAYFIELD.maxY - 30),
          }
        : {
            x: Phaser.Math.Between(PLAYFIELD.minX + 30, PLAYFIELD.maxX - 30),
            y: Math.random() < 0.5 ? PLAYFIELD.minY + 30 : PLAYFIELD.maxY - 30,
          };
      if (Math.hypot(point.x - this.player.x, point.y - this.player.y) > 220) return point;
    }
    return { x: PLAYFIELD.minX + 30, y: PLAYFIELD.minY + 30 };
  }

  private checkWaveCleared(): void {
    if (this.run.phase !== 'combat' || this.enemies.some((e) => isAlive(e.state))) return;

    const wave = WAVES[this.run.waveIndex];
    this.run = clearWave(this.run, wave?.offersSupport ?? false);

    if (this.run.phase === 'offer') this.showOffer();
    else if (this.run.phase === 'won') this.showResult(true);
    else this.startWave();

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
    if (DEBUG_ENABLED) this.publishDebug();
    this.updateAreas(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateEnemyShots(dt);
    this.checkWaveCleared();
  }

  /** 개발 빌드에서만 상태를 노출한다. 헤드리스 검증 드라이버가 읽는다. */
  private publishDebug(): void {
    publishDebugState({
      phase: this.run.phase,
      waveIndex: this.run.waveIndex,
      totalWaves: TOTAL_WAVES,
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
      events: { ...this.ruleEvents },
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
      PLAYFIELD.minX + PLAYER_RADIUS,
      PLAYFIELD.maxX - PLAYER_RADIUS,
    );
    this.player.y = Phaser.Math.Clamp(
      this.player.y + direction.y * step,
      PLAYFIELD.minY + PLAYER_RADIUS,
      PLAYFIELD.maxY - PLAYER_RADIUS,
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
          enemy.x = Phaser.Math.Clamp(enemy.x + direction.x * step, PLAYFIELD.minX + radius, PLAYFIELD.maxX - radius);
          enemy.y = Phaser.Math.Clamp(enemy.y + direction.y * step, PLAYFIELD.minY + radius, PLAYFIELD.maxY - radius);
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

      const outOfBounds =
        shot.state.x < -40 || shot.state.x > GAME_WIDTH + 40 || shot.state.y < -40 || shot.state.y > GAME_HEIGHT + 40;
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
      const { state, view } = this.areas[i];
      const result = tickArea(state, dt);

      for (const entity of this.enemies) {
        if (!isAlive(entity.state) || !containsPoint(state, entity.state)) continue;
        if (state.hinders) entity.state.hindered = true;
        if (result.ticked) this.damageEnemy(entity, state.damagePerTick * incomingDamageMultiplier(entity.state));
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

      let consumed =
        projectile.x < -40 || projectile.x > GAME_WIDTH + 40 || projectile.y < -40 || projectile.y > GAME_HEIGHT + 40;

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
    this.add.rectangle(24, 26, 240, 14, 0x2a2f42).setOrigin(0, 0.5).setDepth(19);
    this.hpBarFill = this.add.rectangle(24, 26, 240, 14, 0x6ee7a8).setOrigin(0, 0.5).setDepth(20);
    this.hud = this.add.text(24, 44, '', { fontSize: '14px', color: COLORS.text, lineSpacing: 3 }).setDepth(20);
    this.comboText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 40, '', { fontSize: '16px', color: COLORS.textDim })
      .setOrigin(0.5)
      .setDepth(20);

    this.add
      .text(GAME_WIDTH - 24, 20, 'WASD 이동 · 좌클릭 왼손 · 우클릭 오른손 · Space 대시 · R 재시작', {
        fontSize: '13px',
        color: COLORS.textDim,
      })
      .setOrigin(1, 0)
      .setDepth(20);
  }

  private refreshHud(): void {
    const wave = WAVES[this.run.waveIndex];
    const remaining = this.enemies.filter((e) => isAlive(e.state)).length;
    this.hpBarFill.width = (240 * this.run.hp) / this.run.maxHp;

    const supports = describeSupports(this.run.loadout);
    this.hud.setText(
      [
        `체력 ${Math.ceil(this.run.hp)} / ${this.run.maxHp}`,
        `${wave?.label ?? '-'} (${this.run.waveIndex + 1}/${TOTAL_WAVES})   남은 적 ${remaining}   처치 ${this.run.kills}`,
        `왼손 ${this.left.weapon.name}   오른손 ${this.right.weapon.name}`,
        supports.length ? `보조  ${supports.join(' / ')}` : '보조  없음',
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
      this.startWave();
      return;
    }

    this.offerReadyAt = this.time.now + OFFER_INPUT_DELAY;

    const container = this.add.container(0, 0).setDepth(30);
    container.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0b0f, 0.82));
    container.add(
      this.add
        .text(GAME_WIDTH / 2, 140, '보조능력을 하나 고르세요', { fontSize: '30px', color: COLORS.text, fontStyle: 'bold' })
        .setOrigin(0.5),
    );

    const cardWidth = 300;
    const gap = 32;
    const total = this.currentOffer.length * cardWidth + (this.currentOffer.length - 1) * gap;
    const startX = (GAME_WIDTH - total) / 2 + cardWidth / 2;

    for (const [index, item] of this.currentOffer.entries()) {
      const x = startX + index * (cardWidth + gap);
      const card = this.add
        .rectangle(x, GAME_HEIGHT / 2, cardWidth, 250, 0x171a26)
        .setStrokeStyle(2, COLORS.accent)
        .setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => this.choose(index));
      container.add(card);

      container.add(this.add.text(x, GAME_HEIGHT / 2 - 88, `${index + 1}`, { fontSize: '18px', color: COLORS.textDim }).setOrigin(0.5));
      container.add(
        this.add.text(x, GAME_HEIGHT / 2 - 50, item.support.name, { fontSize: '24px', color: COLORS.text, fontStyle: 'bold' }).setOrigin(0.5),
      );
      // 어느 스킬에 붙는지 함께 보여준다. 태그 때문에 붙을 곳이 정해진다.
      container.add(
        this.add.text(x, GAME_HEIGHT / 2 - 18, `→ ${item.skill.name}`, { fontSize: '15px', color: COLORS.accentText }).setOrigin(0.5),
      );
      container.add(
        this.add
          .text(x, GAME_HEIGHT / 2 + 42, item.support.description, {
            fontSize: '13px',
            color: COLORS.textDim,
            align: 'center',
            wordWrap: { width: cardWidth - 40 },
            lineSpacing: 5,
          })
          .setOrigin(0.5),
      );
    }

    const hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 120, '', { fontSize: '15px', color: COLORS.textDim })
      .setOrigin(0.5);
    container.add(hint);

    // 입력을 받기 전까지는 흐리게 떠 있어서, 아직 고를 수 없다는 게 눈에 보인다.
    container.setAlpha(0.35);
    hint.setText('...');
    this.tweens.add({ targets: container, alpha: 1, duration: OFFER_INPUT_DELAY, ease: 'Quad.easeOut' });
    this.time.delayedCall(OFFER_INPUT_DELAY, () => hint.setText('숫자키 1-3 또는 클릭'));

    this.overlay = container;
  }

  private choose(index: number): void {
    if (this.run.phase !== 'offer') return;
    // 전투 중 연타가 그대로 선택으로 이어지지 않도록 잠깐 입력을 막는다.
    if (this.time.now < this.offerReadyAt) return;

    const item = this.currentOffer[index];
    if (!item) return;

    this.overlay?.destroy(true);
    this.overlay = null;
    this.run = pickSupport(this.run, { support: item.support, skillId: item.skill.id });
    this.startWave();
  }

  private showResult(won: boolean): void {
    const container = this.add.container(0, 0).setDepth(30);
    container.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0b0f, 0.88));
    container.add(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 90, won ? '승리' : '패배', {
          fontSize: '56px',
          color: won ? '#6ee7a8' : '#ff6b6b',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    const supports = describeSupports(this.run.loadout);
    container.add(
      this.add
        .text(
          GAME_WIDTH / 2,
          GAME_HEIGHT / 2 - 10,
          [
            `${this.left.weapon.name} + ${this.right.weapon.name}`,
            `처치 ${this.run.kills}   시간 ${this.run.elapsed.toFixed(1)}초`,
            supports.length ? supports.join('   ') : '보조능력 없음',
          ].join('\n'),
          { fontSize: '16px', color: COLORS.text, align: 'center', lineSpacing: 8 },
        )
        .setOrigin(0.5),
    );
    container.add(
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 90, 'R 키로 무기를 다시 골라 시작', { fontSize: '18px', color: COLORS.textDim }).setOrigin(0.5),
    );
    this.overlay = container;
  }
}
