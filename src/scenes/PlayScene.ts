import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '@/config';

const MOVE_SPEED = 320;

/**
 * 게임 루프 골격.
 * 지금은 WASD 이동과 마우스 조준만 있으며, 이는 Phaser 입력·업데이트 루프가
 * 실제로 동작하는지 확인하기 위한 최소 구현이다.
 * 전투 시스템은 M3(엔진 3종) 이후에 이 위에 올린다.
 */
export class PlayScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;
  private aimLine!: Phaser.GameObjects.Line;
  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super('Play');
  }

  create(): void {
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

    this.player = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 16, COLORS.player);
    this.aimLine = this.add.line(0, 0, 0, 0, 0, 0, COLORS.accent).setOrigin(0, 0).setLineWidth(2);

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('키보드 입력을 사용할 수 없습니다.');
    }
    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.add.text(24, 24, 'WASD 이동 / 마우스 조준', {
      fontSize: '16px',
      color: COLORS.textDim,
    });
  }

  update(_time: number, delta: number): void {
    const step = (MOVE_SPEED * delta) / 1000;

    let dx = 0;
    let dy = 0;
    if (this.keys.left.isDown) dx -= 1;
    if (this.keys.right.isDown) dx += 1;
    if (this.keys.up.isDown) dy -= 1;
    if (this.keys.down.isDown) dy += 1;

    if (dx !== 0 || dy !== 0) {
      // 대각선 이동이 빨라지지 않도록 정규화한다.
      const len = Math.hypot(dx, dy);
      this.player.x = Phaser.Math.Clamp(this.player.x + (dx / len) * step, 16, GAME_WIDTH - 16);
      this.player.y = Phaser.Math.Clamp(this.player.y + (dy / len) * step, 16, GAME_HEIGHT - 16);
    }

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
}
