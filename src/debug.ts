import { CANVAS_WIDTH, CANVAS_HEIGHT, RENDER_SCALE } from '@/config';

/**
 * 개발 빌드 전용 상태 노출.
 *
 * 헤드리스 브라우저로 게임을 검증할 때, 드라이버가 적 위치를 모르면
 * 가만히 서서 맞아 죽거나 허공에 쏘는 것 둘 중 하나밖에 못 한다.
 * 살아 있으면서 특정 적을 계속 때리는 상태를 만들 수 없어서
 * 상처 폭발이나 보스 클리어 같은 것을 확인할 수 없었다.
 *
 * `import.meta.env.DEV`는 프로덕션 빌드에서 `false`로 치환되고
 * 죽은 분기는 제거되므로 제출 빌드에는 포함되지 않는다.
 */

export interface DebugEnemy {
  id: number;
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

export interface DebugState {
  phase: string;
  roomIndex: number;
  totalRooms: number;
  hp: number;
  maxHp: number;
  kills: number;
  elapsed: number;
  player: { x: number; y: number };
  enemies: DebugEnemy[];
  combo: { left: number; right: number; required: number };
  /** 출구가 열렸으면 그 위치. 닫혀 있으면 null. */
  exit: { x: number; y: number } | null;
  /** 규칙 발동 횟수. 검증 드라이버가 변화를 감지해 그 순간을 찍는다. */
  events: { burst: number; wallSlam: number; brand: number; woundConsume: number };
  /** 살아 있는 투사체 수. 발사가 실제로 나갔는지 확인하는 데 쓴다. */
  projectiles: number;
  /** 현재 방의 크기. */
  room: { width: number; height: number };
  /**
   * 게임이 인식하는 포인터의 월드 좌표.
   *
   * 드라이버가 월드 좌표를 캔버스 픽셀로 바꿔 클릭할 때, 확대와 스크롤을
   * 직접 계산하면 틀리기 쉽다. 실제로 조준이 320px 어긋나 원거리 공격이
   * 전부 빗나간 적이 있다. 게임이 쓰는 값을 그대로 노출해 계산을 검증한다.
   */
  pointer: { x: number; y: number };
  /** 월드 좌표를 화면 좌표로 바꾸는 데 필요한 값. */
  view: {
    zoom: number;
    scrollX: number;
    scrollY: number;
    canvasWidth: number;
    canvasHeight: number;
  };
}

export const DEBUG_ENABLED = import.meta.env.DEV;

/**
 * 카메라 스크롤은 방마다, 프레임마다 달라진다.
 * 고정값을 넣어 두면 드라이버가 계산한 클릭 좌표가 조용히 어긋나므로
 * 씬이 실제 카메라 값을 넘겨준다.
 */
export function publishDebugState(
  state: Omit<DebugState, 'view'> & { scroll: { x: number; y: number } },
): void {
  if (!DEBUG_ENABLED) return;

  const { scroll, ...rest } = state;
  (globalThis as unknown as { __debug?: DebugState }).__debug = {
    ...rest,
    view: {
      zoom: RENDER_SCALE,
      scrollX: scroll.x,
      scrollY: scroll.y,
      canvasWidth: CANVAS_WIDTH,
      canvasHeight: CANVAS_HEIGHT,
    },
  };
}
