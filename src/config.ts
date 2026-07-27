/**
 * 월드 좌표계 크기. 게임 로직과 배치는 전부 이 좌표를 쓴다.
 * 이 값은 바꾸지 않는다. 바꾸면 모든 위치·속도·크기 상수가 같이 흔들린다.
 */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/**
 * 캔버스(백버퍼)를 월드보다 몇 배로 잡을지.
 *
 * 캔버스가 월드와 같은 1280×720이면, 고DPI 화면에서 브라우저가 그 버퍼를
 * 물리 픽셀로 늘리면서 뭉갠다. 실측으로 DPR 2 환경에서 1.6배, 전체화면이면
 * 2배 이상 확대되어 흐릿해진다.
 *
 * 백버퍼를 1920×1080으로 잡고 카메라를 같은 배율로 확대하면, 화면에 보이는
 * 월드 영역은 그대로 1280×720이면서 렌더 해상도만 올라간다.
 * 게임 상수를 하나도 건드리지 않고 선명도만 얻는 방법이다.
 */
export const RENDER_SCALE = 1.5;
export const CANVAS_WIDTH = GAME_WIDTH * RENDER_SCALE;
export const CANVAS_HEIGHT = GAME_HEIGHT * RENDER_SCALE;

export const COLORS = {
  background: 0x0a0b0f,
  player: 0x6ea8ff,
  accent: 0xffa159,
  text: '#e6e8ef',
  textDim: '#8b90a3',
  accentText: '#ffa159',
} as const;

/** 상태이상 표시 색. 적에게 걸린 상태를 점으로 그린다. */
export const STATUS_COLORS = {
  wound: 0xff6b6b,
  exposed: 0xffd23d,
  brand: 0xb08bff,
  fracture: 0x9ad0ff,
} as const;
