import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '@/config';
import { SUPPORTS } from '@/data/supports';
import { ARROW_SHOT } from '@/data/skills';
import { resolveSkill, type Support } from '@/engine/support';
import {
  spawnProjectiles,
  advance,
  onHitTarget,
  resetProjectileIds,
  type Projectile,
} from '@/engine/projectile';
import {
  ENEMY_STATS,
  createEnemy,
  enemySpeed,
  isAlive,
  resetEnemyIds,
  type Enemy,
} from '@/game/enemy';
import { WAVES, TOTAL_WAVES } from '@/game/waves';
import { rollOffer } from '@/game/offer';
import {
  createRun,
  clearWave,
  pickSupport,
  damagePlayer,
  addKill,
  advanceTime,
  type RunState,
} from '@/game/run';

const MOVE_SPEED = 300;
const DASH_SPEED = 900;
const DASH_DURATION_MS = 130;
const DASH_COOLDOWN_MS = 900;
const FIRE_COOLDOWN_MS = 240;
const PLAYER_RADIUS = 14;

interface EnemyEntity {
  state: Enemy;
  view: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
}

interface ProjectileEntity {
  state: Projectile;
  view: Phaser.GameObjects.Arc;
}

/**
 * 한 판의 전투 화면.
 *
 * 진행 규칙과 승패 판정은 `game/run.ts`의 상태 기계가 갖고 있고,
 * 이 씬은 그 상태를 그리고 입력을 전달하는 역할만 한다.
 */
export class PlayScene extends Phaser.Scene {
  private run!: RunState;

  private player!: Phaser.GameObjects.Arc;
  private aimLine!: Phaser.GameObjects.Line;
  private enemies: EnemyEntity[] = [];
  private projectiles: ProjectileEntity[] = [];

  private hud!: Phaser.GameObjects.Text;
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private overlay: Phaser.GameObjects.Container | null = null;

  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'dash', Phaser.Input.Keyboard.Key>;
  private lastFiredAt = 0;
  private dashUntil = 0;
  private dashReadyAt = 0;
  private dashAngle = 0;
  private currentOffer: Support[] = [];

  constructor() {
    super('Play');
  }

