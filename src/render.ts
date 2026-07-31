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

/**
 * 카메라가 플레이어를 따라가게 한다. 방이 화면보다 클 때 쓴다.
 *
 * 확대 배율은 그대로 두고 경계만 방 크기로 잡는다. 카메라가 보여주는
 * 월드 영역은 여전히 1280×720이므로, 방이 그보다 크면 스크롤된다.
 * 방이 화면보다 작으면 Phaser가 알아서 가운데로 맞춘다.
 */
export function followInRoom(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  roomWidth: number,
  roomHeight: number,
): void {
  const camera = scene.cameras.main;
  camera.setBounds(0, 0, roomWidth, roomHeight);
  // 부드럽게 따라가되 너무 늘어지지 않게 한다. 조준이 흔들리면 손맛이 나빠진다.
  camera.startFollow(target, true, 0.12, 0.12);
}

/** 화면 좌표에 고정한다. 카메라가 움직여도 따라가지 않는다. */
export function pinToScreen(...objects: Phaser.GameObjects.Components.ScrollFactor[]): void {
  for (const object of objects) object.setScrollFactor(0);
}

/** 뷰포트가 보여주는 월드 크기. */
export const VIEW_WIDTH = CANVAS_WIDTH / RENDER_SCALE;
export const VIEW_HEIGHT = CANVAS_HEIGHT / RENDER_SCALE;

/**
 * 화면 고정 요소의 좌표 보정값.
 *
 * `scrollFactor(0)`은 스크롤만 무시할 뿐 확대는 그대로 받는다.
 * 확대는 캔버스 중심을 기준으로 일어나므로, 화면 좌상단에 해당하는
 * 좌표가 (0, 0)이 아니라 이만큼 안쪽으로 밀린다.
 *
 * 계산: (캔버스크기 / 2) × (1 − 1 / 확대배율)
 */
const PIN_OFFSET_X = (CANVAS_WIDTH / 2) * (1 - 1 / RENDER_SCALE);
const PIN_OFFSET_Y = (CANVAS_HEIGHT / 2) * (1 - 1 / RENDER_SCALE);

/**
 * 오버레이 컨테이너를 화면에 고정한다.
 *
 * `scrollFactor(0)`으로 고정하면 **그리기와 클릭 판정이 서로 다른 기준을 본다.**
 * 그리기는 컨테이너의 변환을 따르는데 클릭 판정은 자식 자신의 scrollFactor를 보기
 * 때문에, 둘이 카메라 스크롤(S)만큼 어긋난다. 화면상 어긋나는 거리는 `S × 확대배율`이라
 * 방이 클수록 커진다. 1번 방(S≈300)에서는 카드가 한 칸씩 밀려 골라졌고,
 * 2번 방(S≈800)에서는 판정이 카드 밖으로 완전히 나가 아무것도 눌리지 않았다.
 *
 * 그래서 고정에 scrollFactor를 쓰지 않는다. 컨테이너를 카메라가 보는 영역의
 * 좌상단으로 옮겨 두면 자식은 평범한 월드 오브젝트가 되어, 그리기와 판정이
 * **같은 변환을 탄다.** 자식 좌표는 화면 좌표(0~1280, 0~720)를 그대로 쓰면 된다.
 *
 * 카메라가 움직이면 어긋나므로 매 프레임 다시 부른다.
 */
export function pinContainer(scene: Phaser.Scene, container: Phaser.GameObjects.Container): void {
  const camera = scene.cameras.main;
  container.setPosition(camera.scrollX + PIN_OFFSET_X, camera.scrollY + PIN_OFFSET_Y);
}

/** 월드 좌표를 `pinContainer` 안에서 쓰는 화면 로컬 좌표로 바꾼다. */
export function worldToScreenLocal(scene: Phaser.Scene, point: { x: number; y: number }): { x: number; y: number } {
  const camera = scene.cameras.main;
  return {
    x: point.x - camera.scrollX - PIN_OFFSET_X,
    y: point.y - camera.scrollY - PIN_OFFSET_Y,
  };
}

/** 포인터 위치를 `pinContainer` 안에서 쓰는 화면 로컬 좌표로 바꾼다. */
export function pointerScreenLocal(scene: Phaser.Scene, pointer: Phaser.Input.Pointer): { x: number; y: number } {
  return worldToScreenLocal(scene, scene.cameras.main.getWorldPoint(pointer.x, pointer.y));
}

/** 화면 왼쪽에서 x픽셀 떨어진 위치. 고정 요소에만 쓴다. */
export function screenX(x: number): number {
  return PIN_OFFSET_X + x;
}

/** 화면 위에서 y픽셀 떨어진 위치. 고정 요소에만 쓴다. */
export function screenY(y: number): number {
  return PIN_OFFSET_Y + y;
}
