import { clampFieldPoint, Point } from './coordinateSystem';
import { getZoneCoverageForDefender, isPointInsideZone } from './separationEngine';

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

const distanceBetween = (from: Point, to: Point) =>
  Math.hypot(to.x - from.x, to.y - from.y);

const moveToward = (from: Point, to: Point, maxDistance: number): Point => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (!distance || maxDistance <= 0) return from;
  if (distance <= maxDistance) return to;
  const ratio = maxDistance / distance;
  return {
    x: from.x + dx * ratio,
    y: from.y + dy * ratio
  };
};

const pointAlongPathByDistance = (start: Point, path: Point[], maxDistance: number): Point => {
  const nodes = [start, ...path];
  if (nodes.length === 1 || maxDistance <= 0) return start;

  let remaining = maxDistance;
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const from = nodes[i];
    const to = nodes[i + 1];
    const segmentLength = distanceBetween(from, to);
    if (segmentLength <= 0) continue;
    if (remaining <= segmentLength) {
      return lerp(from, to, remaining / segmentLength);
    }
    remaining -= segmentLength;
  }

  return nodes[nodes.length - 1];
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

const PLAYER_DISTANCE_PER_PLAY = 10;
const MAN_VICINITY_RADIUS = 1.35;
const MAN_RANDOM_BLEND = 0.45;

export type RunBlockEngagement = {
  progress: number;
  freezePoint: Point;
};

export type RunBlockEngagementMap = Record<string, RunBlockEngagement>;

const getManTrackingState = (
  defender: Player,
  players: Player[],
  startPositions: Record<string, Point>,
  progress: number
): { position: Point; targetId?: string; isRandomized: boolean } => {
  if (defender.assignment !== 'man' || !defender.manTargetId) {
    return { position: startPositions[defender.id] ?? defender.position, isRandomized: false };
  }
  const target = players.find((player) => player.id === defender.manTargetId);
  if (!target) {
    return { position: startPositions[defender.id] ?? defender.position, isRandomized: false };
  }

  const targetStart = startPositions[target.id] ?? target.position;
  const trackedPoint = pointAlongPathByDistance(
    targetStart,
    target.path,
    PLAYER_DISTANCE_PER_PLAY * progress
  );
  const defenderStart = startPositions[defender.id] ?? defender.position;
  const maxDistance = PLAYER_DISTANCE_PER_PLAY * progress;
  const chasePoint = moveToward(defenderStart, trackedPoint, maxDistance);
  const canRandomize = distanceBetween(chasePoint, trackedPoint) <= MAN_VICINITY_RADIUS;

  if (!canRandomize) {
    return {
      position: clampFieldPoint(chasePoint),
      targetId: target.id,
      isRandomized: false
    };
  }

  const randomPoint = getManCoveragePosition(defender.id, trackedPoint, progress);
  const blended = lerp(chasePoint, randomPoint, MAN_RANDOM_BLEND);
  return {
    position: clampFieldPoint(blended),
    targetId: target.id,
    isRandomized: true
  };
};

export const getManRandomizedTargetIds = (
  players: Player[],
  startPositions: Record<string, Point>,
  progress: number
): Set<string> => {
  const randomizedTargetIds = new Set<string>();

  for (const defender of players) {
    if (defender.team !== 'defense' || defender.assignment !== 'man') continue;
    const state = getManTrackingState(defender, players, startPositions, progress);
    if (state.isRandomized && state.targetId) {
      randomizedTargetIds.add(state.targetId);
    }
  }

  return randomizedTargetIds;
};

export const computeFramePositions = (
  players: Player[],
  startPositions: Record<string, Point>,
  progress: number,
  lineOfScrimmageYard?: number,
  runBlockEngagements?: RunBlockEngagementMap
): Record<string, Point> => {
  const map = Object.fromEntries(players.map((p) => [p.id, startPositions[p.id] ?? p.position]));
  const offenseEligibleRoles = new Set(['WR', 'TE', 'RB']);

  for (const player of players) {
    if (player.team === 'defense' && player.assignment === 'man' && player.manTargetId) {
      const state = getManTrackingState(player, players, startPositions, progress);
      map[player.id] = state.position;
      continue;
    }

    const start = startPositions[player.id] ?? player.position;
    const maxDistance = PLAYER_DISTANCE_PER_PLAY * progress;
    map[player.id] = pointAlongPathByDistance(start, player.path, maxDistance);
  }

  if (lineOfScrimmageYard !== undefined) {
    for (const player of players) {
      if (player.team !== 'defense' || player.assignment !== 'zone') continue;
      const anchor = map[player.id] ?? player.position;
      const zone = getZoneCoverageForDefender(
        { ...player, position: anchor, path: [] },
        lineOfScrimmageYard
      );
      if (!zone) continue;

      const candidates = players
        .filter(
          (offensePlayer) =>
            offensePlayer.team === 'offense' &&
            offenseEligibleRoles.has(offensePlayer.role)
        )
        .map((offensePlayer) => ({
          id: offensePlayer.id,
          point: map[offensePlayer.id] ?? offensePlayer.position
        }))
        .filter((candidate) => isPointInsideZone(candidate.point, zone));

      if (candidates.length < 2) continue;
      const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
      const choiceIndex = idSeed(
        `${player.id}:${sorted.map((candidate) => candidate.id).join('|')}`
      ) % sorted.length;
      const chosen = sorted[choiceIndex];
      const pursuitStrength = 0.1 + Math.min(0.2, progress * 0.2);

      map[player.id] = clampFieldPoint({
        x: anchor.x + (chosen.point.x - anchor.x) * pursuitStrength,
        y: anchor.y + (chosen.point.y - anchor.y) * pursuitStrength
      });
    }
  }

  const runCarrier = players.find(
    (player) => player.team === 'offense' && player.assignment === 'run'
  );
  if (runCarrier) {
    const runnerPoint = map[runCarrier.id] ?? runCarrier.position;
    for (const defender of players) {
      if (defender.team !== 'defense') continue;
      const defenderStart = startPositions[defender.id] ?? defender.position;
      const maxPursuitDistance = PLAYER_DISTANCE_PER_PLAY * progress;
      map[defender.id] = clampFieldPoint(
        moveToward(defenderStart, runnerPoint, maxPursuitDistance)
      );
    }
    if (runBlockEngagements) {
      for (const [defenderId, engagement] of Object.entries(runBlockEngagements)) {
        if (progress >= engagement.progress) {
          map[defenderId] = engagement.freezePoint;
        }
      }
    }
  }

  return map;
};