  create(): void {
    resetProjectileIds();
    resetEnemyIds();
    this.enemies = [];
    this.projectiles = [];
    this.overlay = null;
    this.run = createRun();

    this.add.grid(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      64,
      64,
      COLORS.background,
      1,
      0x1b1e2b,
      1,
    );

    this.player = this.add
      .circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, PLAYER_RADIUS, COLORS.player)
      .setDepth(10);
    this.aimLine = this.add
      .line(0, 0, 0, 0, 0, 0, COLORS.accent)
      .setOrigin(0, 0)
      .setLineWidth(2)
      .setDepth(9);

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
      dash: keyboard.addKey(KeyCodes.SPACE),
    };

    keyboard.on('keydown-SPACE', () => this.tryDash());
    keyboard.on('keydown-R', () => this.scene.restart());

    for (const [index, name] of ['ONE', 'TWO', 'THREE'].entries()) {
      keyboard.on(`keydown-${name}`, () => this.choose(index));
    }

    this.input.on('pointerdown', () => this.tryFire());
  }

  private tryDash(): void {
    if (this.run.phase !== 'combat') return;
    if (this.time.now < this.dashReadyAt) return;

    const direction = this.moveDirection();
    // 정지 상태에서는 조준 방향으로 대시한다.
    this.dashAngle = direction ? Math.atan2(direction.y, direction.x) : this.aimAngle();
    this.dashUntil = this.time.now + DASH_DURATION_MS;
    this.dashReadyAt = this.time.now + DASH_COOLDOWN_MS;
  }

  private tryFire(): void {
    if (this.run.phase !== 'combat') return;
    if (this.time.now - this.lastFiredAt < FIRE_COOLDOWN_MS) return;
    this.lastFiredAt = this.time.now;

    const resolved = resolveSkill(ARROW_SHOT, this.run.attached);
    for (const state of spawnProjectiles(
      resolved.stats,
      resolved.behaviors,
      { x: this.player.x, y: this.player.y },
      this.aimAngle(),
    )) {
      this.projectiles.push({
        state,
        view: this.add.circle(state.x, state.y, 5, COLORS.accent).setDepth(8),
      });
    }
  }

  private aimAngle(): number {
    const pointer = this.input.activePointer;
    return Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      pointer.worldX,
      pointer.worldY,
    );
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

  // ───────────────────────── 웨이브

  private startWave(): void {
    const wave = WAVES[this.run.waveIndex];
    if (!wave) return;

    for (const spawn of wave.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        const at = this.edgeSpawnPoint();
        const enemy = createEnemy(spawn.kind, at.x, at.y);
        const stats = ENEMY_STATS[enemy.kind];

        const view = this.add
          .rectangle(enemy.x, enemy.y, stats.radius * 2, stats.radius * 2, stats.color)
          .setDepth(5);
        const hpBar = this.add
          .rectangle(enemy.x, enemy.y - stats.radius - 7, stats.radius * 2, 3, 0x6ee7a8)
          .setDepth(6);

        this.enemies.push({ state: enemy, view, hpBar });
      }
    }
    this.refreshHud();
  }

  /** 화면 가장자리에서, 플레이어와 너무 가깝지 않은 곳을 고른다. */
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
    if (this.run.phase !== 'combat') return;
    if (this.enemies.some((e) => isAlive(e.state))) return;

    const wave = WAVES[this.run.waveIndex];
    this.run = clearWave(this.run, wave?.offersSupport ?? false);

    if (this.run.phase === 'offer') {
      this.showOffer();
    } else if (this.run.phase === 'won') {
      this.showResult(true);
    } else {
      this.startWave();
    }
  }

  // ───────────────────────── 갱신 루프

  update(_time: number, delta: number): void {
    const deltaSeconds = delta / 1000;
    if (this.run.phase !== 'combat') return;

    this.run = advanceTime(this.run, deltaSeconds);
    this.movePlayer(deltaSeconds);
    this.updateAim();
    this.updateEnemies(deltaSeconds);
    this.updateProjectiles(deltaSeconds);
    this.checkWaveCleared();
  }

  private movePlayer(deltaSeconds: number): void {
    const dashing = this.time.now < this.dashUntil;
    const direction = dashing
      ? { x: Math.cos(this.dashAngle), y: Math.sin(this.dashAngle) }
      : this.moveDirection();
    if (!direction) return;

    const step = (dashing ? DASH_SPEED : MOVE_SPEED) * deltaSeconds;
    this.player.x = Phaser.Math.Clamp(
      this.player.x + direction.x * step,
      PLAYER_RADIUS,
      GAME_WIDTH - PLAYER_RADIUS,
    );
    this.player.y = Phaser.Math.Clamp(
      this.player.y + direction.y * step,
      PLAYER_RADIUS,
      GAME_HEIGHT - PLAYER_RADIUS,
    );
    this.player.setAlpha(dashing ? 0.55 : 1);
  }

  private updateAim(): void {
    const angle = this.aimAngle();
    this.aimLine.setTo(
      this.player.x,
      this.player.y,
      this.player.x + Math.cos(angle) * 44,
      this.player.y + Math.sin(angle) * 44,
    );
  }

  private updateEnemies(deltaSeconds: number): void {
    const dashing = this.time.now < this.dashUntil;

    for (const entity of this.enemies) {
      const enemy = entity.state;
      if (!isAlive(enemy)) continue;

      const toPlayer = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
      const step = enemySpeed(enemy) * deltaSeconds;
      enemy.x += Math.cos(toPlayer) * step;
      enemy.y += Math.sin(toPlayer) * step;
      entity.view.setPosition(enemy.x, enemy.y);
      entity.hpBar.setPosition(enemy.x, enemy.y - ENEMY_STATS[enemy.kind].radius - 7);

      // 접촉 피해. 대시 중에는 무적이라 통과할 수 있다.
      enemy.sinceContact += deltaSeconds;
      const stats = ENEMY_STATS[enemy.kind];
      const distance = Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y);

      if (!dashing && distance <= stats.radius + PLAYER_RADIUS) {
        if (enemy.sinceContact >= stats.contactCooldown) {
          enemy.sinceContact = 0;

          // 실제로 피해가 들어갔을 때만 연출한다.
          // 무적 시간 중이면 damagePlayer가 같은 상태를 그대로 돌려준다.
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

  private updateProjectiles(deltaSeconds: number): void {
    const alive = this.enemies.filter((e) => isAlive(e.state)).map((e) => e.state);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const entity = this.projectiles[i];
      const projectile = entity.state;
      advance(projectile, deltaSeconds);

      let consumed =
        projectile.x < -40 ||
        projectile.x > GAME_WIDTH + 40 ||
        projectile.y < -40 ||
        projectile.y > GAME_HEIGHT + 40;

      if (!consumed) {
        const hit = this.enemies.find(
          (e) =>
            isAlive(e.state) &&
            Math.hypot(e.state.x - projectile.x, e.state.y - projectile.y) <=
              ENEMY_STATS[e.state.kind].radius,
        );

        if (hit) {
          const outcome = onHitTarget(projectile, hit.state, alive);
          this.damageEnemy(hit, outcome.damage);

          for (const spawned of outcome.spawned) {
            this.projectiles.push({
              state: spawned,
              view: this.add.circle(spawned.x, spawned.y, 5, COLORS.accent).setDepth(8),
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
    enemy.hp = Math.max(0, enemy.hp - damage);

    const stats = ENEMY_STATS[enemy.kind];
    entity.hpBar.width = (stats.radius * 2 * enemy.hp) / enemy.maxHp;

    if (enemy.hp <= 0) {
      entity.view.destroy();
      entity.hpBar.destroy();
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
    this.hpBarFill = this.add
      .rectangle(24, 26, 240, 14, 0x6ee7a8)
      .setOrigin(0, 0.5)
      .setDepth(20);
    this.hud = this.add
      .text(24, 44, '', { fontSize: '15px', color: COLORS.text, lineSpacing: 3 })
      .setDepth(20);

    this.add
      .text(GAME_WIDTH - 24, 20, 'WASD 이동 · 마우스 조준 · 클릭 공격 · Space 대시 · R 재시작', {
        fontSize: '13px',
        color: COLORS.textDim,
      })
      .setOrigin(1, 0)
      .setDepth(20);
  }

  private refreshHud(): void {
    const wave = WAVES[this.run.waveIndex];
    const remaining = this.enemies.filter((e) => isAlive(e.state)).length;
    const resolved = resolveSkill(ARROW_SHOT, this.run.attached);

    this.hpBarFill.width = (240 * this.run.hp) / this.run.maxHp;

    const supportNames = this.run.attached.map((s) => s.name).join(', ') || '없음';
    this.hud.setText(
      [
        `체력 ${Math.ceil(this.run.hp)} / ${this.run.maxHp}`,
        `${wave?.label ?? '-'} (${this.run.waveIndex + 1}/${TOTAL_WAVES})   남은 적 ${remaining}   처치 ${this.run.kills}`,
        `피해 ${resolved.stats.damage?.toFixed(0)}  투사체 ${Math.round(resolved.stats.projectileCount ?? 1)}  보조 ${supportNames}`,
      ].join('\n'),
    );
  }

  private showOffer(): void {
    this.currentOffer = rollOffer(ARROW_SHOT, this.run.attached, SUPPORTS);

    // 고를 것이 없으면 선택 단계를 건너뛴다.
    if (this.currentOffer.length === 0) {
      this.run = pickSupport(this.run, undefined);
      this.startWave();
      return;
    }

    const container = this.add.container(0, 0).setDepth(30);
    container.add(
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0b0f, 0.82),
    );
    container.add(
      this.add
        .text(GAME_WIDTH / 2, 150, '보조능력을 하나 고르세요', {
          fontSize: '30px',
          color: COLORS.text,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    const cardWidth = 300;
    const gap = 32;
    const totalWidth = this.currentOffer.length * cardWidth + (this.currentOffer.length - 1) * gap;
    const startX = (GAME_WIDTH - totalWidth) / 2 + cardWidth / 2;

    for (const [index, support] of this.currentOffer.entries()) {
      const x = startX + index * (cardWidth + gap);
      const card = this.add
        .rectangle(x, GAME_HEIGHT / 2, cardWidth, 240, 0x171a26)
        .setStrokeStyle(2, COLORS.accent)
        .setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => this.choose(index));

      container.add(card);
      container.add(
        this.add
          .text(x, GAME_HEIGHT / 2 - 78, `${index + 1}`, {
            fontSize: '20px',
            color: COLORS.textDim,
          })
          .setOrigin(0.5),
      );
      container.add(
        this.add
          .text(x, GAME_HEIGHT / 2 - 34, support.name, {
            fontSize: '24px',
            color: COLORS.text,
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
      container.add(
        this.add
          .text(x, GAME_HEIGHT / 2 + 34, support.description, {
            fontSize: '14px',
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
        .text(GAME_WIDTH / 2, GAME_HEIGHT - 130, '숫자키 1-3 또는 클릭', {
          fontSize: '15px',
          color: COLORS.textDim,
        })
        .setOrigin(0.5),
    );

    this.overlay = container;
  }

  private choose(index: number): void {
    if (this.run.phase !== 'offer') return;
    const support = this.currentOffer[index];
    if (!support) return;

    this.overlay?.destroy(true);
    this.overlay = null;
    this.run = pickSupport(this.run, support);
    this.startWave();
  }

  private showResult(won: boolean): void {
    const container = this.add.container(0, 0).setDepth(30);
    container.add(
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0b0f, 0.88),
    );
    container.add(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 70, won ? '승리' : '패배', {
          fontSize: '56px',
          color: won ? '#6ee7a8' : '#ff6b6b',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    const summary = [
      `처치 ${this.run.kills}`,
      `시간 ${this.run.elapsed.toFixed(1)}초`,
      `보조능력 ${this.run.attached.map((s) => s.name).join(', ') || '없음'}`,
    ].join('   ');

    container.add(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, summary, {
          fontSize: '17px',
          color: COLORS.text,
        })
        .setOrigin(0.5),
    );
    container.add(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 70, 'R 키로 다시 시작', {
          fontSize: '19px',
          color: COLORS.textDim,
        })
        .setOrigin(0.5),
    );

    this.overlay = container;
  }
}
