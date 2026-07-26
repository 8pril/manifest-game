import Phaser from 'phaser';
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
const PLAYER_RADIUS = 14;
const STATUS_ORDER: StatusKind[] = ['wound', 'exposed', 'brand', 'fracture'];

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
  private overlay: Phaser.GameObjects.Container | null = null;

  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private dashUntil = 0;
  private dashReadyAt = 0;
  private dashAngle = 0;
  private arcaneFlowUntil = 0;
  private currentOffer: OfferItem[] = [];
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

    this.player = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, PLAYER_RADIUS, COLORS.player).setDepth(10);
    this.aimLine = this.add.line(0, 0, 0, 0, 0, 0, COLORS.accent).setOrigin(0, 0).setLineWidth(2).setDepth(9);

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
        view: this.add.circle(state.x, state.y, 5, weapon.color).setDepth(8),
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

    // 휘두른 범위를 짧게 보여준다.
    const wedge = this.add
      .arc(this.player.x, this.player.y, range, Phaser.Math.RadToDeg(angle - arc / 2), Phaser.Math.RadToDeg(angle + arc / 2), false, runtime.weapon.color, 0.3)
      .setDepth(7);
    this.tweens.add({ targets: wedge, alpha: 0, duration: 160, onComplete: () => wedge.destroy() });

    const targets = targetsInArc(
      { origin: { x: this.player.x, y: this.player.y }, angle, range, arc },
      this.enemies.filter((e) => isAlive(e.state)).map((e) => e.state),
    );

    for (const target of targets) {
      const entity = this.enemies.find((e) => e.state.id === target.id);
      if (entity) this.resolveHit(entity, stats.damage ?? 0, runtime.weapon, basic, runtime);
    }
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
      }

      const result = applyStatus(enemy, weapon.status);
      if (result.burst) damage += WOUND_BURST_DAMAGE;

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
        const hpBar = this.add.rectangle(enemy.x, enemy.y - stats.radius - 7, stats.radius * 2, 3, 0x6ee7a8).setDepth(6);
        const statusDots = STATUS_ORDER.map((kind, index) =>
          this.add
            .rectangle(enemy.x + (index - 1.5) * 7, enemy.y - stats.radius - 14, 5, 5, STATUS_COLORS[kind])
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
        ? { x: Math.random() < 0.5 ? 40 : GAME_WIDTH - 40, y: Phaser.Math.Between(40, GAME_HEIGHT - 40) }
        : { x: Phaser.Math.Between(40, GAME_WIDTH - 40), y: Math.random() < 0.5 ? 40 : GAME_HEIGHT - 40 };
      if (Math.hypot(point.x - this.player.x, point.y - this.player.y) > 220) return point;
    }
    return { x: 40, y: 40 };
  }

  private checkWaveCleared(): void {
    if (this.run.phase !== 'combat' || this.enemies.some((e) => isAlive(e.state))) return;

    const wave = WAVES[this.run.waveIndex];
    this.run = clearWave(this.run, wave?.offersSupport ?? false);

    if (this.run.phase === 'offer') this.showOffer();
    else if (this.run.phase === 'won') this.showResult(true);
    else this.startWave();
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
    this.updateAreas(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateEnemyShots(dt);
    this.checkWaveCleared();
  }

  private movePlayer(dt: number): void {
    const dashing = this.time.now < this.dashUntil;
    const direction = dashing ? { x: Math.cos(this.dashAngle), y: Math.sin(this.dashAngle) } : this.moveDirection();
    this.player.setAlpha(dashing ? 0.55 : 1);
    if (!direction) return;

    const step = (dashing ? DASH_SPEED : MOVE_SPEED) * dt;
    this.player.x = Phaser.Math.Clamp(this.player.x + direction.x * step, PLAYER_RADIUS, GAME_WIDTH - PLAYER_RADIUS);
    this.player.y = Phaser.Math.Clamp(this.player.y + direction.y * step, PLAYER_RADIUS, GAME_HEIGHT - PLAYER_RADIUS);
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
          enemy.x = Phaser.Math.Clamp(enemy.x + direction.x * step, 20, GAME_WIDTH - 20);
          enemy.y = Phaser.Math.Clamp(enemy.y + direction.y * step, 20, GAME_HEIGHT - 20);
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
      view: this.add.circle(state.x, state.y, 6, stats.color).setDepth(8),
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
        !dashing && Math.hypot(shot.state.x - this.player.x, shot.state.y - this.player.y) <= PLAYER_RADIUS + 6;

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
    entity.hpBar.setPosition(enemy.x, enemy.y - radius - 7);

    for (const [index, kind] of STATUS_ORDER.entries()) {
      const dot = entity.statusDots[index];
      dot.setVisible(hasStatus(enemy, kind));
      dot.setPosition(enemy.x + (index - 1.5) * 7, enemy.y - radius - 14);
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
              view: this.add.circle(spawned.x, spawned.y, 5, entity.weapon.color).setDepth(8),
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

    container.add(
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 120, '숫자키 1-3 또는 클릭', { fontSize: '15px', color: COLORS.textDim }).setOrigin(0.5),
    );
    this.overlay = container;
  }

  private choose(index: number): void {
    if (this.run.phase !== 'offer') return;
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
