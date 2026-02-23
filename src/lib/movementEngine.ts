import { Point } from './coordinateSystem';

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
        const mirrored = pointAlongPath(targetStart, target.path, progress);
        map[player.id] = { x: mirrored.x + 0.8, y: mirrored.y + 0.8 };
        continue;
      }
    }

    const start = startPositions[player.id] ?? player.position;
    map[player.id] = pointAlongPath(start, player.path, progress);
  }

  return map;
};
