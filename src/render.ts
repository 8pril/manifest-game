import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT, RENDER_SCALE } from '@/config';

/**
 * 캔버스를 월드보다 크게 잡아 놓고, 카메라를 같은 배율로 확대해
 * 화면에 보이는 월드 영역을 원래대로 되돌린다.
 *
 * 결과적으로 좌표계는 1280×720 그대로인데 백버퍼만 1920×1080이 되어,
 * 고DPI 화면에서 브라우저가 늘리는 비율이 1.6배에서 1.07배로 줄어든다.
 *
 * 모든 씬의 `create()` 맨 앞에서 호출해야 한다.
 */
export function applyRenderScale(scene: Phaser.Scene): void {
  const camera = scene.cameras.main;
  camera.setZoom(RENDER_SCALE);

  // 카메라 스크롤은 확대 전 뷰포트의 좌상단을 가리킨다.
  // 월드 중심(640, 360)이 화면 중심에 오도록 뷰포트 절반만큼 당긴다.
  camera.setScroll(GAME_WIDTH / 2 - CANVAS_WIDTH / 2, GAME_HEIGHT / 2 - CANVAS_HEIGHT / 2);

  // 텍스트는 자기 크기대로 텍스처를 구운 뒤 카메라 확대에 같이 늘어나므로,
  // 그대로 두면 도형만 선명해지고 글자는 오히려 더 흐려진다.
  // 씬에 추가되는 모든 Text의 렌더 해상도를 확대 배율에 맞춘다.
  scene.events.on(
    Phaser.Scenes.Events.ADDED_TO_SCENE,
    (object: Phaser.GameObjects.GameObject) => {
      if (object instanceof Phaser.GameObjects.Text) {
        object.setResolution(RENDER_SCALE);
      }
    },
  );
}
