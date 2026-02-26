import { FIELD_WIDTH_YARDS, Point } from './coordinateSystem';
import type { AssignmentType } from './movementEngine';

export type SeparationResult = {
  offensiveId: string;
  nearestDefenderDistance: number;
  isOpen: boolean;
};

export type ZoneCoverageArea = {
  defenderId: string;
  shape: 'circle' | 'ellipse';
  center?: Point;
  radius?: number;
  radiusX?: number;
  radiusY?: number;
};

type ZoneAssignablePlayer = {
  id: string;
  role: string;
  assignment: AssignmentType;
  position: Point;
  path: Point[];
};

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const seededIndex = (seed: string, length: number): number => {
  if (length <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % length;
};

const clampEllipseCenter = (
  center: Point,
  radiusX: number,
  radiusY: number,
  lineOfScrimmageYard: number
): Point => ({
  x: clamp(center.x, radiusX, FIELD_WIDTH_YARDS - radiusX),
  y: clamp(center.y, radiusY, lineOfScrimmageYard - radiusY)
});

const clampCircleCenter = (
  center: Point,
  radius: number,
  lineOfScrimmageYard: number
): Point =>
  clampEllipseCenter(center, radius, radius, lineOfScrimmageYard);

export const getZoneCoverageForDefender = (
  defender: ZoneAssignablePlayer,
  lineOfScrimmageYard: number
): ZoneCoverageArea | undefined => {
  if (defender.assignment !== 'zone') return undefined;

  const center = defender.path.length
    ? defender.path[defender.path.length - 1]
    : defender.position;

  const leftFlatMinX = 6;
  const leftFlatMaxX = 21;
  const rightFlatMinX = 32.3;
  const rightFlatMaxX = 47;
  const inLeftFlatBand = center.x >= leftFlatMinX && center.x <= leftFlatMaxX;
  const inRightFlatBand = center.x >= rightFlatMinX && center.x <= rightFlatMaxX;
  const isFlatZone = inLeftFlatBand || inRightFlatBand;

  if (isFlatZone) {
    const width = inLeftFlatBand
      ? leftFlatMaxX - leftFlatMinX
      : rightFlatMaxX - rightFlatMinX;
    const radiusX = width / 2;
    const radiusY = 2.5;
    const clampedCenter = clampEllipseCenter(
      center,
      radiusX,
      radiusY,
      lineOfScrimmageYard
    );
    return {
      defenderId: defender.id,
      shape: 'ellipse',
      center: clampedCenter,
      radiusX,
      radiusY
    };
  }

  const isDeepThirdZone =
    defender.role === 'DB' && center.y <= lineOfScrimmageYard - 10;
  if (isDeepThirdZone) {
    const radiusX = 4.2;
    const radiusY = 4.8;
    const clampedCenter = clampEllipseCenter(
      center,
      radiusX,
      radiusY,
      lineOfScrimmageYard
    );
    return {
      defenderId: defender.id,
      shape: 'ellipse',
      center: clampedCenter,
      radiusX,
      radiusY
    };
  }

  const travelDistance = distance(defender.position, center);
  const radius = clamp(2.8 + travelDistance * 0.28, 3, 6.5);
  const clampedCenter = clampCircleCenter(center, radius, lineOfScrimmageYard);
  return {
    defenderId: defender.id,
    shape: 'circle',
    center: clampedCenter,
    radius
  };
};

export const isPointInsideZone = (point: Point, zone: ZoneCoverageArea): boolean => {
  if (zone.shape === 'ellipse') {
    if (!zone.center || zone.radiusX === undefined || zone.radiusY === undefined) {
      return false;
    }
    const normalizedX = (point.x - zone.center.x) / zone.radiusX;
    const normalizedY = (point.y - zone.center.y) / zone.radiusY;
    return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
  }

  if (!zone.center || zone.radius === undefined) return false;
  return distance(point, zone.center) <= zone.radius;
};

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

export const getZoneCoverageAreas = (
  defenders: ZoneAssignablePlayer[],
  lineOfScrimmageYard: number
): ZoneCoverageArea[] =>
  defenders
    .map((defender) => getZoneCoverageForDefender(defender, lineOfScrimmageYard))
    .filter((zone): zone is ZoneCoverageArea => Boolean(zone));

export const getOffenseCoveredByZones = (
  offense: { id: string; position: Point }[],
  zones: ZoneCoverageArea[]
): Set<string> => {
  const covered = new Set<string>();

  for (const zone of zones) {
    const candidates: string[] = [];

    for (const player of offense) {
      if (covered.has(player.id)) continue;
      if (isPointInsideZone(player.position, zone)) {
        candidates.push(player.id);
      }
    }

    if (!candidates.length) continue;
    const sortedCandidates = [...candidates].sort();
    const chosenIndex = seededIndex(
      `${zone.defenderId}:${sortedCandidates.join('|')}`,
      sortedCandidates.length
    );
    covered.add(sortedCandidates[chosenIndex]);
  }

  return covered;
};
