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
const offensiveLineRoles = new Set(['LT', 'LG', 'C', 'RG', 'RT']);
const PASS_PROTECTION_ANCHOR = 0.62;
const MAX_OL_PASS_SET_DEPTH_YARDS = 2;
const MIN_OL_QB_BUFFER_YARDS = 1.4;
const MAN_VICINITY_RADIUS = 1.35;
const MAN_RANDOM_BLEND = 0.45;
const MIN_PLAYER_SEPARATION_YARDS = 1.05;
const OVERLAP_RESOLUTION_PASSES = 3;
const BLOCK_ENGAGEMENT_RADIUS_YARDS = 2.6;
const BLOCK_STANDOFF_YARDS = 1.35;
const PASS_BLOCK_FREEZE_EPSILON = 0.0001;
const QB_DROPBACK_YARDS = 3;
const QB_DROPBACK_COMPLETE_PROGRESS = 0.25;

export type RunBlockEngagement = {
  progress: number;
  blockerId: string;
  blockerOffset: Point;
};

export type RunBlockEngagementMap = Record<string, RunBlockEngagement>;

const passBlockFreezeState: {
  lastProgress: number;
  frozenByDefender: Record<string, Point>;
} = {
  lastProgress: -1,
  frozenByDefender: {}
};

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
  runBlockEngagements?: RunBlockEngagementMap,
  runBallCarrierOverrideId?: string,
  blitzPursuitTarget?: Point
): Record<string, Point> => {
  if (progress + PASS_BLOCK_FREEZE_EPSILON < passBlockFreezeState.lastProgress) {
    passBlockFreezeState.frozenByDefender = {};
  }
  passBlockFreezeState.lastProgress = progress;

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

      if (!candidates.length) continue;
      const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
      const choiceIndex = idSeed(
        `${player.id}:${sorted.map((candidate) => candidate.id).join('|')}`
      ) % sorted.length;
      const chosen = sorted[choiceIndex];
      const defenderStart = startPositions[player.id] ?? player.position;
      const maxTrackDistance = PLAYER_DISTANCE_PER_PLAY * progress;

      map[player.id] = clampFieldPoint(
        moveToward(defenderStart, chosen.point, maxTrackDistance)
      );
    }
  }

  const assignedRunCarrier = players.find(
    (player) => player.team === 'offense' && player.assignment === 'run'
  );
  const runCarrier =
    assignedRunCarrier &&
    runBallCarrierOverrideId
      ? players.find((player) => player.id === runBallCarrierOverrideId) ??
        assignedRunCarrier
      : assignedRunCarrier;

  let qbPosition = map['qb'];
  if (!runCarrier && qbPosition) {
    const qbStart = startPositions['qb'] ?? qbPosition;
    const dropbackProgress = Math.min(1, progress / QB_DROPBACK_COMPLETE_PROGRESS);
    map['qb'] = clampFieldPoint({
      x: qbStart.x,
      y: qbStart.y + QB_DROPBACK_YARDS * dropbackProgress
    });
    qbPosition = map['qb'];
  }

  const getNearestPursuerPoint = (
    origin: Point,
    defenders: Player[],
    excludedDefenderIds: Set<string>
  ): { id: string; point: Point } | undefined => {
    let nearest:
      | {
          id: string;
          distance: number;
          point: Point;
        }
      | undefined;
    for (const defender of defenders) {
      if (excludedDefenderIds.has(defender.id)) continue;
      const defenderPoint = map[defender.id] ?? defender.position;
      const d = distanceBetween(origin, defenderPoint);
      if (!nearest || d < nearest.distance) {
        nearest = { id: defender.id, distance: d, point: defenderPoint };
      }
    }
    if (!nearest) return undefined;
    return {
      id: nearest.id,
      point: nearest.point
    };
  };

  if (!runCarrier && blitzPursuitTarget) {
    const pursuitTarget = qbPosition ?? blitzPursuitTarget;
    for (const defender of players) {
      if (
        defender.team !== 'defense' ||
        (defender.role !== 'DL' && defender.assignment !== 'blitz')
      ) {
        continue;
      }
      const frozenPoint = passBlockFreezeState.frozenByDefender[defender.id];
      if (frozenPoint) {
        map[defender.id] = frozenPoint;
        continue;
      }
      const defenderStart = startPositions[defender.id] ?? defender.position;
      const maxPursuitDistance = PLAYER_DISTANCE_PER_PLAY * progress;
      map[defender.id] = clampFieldPoint(
        moveToward(defenderStart, pursuitTarget, maxPursuitDistance)
      );
    }

    // Pass protection: OL blockers work to stay between nearest rusher and QB.
    if (qbPosition) {
      const rushingDefenders = players.filter(
        (player) =>
          player.team === 'defense' &&
          (player.role === 'DL' || player.assignment === 'blitz')
      );
      const claimedRushers = new Set<string>();
      for (const blocker of players) {
        if (
          blocker.team !== 'offense' ||
          blocker.assignment !== 'block' ||
          !offensiveLineRoles.has(blocker.role)
        ) {
          continue;
        }

        const blockerStart = startPositions[blocker.id] ?? blocker.position;
        const nearestRusher = getNearestPursuerPoint(
          blockerStart,
          rushingDefenders,
          claimedRushers
        );
        if (!nearestRusher) continue;
        claimedRushers.add(nearestRusher.id);
        const protectionPoint = lerp(
          qbPosition,
          nearestRusher.point,
          PASS_PROTECTION_ANCHOR
        );
        const maxSetY =
          lineOfScrimmageYard !== undefined
            ? lineOfScrimmageYard + MAX_OL_PASS_SET_DEPTH_YARDS
            : protectionPoint.y;
        const clampedProtectionPoint = {
          x: protectionPoint.x,
          y: Math.min(
            maxSetY,
            Math.min(protectionPoint.y, qbPosition.y - MIN_OL_QB_BUFFER_YARDS)
          )
        };
        const maxDistance = PLAYER_DISTANCE_PER_PLAY * progress;
        map[blocker.id] = clampFieldPoint(
          moveToward(blockerStart, clampedProtectionPoint, maxDistance)
        );
      }

      // Once engaged by a blocker, a rusher should stop pursuing and stay tied to that block.
      const engagedRushers = new Set<string>();
      const engagedBlockers = new Set<string>();
      for (const blocker of players) {
        if (blocker.team !== 'offense' || blocker.assignment !== 'block') continue;
        if (engagedBlockers.has(blocker.id)) continue;
        const blockerPoint = map[blocker.id] ?? blocker.position;

        let nearestRusher:
          | {
              id: string;
              distance: number;
              point: Point;
            }
          | undefined;

        for (const defender of rushingDefenders) {
          if (engagedRushers.has(defender.id)) continue;
          const defenderPoint = map[defender.id] ?? defender.position;
          const distance = distanceBetween(blockerPoint, defenderPoint);
          if (!nearestRusher || distance < nearestRusher.distance) {
            nearestRusher = { id: defender.id, distance, point: defenderPoint };
          }
        }

        if (!nearestRusher || nearestRusher.distance > BLOCK_ENGAGEMENT_RADIUS_YARDS) continue;

        engagedBlockers.add(blocker.id);
        engagedRushers.add(nearestRusher.id);
        if (!passBlockFreezeState.frozenByDefender[nearestRusher.id]) {
          passBlockFreezeState.frozenByDefender[nearestRusher.id] = {
            x: nearestRusher.point.x,
            y: nearestRusher.point.y
          };
        }
        const dx = nearestRusher.point.x - blockerPoint.x;
        const dy = nearestRusher.point.y - blockerPoint.y;
        const distance = Math.hypot(dx, dy);
        const blockerOffset =
          distance > 0.0001
            ? {
                x: (dx / distance) * BLOCK_STANDOFF_YARDS,
                y: (dy / distance) * BLOCK_STANDOFF_YARDS
              }
            : { x: 0, y: -BLOCK_STANDOFF_YARDS };

        map[nearestRusher.id] =
          passBlockFreezeState.frozenByDefender[nearestRusher.id] ??
          clampFieldPoint({
            x: blockerPoint.x + blockerOffset.x,
            y: blockerPoint.y + blockerOffset.y
          });
      }
    }
  }

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
  }

  if (runBlockEngagements) {
    for (const [defenderId, engagement] of Object.entries(runBlockEngagements)) {
      if (progress < engagement.progress) continue;
      const blockerPoint = map[engagement.blockerId];
      if (!blockerPoint) continue;
      map[defenderId] = clampFieldPoint({
        x: blockerPoint.x + engagement.blockerOffset.x,
        y: blockerPoint.y + engagement.blockerOffset.y
      });
    }
  }

  // Keep player pieces from visually occupying the same point during simulation.
  const frozenDefenderIds = new Set(Object.keys(passBlockFreezeState.frozenByDefender));
  for (let pass = 0; pass < OVERLAP_RESOLUTION_PASSES; pass += 1) {
    for (let i = 0; i < players.length; i += 1) {
      const first = players[i];
      for (let j = i + 1; j < players.length; j += 1) {
        const second = players[j];
        const firstPoint = map[first.id];
        if (!firstPoint) continue;
        const secondPoint = map[second.id];
        if (!secondPoint) continue;

        const dx = secondPoint.x - firstPoint.x;
        const dy = secondPoint.y - firstPoint.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= MIN_PLAYER_SEPARATION_YARDS) continue;

        const overlap = (MIN_PLAYER_SEPARATION_YARDS - Math.max(distance, 0.0001)) / 2;
        const normalX = distance > 0.0001 ? dx / distance : 1;
        const normalY = distance > 0.0001 ? dy / distance : 0;

        const firstFrozen = frozenDefenderIds.has(first.id);
        const secondFrozen = frozenDefenderIds.has(second.id);
        if (firstFrozen && secondFrozen) continue;
        if (firstFrozen) {
          map[second.id] = clampFieldPoint({
            x: secondPoint.x + normalX * overlap * 2,
            y: secondPoint.y + normalY * overlap * 2
          });
          continue;
        }
        if (secondFrozen) {
          map[first.id] = clampFieldPoint({
            x: firstPoint.x - normalX * overlap * 2,
            y: firstPoint.y - normalY * overlap * 2
          });
          continue;
        }

        map[first.id] = clampFieldPoint({
          x: firstPoint.x - normalX * overlap,
          y: firstPoint.y - normalY * overlap
        });
        map[second.id] = clampFieldPoint({
          x: secondPoint.x + normalX * overlap,
          y: secondPoint.y + normalY * overlap
        });
      }
    }
  }

  return map;
};
