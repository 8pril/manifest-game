import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '@/config';
import { SUPPORTS } from '@/data/supports';
import { SKILLS } from '@/data/skills';
import { canAttach, resolveSkill, type Skill, type Support } from '@/engine/support';
import {
  spawnProjectiles,
  advance,
  onHitTarget,
  onHitTerrain,
  resetProjectileIds,
  type Projectile,
  type Target,
} from '@/engine/projectile';
import {
  createArea,
  tickArea,
  containsPoint,
  remainingRatio,
  resetAreaIds,
  AREA_COLORS,
  type Area,
} from '@/engine/area';

const MOVE_SPEED = 320;
const TARGET_RADIUS = 18;
const TARGET_MAX_HP = 400;
const FIRE_COOLDOWN_MS = 260;

interface TargetEntity {
  state: Target;
  view: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
  hp: number;
}

interface ProjectileEntity {
  state: Projectile;
  view: Phaser.GameObjects.Arc;
}

interface AreaEntity {
  state: Area;
  view: Phaser.GameObjects.Arc;
}

/**
 * M3 엔진 검증 씬.
 *
 * 게임플레이가 아니라 엔진 확인용 화면이다. 세 엔진이 실제로 맞물려
 * 도는지 눈으로 보기 위한 것이며, M4에서 웨이브 구조로 대체된다.
 *
 *  - 태그 시스템: 스킬을 바꾸면 장착 가능한 보조능력 목록이 바뀐다
 *  - 수정자 파이프라인: 보조능력을 켜면 HUD의 수치가 즉시 바뀐다
 *  - 투사체 / 지대 엔진: 관통·연쇄·갈래·튕겨쏘기와 지대가 실제로 동작한다
 */
