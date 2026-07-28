import { GAME_WIDTH, GAME_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT, RENDER_SCALE } from '@/config';

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
  waveIndex: number;
  totalWaves: number;
  hp: number;
  maxHp: number;
  kills: number;
  elapsed: number;
  player: { x: number; y: number };
  enemies: DebugEnemy[];
  combo: { left: number; right: number; required: number };
  offerCount: number;
  /** 규칙 발동 횟수. 검증 드라이버가 변화를 감지해 그 순간을 찍는다. */
  events: { burst: number; wallSlam: number; brand: number };
  /** 월드 좌표를 화면 좌표로 바꾸는 데 필요한 값. */
  view: {
    zoom: number;
    scrollX: number;
    scrollY: number;
    canvasWidth: number;
    canvasHeight: number;
    worldWidth: number;
    worldHeight: number;
  };
}

export const DEBUG_ENABLED = import.meta.env.DEV;

export function publishDebugState(state: Omit<DebugState, 'view'>): void {
  if (!DEBUG_ENABLED) return;

  (globalThis as unknown as { __debug?: DebugState }).__debug = {
    ...state,
    view: {
      zoom: RENDER_SCALE,
      scrollX: GAME_WIDTH / 2 - CANVAS_WIDTH / 2,
      scrollY: GAME_HEIGHT / 2 - CANVAS_HEIGHT / 2,
      canvasWidth: CANVAS_WIDTH,
      canvasHeight: CANVAS_HEIGHT,
      worldWidth: GAME_WIDTH,
      worldHeight: GAME_HEIGHT,
    },
  };
}
