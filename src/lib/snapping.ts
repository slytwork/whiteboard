import { clampFieldPoint, Point } from './coordinateSystem';

const snapUnit = (value: number) => Math.round(value);

export const snapPointToYard = (point: Point): Point => {
  const clamped = clampFieldPoint(point);
  return {
    x: snapUnit(clamped.x),
    y: snapUnit(clamped.y)
  };
};
