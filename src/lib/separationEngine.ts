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

export const getBlockedDefenderIds = (
  blockers: { position: Point }[],
  defenders: { id: string; position: Point }[],
  blockRadius = 1.8
): Set<string> => {
  const blocked = new Set<string>();

  for (const blocker of blockers) {
    let nearest: { id: string; distance: number } | undefined;
    for (const defender of defenders) {
      if (blocked.has(defender.id)) continue;
      const defenderDistance = distance(blocker.position, defender.position);
      if (!nearest || defenderDistance < nearest.distance) {
        nearest = { id: defender.id, distance: defenderDistance };
      }
    }

    if (nearest && nearest.distance <= blockRadius) {
      blocked.add(nearest.id);
    }
  }

  return blocked;
};
