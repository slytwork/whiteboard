import { Point } from './coordinateSystem';

export type SeparationResult = {
  offensiveId: string;
  nearestDefenderDistance: number;
  isOpen: boolean;
};

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export const getNearestDefenderDistance = (offensePoint: Point, defenders: Point[]) => {
  if (!defenders.length) return Number.POSITIVE_INFINITY;
  return Math.min(...defenders.map((defender) => distance(offensePoint, defender)));
};

export const evaluateSeparation = (
  offense: { id: string; position: Point }[],
  defenders: { position: Point }[],
  openRadius = 2
): SeparationResult[] => {
  const defenderPositions = defenders.map((d) => d.position);
  return offense.map((player) => {
    const nearestDefenderDistance = getNearestDefenderDistance(player.position, defenderPositions);
    return {
      offensiveId: player.id,
      nearestDefenderDistance,
      isOpen: nearestDefenderDistance > openRadius
    };
  });
};