export class PlayScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;
  private aimLine!: Phaser.GameObjects.Line;
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

  private targets: TargetEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private areas: AreaEntity[] = [];

  private skillIndex = 0;
  private attached: Support[] = [];
  private lastFiredAt = 0;

  private hud!: Phaser.GameObjects.Text;
  private supportList!: Phaser.GameObjects.Text;

  constructor() {
    super('Play');
  }

  private get skill(): Skill {
    return SKILLS[this.skillIndex];
  }

  /** 현재 스킬에 장착 가능한 보조능력. 태그 시스템이 걸러낸 결과다. */
  private get attachable(): Support[] {
    return SUPPORTS.filter(
      (s) => canAttach(this.skill, s).ok || this.attached.some((a) => a.id === s.id),
    );
  }

  create(): void {
    resetProjectileIds();
    resetAreaIds();
    this.targets = [];
    this.projectiles = [];
    this.areas = [];
    this.attached = [];

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

    this.spawnTargets();

    this.player = this.add.circle(220, GAME_HEIGHT / 2, 16, COLORS.player).setDepth(10);
    this.aimLine = this.add
      .line(0, 0, 0, 0, 0, 0, COLORS.accent)
      .setOrigin(0, 0)
      .setLineWidth(2)
      .setDepth(9);

    this.bindInput();
    this.buildHud();
    this.refreshHud();
  }

  private spawnTargets(): void {
    const positions = [
      { x: 760, y: 220 },
      { x: 900, y: 360 },
      { x: 760, y: 500 },
      { x: 1040, y: 280 },
      { x: 1040, y: 440 },
    ];

    for (const [index, pos] of positions.entries()) {
      const view = this.add
        .rectangle(pos.x, pos.y, TARGET_RADIUS * 2, TARGET_RADIUS * 2, 0xd4574e)
        .setDepth(5);
      const hpBar = this.add
        .rectangle(pos.x, pos.y - TARGET_RADIUS - 8, TARGET_RADIUS * 2, 4, 0x6ee7a8)
        .setDepth(6);

      this.targets.push({
        state: { id: index + 1, x: pos.x, y: pos.y },
        view,
        hpBar,
        hp: TARGET_MAX_HP,
      });
    }
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('키보드 입력을 사용할 수 없습니다.');

    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Tab: 스킬 전환. 장착 목록이 태그에 따라 통째로 바뀐다.
    keyboard.on('keydown-TAB', (event: KeyboardEvent) => {
      event.preventDefault();
      this.skillIndex = (this.skillIndex + 1) % SKILLS.length;
      this.attached = [];
      this.refreshHud();
    });

    // 숫자 키: 보조능력 토글
    for (let i = 1; i <= 9; i++) {
      keyboard.on(`keydown-${digitKeyName(i)}`, () => this.toggleSupport(i - 1));
    }

    keyboard.on('keydown-R', () => this.scene.restart());

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.useSkill(pointer));
  }

  private toggleSupport(index: number): void {
    const support = this.attachable[index];
    if (!support) return;

    const existing = this.attached.findIndex((s) => s.id === support.id);
    if (existing >= 0) {
      this.attached.splice(existing, 1);
    } else if (canAttach(this.skill, support, this.attached).ok) {
      this.attached.push(support);
    }
    this.refreshHud();
  }

  private useSkill(pointer: Phaser.Input.Pointer): void {
    if (this.time.now - this.lastFiredAt < FIRE_COOLDOWN_MS) return;
    this.lastFiredAt = this.time.now;

    const resolved = resolveSkill(this.skill, this.attached);
    const angle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      pointer.worldX,
      pointer.worldY,
    );

    if (this.skill.tags.includes('지대')) {
      const area = createArea(resolved.stats, resolved.behaviors, {
        x: pointer.worldX,
        y: pointer.worldY,
      });
      this.areas.push({ state: area, view: this.createAreaView(area) });
      return;
    }

    for (const state of spawnProjectiles(
      resolved.stats,
      resolved.behaviors,
      { x: this.player.x, y: this.player.y },
      angle,
    )) {
      this.projectiles.push({ state, view: this.createProjectileView(state) });
    }
  }

  private createProjectileView(state: Projectile): Phaser.GameObjects.Arc {
    return this.add.circle(state.x, state.y, 5, COLORS.accent).setDepth(8);
  }

  private createAreaView(area: Area): Phaser.GameObjects.Arc {
    return this.add
      .circle(area.x, area.y, area.radius, AREA_COLORS[area.kind], 0.28)
      .setDepth(1);
  }

  update(_time: number, delta: number): void {
    const deltaSeconds = delta / 1000;
    this.movePlayer(deltaSeconds);
    this.updateAim();
    this.updateProjectiles(deltaSeconds);
    this.updateAreas(deltaSeconds);
  }

  private movePlayer(deltaSeconds: number): void {
    let dx = 0;
    let dy = 0;
    if (this.keys.left.isDown) dx -= 1;
    if (this.keys.right.isDown) dx += 1;
    if (this.keys.up.isDown) dy -= 1;
    if (this.keys.down.isDown) dy += 1;
    if (dx === 0 && dy === 0) return;

    // 대각선 이동이 빨라지지 않도록 정규화한다.
    const length = Math.hypot(dx, dy);
    const step = MOVE_SPEED * deltaSeconds;
    this.player.x = Phaser.Math.Clamp(this.player.x + (dx / length) * step, 16, GAME_WIDTH - 16);
    this.player.y = Phaser.Math.Clamp(this.player.y + (dy / length) * step, 16, GAME_HEIGHT - 16);
  }

  private updateAim(): void {
    const pointer = this.input.activePointer;
    const angle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      pointer.worldX,
      pointer.worldY,
    );
    this.aimLine.setTo(
      this.player.x,
      this.player.y,
      this.player.x + Math.cos(angle) * 48,
      this.player.y + Math.sin(angle) * 48,
    );
  }

  private updateProjectiles(deltaSeconds: number): void {
    const alive = this.targets.filter((t) => t.hp > 0).map((t) => t.state);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const entity = this.projectiles[i];
      const projectile = entity.state;
      advance(projectile, deltaSeconds);

      let consumed = false;

      // 지형(화면 경계) 충돌
      const outOfBoundsX = projectile.x <= 0 || projectile.x >= GAME_WIDTH;
      const outOfBoundsY = projectile.y <= 0 || projectile.y >= GAME_HEIGHT;
      if (outOfBoundsX || outOfBoundsY) {
        const result = onHitTerrain(projectile, outOfBoundsX ? 'vertical' : 'horizontal');
        if (result.consumed) {
          consumed = true;
        } else {
          projectile.x = Phaser.Math.Clamp(projectile.x, 1, GAME_WIDTH - 1);
          projectile.y = Phaser.Math.Clamp(projectile.y, 1, GAME_HEIGHT - 1);
        }
      }

      // 적 충돌
      if (!consumed) {
        const hit = this.targets.find(
          (t) =>
            t.hp > 0 &&
            Math.hypot(t.state.x - projectile.x, t.state.y - projectile.y) <= TARGET_RADIUS,
        );

        if (hit) {
          const outcome = onHitTarget(projectile, hit.state, alive);
          this.damageTarget(hit, outcome.damage);

          for (const spawned of outcome.spawned) {
            this.projectiles.push({ state: spawned, view: this.createProjectileView(spawned) });
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

  private updateAreas(deltaSeconds: number): void {
    for (let i = this.areas.length - 1; i >= 0; i--) {
      const entity = this.areas[i];
      const result = tickArea(entity.state, deltaSeconds);

      if (result.ticked) {
        for (const target of this.targets) {
          if (target.hp > 0 && containsPoint(entity.state, target.state)) {
            this.damageTarget(target, entity.state.damagePerTick);
          }
        }
      }

      // 남은 시간에 따라 옅어지게 하여 만료 시점을 눈으로 알 수 있게 한다.
      entity.view.setAlpha(0.15 + 0.35 * remainingRatio(entity.state));

      if (result.expired) {
        entity.view.destroy();
        this.areas.splice(i, 1);
      }
    }
  }

  private damageTarget(target: TargetEntity, damage: number): void {
    target.hp = Math.max(0, target.hp - damage);
    target.hpBar.width = (TARGET_RADIUS * 2 * target.hp) / TARGET_MAX_HP;

    if (target.hp <= 0) {
      target.view.setFillStyle(0x3a3f52);
      target.hpBar.setVisible(false);
    }
  }

  private buildHud(): void {
    this.hud = this.add.text(24, 20, '', { fontSize: '15px', color: COLORS.text }).setDepth(20);
    this.supportList = this.add
      .text(24, 96, '', { fontSize: '14px', color: COLORS.textDim, lineSpacing: 4 })
      .setDepth(20);
  }

  private refreshHud(): void {
    const resolved = resolveSkill(this.skill, this.attached);
    const stats = resolved.stats;

    const parts = [
      `스킬: ${this.skill.name}  [${this.skill.tags.join('·')}]`,
      `피해 ${stats.damage?.toFixed(1) ?? '-'}` +
        (stats.projectileCount ? `  투사체 ${Math.round(stats.projectileCount)}` : '') +
        (stats.areaRadius ? `  반경 ${Math.round(stats.areaRadius)}` : '') +
        (stats.tickInterval ? `  틱 ${stats.tickInterval.toFixed(2)}초` : '') +
        (stats.duration ? `  지속 ${stats.duration.toFixed(1)}초` : ''),
      `거동: ${resolved.behaviors.map((b) => b.kind).join(', ') || '없음'}`,
      'Tab 스킬 전환 · 숫자키 보조능력 토글 · 클릭 사용 · R 재시작',
    ];
    this.hud.setText(parts.join('\n'));

    const lines = this.attachable.map((support, index) => {
      const on = this.attached.some((s) => s.id === support.id);
      return `${on ? '■' : '□'} ${index + 1}. ${support.name} — ${support.description}`;
    });
    this.supportList.setText(
      [`장착 ${this.attached.length}/${this.skill.supportSlots}`, ...lines].join('\n'),
    );
  }
}

function digitKeyName(digit: number): string {
  return ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'][digit];
}
