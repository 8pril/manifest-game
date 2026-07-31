import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT, COLORS } from '@/config';
import { BootScene } from '@/scenes/BootScene';
import { PlayScene } from '@/scenes/PlayScene';

/**
 * 개발용 진입 지점 지정. `?scene=Play`로 열면 타이틀을 건너뛴다.
 * 특정 화면을 반복 확인할 때 클릭 단계를 없애기 위한 장치이며,
 * 값이 없거나 모르는 이름이면 평소대로 타이틀부터 시작한다.
 */
const SCENES = [BootScene, PlayScene];
const requested = new URLSearchParams(location.search).get('scene');
const startIndex = SCENES.findIndex((s) => s.name === `${requested}Scene`);
const scene = startIndex > 0 ? [SCENES[startIndex], ...SCENES.filter((_, i) => i !== startIndex)] : SCENES;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // 월드는 1280x720이지만 백버퍼는 그보다 크게 잡는다. 이유는 config.ts 참고.
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: COLORS.background,
  // FIT + CENTER_BOTH: 데스크톱 우선이지만 모바일 브라우저에서 열어도
  // 캔버스가 화면에 맞춰 축소되어 레이아웃이 깨지지 않는다.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
  scene,
});
