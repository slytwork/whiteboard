import { clampFieldPoint, Point } from './coordinateSystem';

export type AssignmentType =
  | 'run'
  | 'pass-route'
  | 'block'
  | 'man'
  | 'zone'
  | 'blitz'
  | 'contain'
  | 'none';

export type Team = 'offense' | 'defense';

export type Player = {
  id: string;
  label: string;
  team: Team;
  role: string;
  position: Point;
  assignment: AssignmentType;
  path: Point[];
  manTargetId?: string;
};

const lerp = (from: Point, to: Point, t: number): Point => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t
});

const pointAlongPath = (start: Point, path: Point[], progress: number): Point => {
  const nodes = [start, ...path];
  if (nodes.length === 1) return start;

  const scaled = progress * (nodes.length - 1);
  const segment = Math.min(Math.floor(scaled), nodes.length - 2);
  const localT = scaled - segment;
  return lerp(nodes[segment], nodes[segment + 1], localT);
};

const idSeed = (id: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

const getManCoveragePosition = (defenderId: string, targetPoint: Point, progress: number): Point => {
  const seed = idSeed(defenderId);
  const baseLeverage = ((seed % 3) - 1) * 0.35;
  const trailDepth = 0.55 + ((seed % 23) / 100);
  const xJitter = Math.sin(progress * 9 + seed * 0.0007) * 0.25;
  const yJitter = Math.cos(progress * 7 + seed * 0.0009) * 0.2;

  return clampFieldPoint({
    x: targetPoint.x + baseLeverage + xJitter,
    y: targetPoint.y + trailDepth + yJitter
  });
};

export const computeFramePositions = (
  players: Player[],
  startPositions: Record<string, Point>,
  progress: number
): Record<string, Point> => {
  const map = Object.fromEntries(players.map((p) => [p.id, startPositions[p.id] ?? p.position]));

  for (const player of players) {
    if (player.team === 'defense' && player.assignment === 'man' && player.manTargetId) {
      const target = players.find((p) => p.id === player.manTargetId);
      if (target) {
        const targetStart = startPositions[target.id] ?? target.position;
        const trackedPoint = pointAlongPath(targetStart, target.path, progress);
        map[player.id] = getManCoveragePosition(player.id, trackedPoint, progress);
        continue;
      }
    }

    const start = startPositions[player.id] ?? player.position;
    map[player.id] = pointAlongPath(start, player.path, progress);
  }

  return map;
};
