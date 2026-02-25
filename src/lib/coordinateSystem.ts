export const YARD_TO_PX = 12;
export const FIELD_WIDTH_YARDS = 53.3;
export const FIELD_LENGTH_YARDS = 120;
export const PLAYABLE_START_YARD = 10;
export const PLAYABLE_END_YARD = 110;

export type Point = {
  x: number;
  y: number;
};

export const FIELD_WIDTH_PX = FIELD_WIDTH_YARDS * YARD_TO_PX;
export const FIELD_LENGTH_PX = FIELD_LENGTH_YARDS * YARD_TO_PX;

export const yardsToPx = (yards: number) => yards * YARD_TO_PX;

export const pxToYards = (px: number) => px / YARD_TO_PX;

export const clampFieldPoint = (point: Point): Point => ({
  x: Math.max(0, Math.min(FIELD_WIDTH_YARDS, point.x)),
  y: Math.max(0, Math.min(FIELD_LENGTH_YARDS, point.y))
});
