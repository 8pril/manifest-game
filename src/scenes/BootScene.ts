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
  'enemy-boss-warden',
  'enemy-boss-glutton',
  'npc-keeper',
  'drop-item',
  'key-upper',
  'key-lower',
  'bolt-sword',
  'bolt-bow',
  'bolt-arcane',
  'bolt-enemy',
  'tile-floor',
  'tile-wall',
  'lore-stone',
  'prop-rubble',
  'prop-pillar',
  'prop-bones',
  'prop-brazier',
  'weapon-sword',
  'weapon-bow',
  'weapon-arcane',
  'weapon-shield',
  'combo-ring',
  'potion',
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
    // 타이틀 배경만 JPEG다. 투명도가 필요 없는 전체 화면 그림이라 PNG로 두면 2.1MB인데
    // JPEG로는 214KB다. 심사위원이 링크를 열었을 때 첫 화면이 늦게 뜨면 안 된다.
    this.load.image('title-bg', 'title-bg.jpg');
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`스프라이트 로딩 실패: ${file.key}. 도형으로 대체한다.`);
    });
  }

  create(): void {
    applyRenderScale(this);
    const cx = GAME_WIDTH / 2;

    // 배경 키 아트. 없으면 예전처럼 빈 화면에 글자만 나온다.
    // 화면비가 어긋나도 여백이 생기지 않도록 긴 쪽에 맞춰 덮고 넘치는 만큼 잘라낸다.
    if (this.textures.exists('title-bg')) {
      const bg = this.add.image(cx, GAME_HEIGHT / 2, 'title-bg').setDepth(-1);
      bg.setScale(Math.max(GAME_WIDTH / bg.width, GAME_HEIGHT / bg.height));
      // 얇게만 덮는다. 이 그림은 광원이 보라색 빛줄기 하나뿐이라 세게 누르면 그게 죽는다.
      this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05060a, 0.12).setDepth(-1);
    }

    this.add
      .text(cx, GAME_HEIGHT / 2 - 80, 'MANIFEST: LOST ECHOES', {
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
