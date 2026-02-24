import { clampFieldPoint, Point } from './coordinateSystem';

const SNAP_INCREMENT_YARDS = 0.2;
const snapUnit = (value: number) => Math.round(value / SNAP_INCREMENT_YARDS) * SNAP_INCREMENT_YARDS;

export const snapPointToYard = (point: Point): Point => {
  const clamped = clampFieldPoint(point);
  return {
    x: snapUnit(clamped.x),
    y: snapUnit(clamped.y)
  };
};
