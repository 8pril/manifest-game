import Phaser from 'phaser';
import { applyRenderScale } from '@/render';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '@/config';

/**
 * 타이틀 화면.
 *
 * 새 기획의 시작점은 무기 선택이 아니라 검 1종 고정이다.
 * 기존 SelectScene은 조합 확인용 개발 씬으로 남긴다.
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
      .text(cx, GAME_HEIGHT / 2 - 20, '검 하나로 시작해 실체화 무기를 되찾는 탑다운 핵앤슬래시', {
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

    this.input.once('pointerdown', () => this.scene.start('Play'));
    this.input.keyboard?.once('keydown', () => this.scene.start('Play'));
  }
}
