import Phaser from 'phaser';
import { applyRenderScale } from '@/render';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '@/config';

/**
 * 타이틀 화면. 지금은 배포 경로 검증용 최소 화면이며,
 * 실제 무기 선택 UI는 M4 이후에 이 씬을 대체한다.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    applyRenderScale(this);
    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, GAME_HEIGHT / 2 - 80, 'NAN 2026 예선 빌드', {
        fontSize: '48px',
        color: COLORS.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, GAME_HEIGHT / 2 - 20, '무기와 보조능력을 조합하는 액션 로그라이트', {
        fontSize: '20px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(cx, GAME_HEIGHT / 2 + 60, '클릭하거나 아무 키나 눌러 시작', {
        fontSize: '22px',
        color: COLORS.text,
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.3,
      duration: 900,
      yoyo: true,
      repeat: -1,
    });

    this.input.once('pointerdown', () => this.scene.start('Select'));
    this.input.keyboard?.once('keydown', () => this.scene.start('Select'));
  }
}
