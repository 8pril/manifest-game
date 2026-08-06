import Phaser from 'phaser';
import { applyRenderScale } from '@/render';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '@/config';

/**
 * 타이틀 화면.
 *
 * 새 기획의 시작점은 무기 선택이 아니라 검 1종 고정이다.
 */
/** 스프라이트 키 = 파일명. `public/sprites/`에 있고 base는 상대 경로다. */
export const SPRITE_KEYS = [
  'player',
  'enemy-chaser',
  'enemy-archer',
  'enemy-brute',
  'enemy-boss',
  'enemy-boss2',
  'npc-keeper',
  'drop-item',
  'bolt-sword',
  'bolt-bow',
  'bolt-arcane',
  'bolt-enemy',
  'tile-floor',
  'weapon-sword',
  'weapon-bow',
  'weapon-arcane',
  'weapon-shield',
  'combo-ring',
] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // 이미지가 없어도 게임은 도형으로 돌아가야 한다. 로딩 실패가 진행을 막지 않도록
    // 타이틀에서 미리 받아두기만 하고, PlayScene은 있으면 쓰고 없으면 도형을 쓴다.
    this.load.setPath(`${import.meta.env.BASE_URL}sprites/`);
    for (const key of SPRITE_KEYS) this.load.image(key, `${key}.png`);
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`스프라이트 로딩 실패: ${file.key}. 도형으로 대체한다.`);
    });
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
