/** 게임 논리 해상도. Scale.FIT으로 화면 크기에 맞춰 축소/확대된다. */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

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
