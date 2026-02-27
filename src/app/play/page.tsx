"use client";

import { useMemo, useRef, useState } from "react";
import { AssignmentPanel } from "@/components/AssignmentPanel";
import { Field } from "@/components/Field";
import { PlayerPiece } from "@/components/PlayerPiece";
import { RevealOverlay } from "@/components/RevealOverlay";
import { Scoreboard } from "@/components/Scoreboard";
import {
  clampFieldPoint,
  PLAYABLE_START_YARD,
  PLAYABLE_END_YARD,
  Point,
} from "@/lib/coordinateSystem";
import {
  AssignmentType,
  computeFramePositions,
  getManRandomizedTargetIds,
  Player,
  RunBlockEngagementMap,
} from "@/lib/movementEngine";
import {
  applyPlayTemplate,
  getPlayTemplatesForTeam,
} from "@/lib/playTemplates";
import {
  evaluateSeparation,
  getNearestDefenderDistance,
  getOffenseCoveredByZones,
  getBlockedDefenderIds,
  getZoneCoverageAreas,
  isPointInsideZone,
} from "@/lib/separationEngine";
import {
  DEFAULT_SITUATION,
  getDownAndDistanceLabel,
  randomSituation,
  Situation,
} from "@/lib/situationEngine";
import { LuPanelLeftOpen, LuPanelRightOpen } from "react-icons/lu";

const ELIGIBLE_ROLES = new Set(["WR", "TE", "RB"]);

type Phase =
  | "offense-design"
  | "pass-device"
  | "defense-design"
  | "animating"
  | "evaluation"
  | "discussion"
  | "match-over";

const clonePlayers = (players: Player[]): Player[] =>
  players.map((p) => ({
    ...p,
    position: { ...p.position },
    path: [...p.path],
  }));

const distanceBetweenPoints = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const RUN_TACKLE_RADIUS_YARDS = 1.6;
const BLOCK_ENGAGEMENT_RADIUS_YARDS = 2.8;
const BLOCK_STANDOFF_YARDS = 1.35;
const QB_THROW_CATCH_RADIUS_YARDS = 2;
const QB_NEARBY_DEFENDER_RADIUS_YARDS = 4;
const PASS_MIN_READ_TIME_MS = 1000;
const RUN_TACKLE_SAMPLE_STEPS = 240;
const YAC_CARRIER_EXTRA_YARDS = 8;
const YAC_DEFENDER_PURSUIT_YARDS = 8;
const MIN_PLAYER_SEPARATION_YARDS = 1.05;

type RunTackleResult = {
  ballCarrierId: string;
  stopProgress: number;
  stopPoint: Point;
  frozenPositions: Record<string, Point>;
};

type BallState = {
  position: Point;
  carrierId?: string;
};

type RevealBallPlan = {
  isRunPlay: boolean;
  runCarrierId?: string;
  completionTargetId?: string;
  passThrowStartProgress?: number;
  passThrowStartPoint?: Point;
};

type RevealSnapshot = {
  startPlayers: Player[];
  startPositions: Record<string, Point>;
  runBlockEngagements: RunBlockEngagementMap;
  ballPlan: RevealBallPlan;
  runTackleResult?: RunTackleResult;
};

const QB_ID = "qb";
const HANDOFF_START_PROGRESS = 0.18;
const HANDOFF_END_PROGRESS = 0.34;
const PASS_TRAVEL_DURATION_PROGRESS = 0.1;
const RUN_REVEAL_DURATION_MS = 3000;
const PASS_SCAN_DURATION_MS = 4000;

const lerpPoint = (from: Point, to: Point, t: number): Point => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

const movePointToward = (from: Point, to: Point, maxDistance: number): Point => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (!distance || maxDistance <= 0) return from;
  if (distance <= maxDistance) return to;
  const ratio = maxDistance / distance;
  return {
    x: from.x + dx * ratio,
    y: from.y + dy * ratio,
  };
};

const getNearestUnblockedDefenderWithinTackleRadius = (
  defenders: { id: string; position: Point }[],
  carrierPoint: Point,
  blockedDefenderIds: Set<string>,
): { id: string; position: Point } | undefined => {
  let nearest: { id: string; position: Point; distance: number } | undefined;
  for (const defender of defenders) {
    if (blockedDefenderIds.has(defender.id)) continue;
    const distance = distanceBetweenPoints(defender.position, carrierPoint);
    if (!nearest || distance < nearest.distance) {
      nearest = { ...defender, distance };
    }
  }
  if (!nearest || nearest.distance > RUN_TACKLE_RADIUS_YARDS) return undefined;
  return { id: nearest.id, position: nearest.position };
};

const resolveNoOverlapPositions = (
  players: Player[],
  positions: Record<string, Point>,
  lockedPlayerIds: Set<string> = new Set(),
): Record<string, Point> => {
  const resolved: Record<string, Point> = Object.fromEntries(
    players.map((player) => [
      player.id,
      {
        ...(positions[player.id] ?? player.position),
      },
    ]),
  );

  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < players.length; i += 1) {
      for (let j = i + 1; j < players.length; j += 1) {
        const firstId = players[i].id;
        const secondId = players[j].id;
        const firstPoint = resolved[firstId];
        const secondPoint = resolved[secondId];
        const dx = secondPoint.x - firstPoint.x;
        const dy = secondPoint.y - firstPoint.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= MIN_PLAYER_SEPARATION_YARDS) continue;

        const overlap =
          (MIN_PLAYER_SEPARATION_YARDS - Math.max(distance, 0.0001)) / 2;
        const normalX = distance > 0.0001 ? dx / distance : 1;
        const normalY = distance > 0.0001 ? dy / distance : 0;
        const firstLocked = lockedPlayerIds.has(firstId);
        const secondLocked = lockedPlayerIds.has(secondId);

        if (!firstLocked) {
          const scale = secondLocked ? 2 : 1;
          resolved[firstId] = clampFieldPoint({
            x: firstPoint.x - normalX * overlap * scale,
            y: firstPoint.y - normalY * overlap * scale,
          });
        }
        if (!secondLocked) {
          const scale = firstLocked ? 2 : 1;
          resolved[secondId] = clampFieldPoint({
            x: secondPoint.x + normalX * overlap * scale,
            y: secondPoint.y + normalY * overlap * scale,
          });
        }
      }
    }
  }

  return resolved;
};

const buildTackleFrozenPositions = (
  players: Player[],
  framePositions: Record<string, Point>,
  carrierId: string,
  tacklerId: string,
): Record<string, Point> => {
  const carrierPoint = framePositions[carrierId];
  const tacklerPoint = framePositions[tacklerId];
  if (!carrierPoint || !tacklerPoint) {
    return resolveNoOverlapPositions(players, framePositions);
  }

  const dx = tacklerPoint.x - carrierPoint.x;
  const dy = tacklerPoint.y - carrierPoint.y;
  const distance = Math.hypot(dx, dy);
  const normalX = distance > 0.0001 ? dx / distance : 1;
  const normalY = distance > 0.0001 ? dy / distance : 0;

  const separated = {
    ...framePositions,
    [tacklerId]: clampFieldPoint({
      x: carrierPoint.x + normalX * RUN_TACKLE_RADIUS_YARDS,
      y: carrierPoint.y + normalY * RUN_TACKLE_RADIUS_YARDS,
    }),
  };

  return resolveNoOverlapPositions(
    players,
    separated,
    new Set([carrierId, tacklerId]),
  );
};

const getRunCarrierIdAtProgress = (
  plan: RevealBallPlan,
  progress: number,
): string | undefined => {
  if (!plan.isRunPlay || !plan.runCarrierId) return undefined;
  return progress < HANDOFF_END_PROGRESS ? QB_ID : plan.runCarrierId;
};

const getBallStateAtProgress = (
  framePositions: Record<string, Point>,
  plan: RevealBallPlan,
  progress: number,
): BallState | undefined => {
  const qbPosition = framePositions[QB_ID];
  if (!qbPosition) return undefined;

  if (plan.isRunPlay && plan.runCarrierId) {
    const runnerPosition = framePositions[plan.runCarrierId] ?? qbPosition;
    if (progress < HANDOFF_START_PROGRESS) {
      return { position: qbPosition, carrierId: QB_ID };
    }
    if (progress < HANDOFF_END_PROGRESS) {
      const handoffT =
        (progress - HANDOFF_START_PROGRESS) /
        (HANDOFF_END_PROGRESS - HANDOFF_START_PROGRESS);
      return { position: lerpPoint(qbPosition, runnerPosition, handoffT) };
    }
    return { position: runnerPosition, carrierId: plan.runCarrierId };
  }

  if (plan.completionTargetId) {
    const targetPosition = framePositions[plan.completionTargetId] ?? qbPosition;
    const throwStartProgress = plan.passThrowStartProgress ?? 0;
    const throwTravelDuration = Math.max(
      0.01,
      Math.min(PASS_TRAVEL_DURATION_PROGRESS, 1 - throwStartProgress),
    );
    if (progress < throwStartProgress) {
      return { position: qbPosition, carrierId: QB_ID };
    }
    if (progress < throwStartProgress + throwTravelDuration) {
      const passT =
        (progress - throwStartProgress) / throwTravelDuration;
      return {
        position: lerpPoint(
          plan.passThrowStartPoint ?? qbPosition,
          targetPosition,
          passT,
        ),
      };
    }
    return { position: targetPosition, carrierId: plan.completionTargetId };
  }

  return { position: qbPosition, carrierId: QB_ID };
};

const buildRevealBallPlan = (players: Player[]): RevealBallPlan => {
  const runCarrier = players.find(
    (player) => player.team === "offense" && player.assignment === "run",
  );
  if (runCarrier) {
    return {
      isRunPlay: true,
      runCarrierId: runCarrier.id,
    };
  }

  return {
    isRunPlay: false,
  };
};

const getBestOpenPassTargetAtFrame = (
  players: Player[],
  framePositions: Record<string, Point>,
  lineOfScrimmageYard: number,
): { id: string; gainedYards: number } | undefined => {
  const offenseEligible = players
    .filter((player) => player.team === "offense" && ELIGIBLE_ROLES.has(player.role))
    .map((player) => ({
      id: player.id,
      position: framePositions[player.id] ?? player.position,
    }));
  const defenders = players.map((player) => ({
    ...player,
    position: framePositions[player.id] ?? player.position,
  }));
  const zoneDefenders = defenders.filter(
    (player) => player.team === "defense" && player.assignment === "zone",
  );
  const zoneAreas = getZoneCoverageAreas(zoneDefenders, lineOfScrimmageYard);
  const allDefenderPoints = defenders
    .filter((player) => player.team === "defense")
    .map((player) => player.position);
  const candidates = offenseEligible
    .filter(
      (receiver) =>
        !zoneAreas.some((zone) => isPointInsideZone(receiver.position, zone)) &&
        getNearestDefenderDistance(receiver.position, allDefenderPoints) >
          QB_THROW_CATCH_RADIUS_YARDS,
    )
    .map((receiver) => ({
      id: receiver.id,
      depthYards: lineOfScrimmageYard - receiver.position.y,
      gainedYards: Math.max(0, lineOfScrimmageYard - receiver.position.y),
      nearbyDefenders: allDefenderPoints.filter(
        (defenderPoint) =>
          distanceBetweenPoints(defenderPoint, receiver.position) <=
          QB_NEARBY_DEFENDER_RADIUS_YARDS,
      ).length,
    }))
    .sort((a, b) => {
      if (a.nearbyDefenders !== b.nearbyDefenders) {
        return a.nearbyDefenders - b.nearbyDefenders;
      }
      return b.depthYards - a.depthYards;
    });

  return candidates[0]
    ? { id: candidates[0].id, gainedYards: candidates[0].gainedYards }
    : undefined;
};

const getQuarterbackTacklerAtFrame = (
  players: Player[],
  framePositions: Record<string, Point>,
  progress: number,
  runBlockEngagements: RunBlockEngagementMap,
): string | undefined => {
  const qbPoint = framePositions[QB_ID];
  if (!qbPoint) return undefined;

  const blockedDefenderIds = new Set(
    Object.entries(runBlockEngagements)
      .filter(([, engagement]) => engagement.progress <= progress)
      .map(([defenderId]) => defenderId),
  );
  const defenders = players
    .filter((player) => player.team === "defense")
    .map((player) => ({
      id: player.id,
      position: framePositions[player.id] ?? player.position,
    }));
  const tackler = getNearestUnblockedDefenderWithinTackleRadius(
    defenders,
    qbPoint,
    blockedDefenderIds,
  );

  return tackler?.id;
};

const getPassCompletionProgress = (plan: RevealBallPlan): number | undefined => {
  if (!plan.completionTargetId || plan.passThrowStartProgress === undefined) return undefined;
  const throwTravelDuration = Math.max(
    0.01,
    Math.min(PASS_TRAVEL_DURATION_PROGRESS, 1 - plan.passThrowStartProgress),
  );
  return plan.passThrowStartProgress + throwTravelDuration;
};

const applyAfterCatchEffort = (
  players: Player[],
  framePositions: Record<string, Point>,
  lineOfScrimmageYard: number,
  requiredYards: number,
  plan: RevealBallPlan,
  progress: number,
): {
  positions: Record<string, Point>;
  ballState: BallState;
  tacklerId?: string;
} | undefined => {
  if (!plan.completionTargetId) return undefined;
  const completionProgress = getPassCompletionProgress(plan);
  if (completionProgress === undefined || progress < completionProgress) return undefined;

  const effortProgress = Math.min(
    1,
    (progress - completionProgress) / Math.max(0.01, 1 - completionProgress),
  );
  const receiverId = plan.completionTargetId;
  const receiverBase = framePositions[receiverId];
  if (!receiverBase) return undefined;

  const lineToGainYard = Math.max(PLAYABLE_START_YARD, lineOfScrimmageYard - requiredYards);
  const receiverTarget = { x: receiverBase.x, y: lineToGainYard };
  const ballCarrierPoint = clampFieldPoint(
    movePointToward(
      receiverBase,
      receiverTarget,
      YAC_CARRIER_EXTRA_YARDS * effortProgress,
    ),
  );

  const adjustedPositions: Record<string, Point> = {
    ...framePositions,
    [receiverId]: ballCarrierPoint,
  };

  for (const player of players) {
    if (player.team !== "defense") continue;
    const defenderPoint = framePositions[player.id] ?? player.position;
    adjustedPositions[player.id] = clampFieldPoint(
      movePointToward(
        defenderPoint,
        ballCarrierPoint,
        YAC_DEFENDER_PURSUIT_YARDS * effortProgress,
      ),
    );
  }

  const blockers = players
    .filter((player) => player.team === "offense" && player.assignment === "block")
    .map((player) => ({
      position: adjustedPositions[player.id] ?? player.position,
    }));
  const defenders = players
    .filter((player) => player.team === "defense")
    .map((player) => ({
      id: player.id,
      position: adjustedPositions[player.id] ?? player.position,
    }));
  const blockedDefenderIds = getBlockedDefenderIds(blockers, defenders);
  const tackler = getNearestUnblockedDefenderWithinTackleRadius(
    defenders,
    ballCarrierPoint,
    blockedDefenderIds,
  );

  return {
    positions: adjustedPositions,
    ballState: { position: ballCarrierPoint, carrierId: receiverId },
    tacklerId: tackler?.id,
  };
};

const findRunBlockEngagements = (
  players: Player[],
  startPositions: Record<string, Point>,
  lineOfScrimmageYard: number,
  ballPlan: RevealBallPlan,
): RunBlockEngagementMap => {
  const engagements: RunBlockEngagementMap = {};
  const engagedDefenderIds = new Set<string>();
  const engagedBlockerIds = new Set<string>();

  for (let step = 0; step <= RUN_TACKLE_SAMPLE_STEPS; step += 1) {
    const progress = step / RUN_TACKLE_SAMPLE_STEPS;
    const frame = computeFramePositions(
      players,
      startPositions,
      progress,
      lineOfScrimmageYard,
      undefined,
      getRunCarrierIdAtProgress(ballPlan, progress),
    );
    const blockers = players
      .filter(
        (player) => player.team === "offense" && player.assignment === "block",
      )
      .map((blocker) => ({
        id: blocker.id,
        position: frame[blocker.id] ?? blocker.position,
      }));
    const defenders = players
      .filter((player) => player.team === "defense")
      .map((defender) => ({
        id: defender.id,
        position: frame[defender.id] ?? defender.position,
      }));

    for (const blocker of blockers) {
      if (engagedBlockerIds.has(blocker.id)) continue;
      let nearest: { id: string; distance: number } | undefined;
      for (const defender of defenders) {
        if (engagedDefenderIds.has(defender.id)) continue;
        const defenderDistance = distanceBetweenPoints(
          blocker.position,
          defender.position,
        );
        if (!nearest || defenderDistance < nearest.distance) {
          nearest = { id: defender.id, distance: defenderDistance };
        }
      }
      if (!nearest || nearest.distance > BLOCK_ENGAGEMENT_RADIUS_YARDS) continue;
      engagedBlockerIds.add(blocker.id);
      engagedDefenderIds.add(nearest.id);
      const defenderPoint =
        frame[nearest.id] ??
        defenders.find((defender) => defender.id === nearest.id)?.position;
      if (!defenderPoint) continue;
      const dx = defenderPoint.x - blocker.position.x;
      const dy = defenderPoint.y - blocker.position.y;
      const distance = Math.hypot(dx, dy);
      const blockerOffset =
        distance > 0
          ? {
              x: (dx / distance) * BLOCK_STANDOFF_YARDS,
              y: (dy / distance) * BLOCK_STANDOFF_YARDS,
            }
          : { x: 0, y: -BLOCK_STANDOFF_YARDS };
      engagements[nearest.id] = {
        progress,
        blockerId: blocker.id,
        blockerOffset,
      };
    }
  }

  return engagements;
};

const findRunTackle = (
  players: Player[],
  startPositions: Record<string, Point>,
  lineOfScrimmageYard: number,
  runBlockEngagements: RunBlockEngagementMap,
  ballPlan: RevealBallPlan,
): RunTackleResult | undefined => {
  const defenders = players.filter((player) => player.team === "defense");
  if (!defenders.length) return undefined;

  for (let step = 0; step <= RUN_TACKLE_SAMPLE_STEPS; step += 1) {
    const progress = step / RUN_TACKLE_SAMPLE_STEPS;
    const frame = computeFramePositions(
      players,
      startPositions,
      progress,
      lineOfScrimmageYard,
      runBlockEngagements,
      getRunCarrierIdAtProgress(ballPlan, progress),
    );
    const ballState = getBallStateAtProgress(frame, ballPlan, progress);
    if (!ballState?.carrierId) continue;
    const blockedDefenderIds = new Set(
      Object.entries(runBlockEngagements)
        .filter(([, engagement]) => engagement.progress <= progress)
        .map(([defenderId]) => defenderId),
    );

    const defenderFrame = defenders.map((defender) => ({
      id: defender.id,
      position: frame[defender.id] ?? defender.position,
    }));
    const qbPoint = frame[QB_ID];
    const qbTackler =
      qbPoint
        ? getNearestUnblockedDefenderWithinTackleRadius(
            defenderFrame,
            qbPoint,
            blockedDefenderIds,
          )
        : undefined;
    if (qbPoint && qbTackler) {
      return {
        ballCarrierId: QB_ID,
        stopProgress: progress,
        stopPoint: qbPoint,
        frozenPositions: buildTackleFrozenPositions(
          players,
          frame,
          QB_ID,
          qbTackler.id,
        ),
      };
    }

    const ballCarrierTackler = getNearestUnblockedDefenderWithinTackleRadius(
      defenderFrame,
      ballState.position,
      blockedDefenderIds,
    );
    if (ballCarrierTackler) {
      return {
        ballCarrierId: ballState.carrierId,
        stopProgress: progress,
        stopPoint: ballState.position,
        frozenPositions: buildTackleFrozenPositions(
          players,
          frame,
          ballState.carrierId,
          ballCarrierTackler.id,
        ),
      };
    }
  }

  return undefined;
};

const enforceSingleRunCarrier = (players: Player[]): Player[] => {
  const runCarrier = players.find(
    (player) => player.team === "offense" && player.assignment === "run",
  );
  if (!runCarrier) return players;

  return players.map((player) => {
    if (player.team !== "offense" || player.id === runCarrier.id) return player;
    return {
      ...player,
      assignment: "block",
      path: player.assignment === "block" ? player.path : [],
      manTargetId: undefined,
    };
  });
};
const clampToLineOfScrimmageSide = (
  player: Player,
  point: Point,
  lineOfScrimmageYard: number,
): Point =>
  clampFieldPoint({
    x: point.x,
    y:
      player.team === "offense"
        ? Math.max(point.y, lineOfScrimmageYard)
        : Math.min(point.y, lineOfScrimmageYard),
  });

const projectFormationToSituation = (
  players: Player[],
  fromLosYard: number,
  toLosYard: number,
): Player[] =>
  players.map((player) => {
    const translated = clampFieldPoint({
      x: player.position.x,
      y: toLosYard + (player.position.y - fromLosYard),
    });
    return {
      ...player,
      position: clampToLineOfScrimmageSide(player, translated, toLosYard),
      assignment: "none",
      path: [],
      manTargetId: undefined,
    };
  });

const translatePointToLine = (
  point: Point,
  fromLosYard: number,
  toLosYard: number,
): Point =>
  clampFieldPoint({
    x: point.x,
    y: toLosYard + (point.y - fromLosYard),
  });

const getPreSnapPenalty = (
  players: Player[],
  lineOfScrimmageYard: number,
):
  | { label: "False start" | "Offsides"; team: "offense" | "defense" }
  | undefined => {
  const offensePastLine = players.some(
    (player) =>
      player.team === "offense" && player.position.y < lineOfScrimmageYard,
  );
  if (offensePastLine) {
    return { label: "False start", team: "offense" };
  }

  const defensePastLine = players.some(
    (player) =>
      player.team === "defense" && player.position.y > lineOfScrimmageYard,
  );
  if (defensePastLine) {
    return { label: "Offsides", team: "defense" };
  }

  return undefined;
};

const toDisplayYards = (yards: number) => Math.max(1, Math.round(yards));
const isPathlessAssignment = (assignment: AssignmentType) =>
  assignment === "man" || assignment === "blitz";

const buildNextSituationAfterGain = (
  current: Situation,
  gainedYards: number,
): Situation => {
  const positiveGain = Math.max(0, gainedYards);
  const nextBallSpot = Math.max(PLAYABLE_START_YARD, current.ballSpotYard - positiveGain);
  const yardsToGoal = Math.max(1, Math.ceil(nextBallSpot - PLAYABLE_START_YARD));
  const nextRequired = current.requiredYards - positiveGain;

  if (nextRequired <= 0) {
    const resetDistance = Math.min(10, yardsToGoal);
    return {
      ...current,
      down: 1,
      requiredYards: resetDistance,
      ballSpotYard: nextBallSpot
    };
  }

  return {
    ...current,
    down: Math.min(current.down + 1, 4),
    requiredYards: toDisplayYards(nextRequired),
    ballSpotYard: nextBallSpot
  };
};

const createRoster = (situation: Situation): Player[] => {
  const los = situation.ballSpotYard;

  const qb: Player = {
    id: "qb",
    label: "QB",
    team: "offense",
    role: "QB",
    position: { x: 26, y: los + 4 },
    assignment: "none",
    path: [],
  };
  const rb: Player = {
    id: "rb",
    label: "RB",
    team: "offense",
    role: "RB",
    position: { x: 29, y: los + 6 },
    assignment: "none",
    path: [],
  };
  const lt: Player = {
    id: "lt",
    label: "LT",
    team: "offense",
    role: "LT",
    position: { x: 22, y: los + 1 },
    assignment: "none",
    path: [],
  };
  const lg: Player = {
    id: "lg",
    label: "LG",
    team: "offense",
    role: "LG",
    position: { x: 24, y: los + 1 },
    assignment: "none",
    path: [],
  };
  const c: Player = {
    id: "c",
    label: "C",
    team: "offense",
    role: "C",
    position: { x: 26, y: los + 1 },
    assignment: "none",
    path: [],
  };
  const rg: Player = {
    id: "rg",
    label: "RG",
    team: "offense",
    role: "RG",
    position: { x: 28, y: los + 1 },
    assignment: "none",
    path: [],
  };
  const rt: Player = {
    id: "rt",
    label: "RT",
    team: "offense",
    role: "RT",
    position: { x: 30, y: los + 1 },
    assignment: "none",
    path: [],
  };
  const wr1: Player = {
    id: "wr1",
    label: "X",
    team: "offense",
    role: "WR",
    position: { x: 8, y: los + 2 },
    assignment: "none",
    path: [],
  };
  const wr2: Player = {
    id: "wr2",
    label: "Z",
    team: "offense",
    role: "WR",
    position: { x: 44, y: los + 2 },
    assignment: "none",
    path: [],
  };
  const wr3: Player = {
    id: "wr3",
    label: "H",
    team: "offense",
    role: "WR",
    position: { x: 16, y: los + 2 },
    assignment: "none",
    path: [],
  };
  const te: Player = {
    id: "te",
    label: "Y",
    team: "offense",
    role: "TE",
    position: { x: 36, y: los + 1 },
    assignment: "none",
    path: [],
  };

  const dl1: Player = {
    id: "dl1",
    label: "DE",
    team: "defense",
    role: "DL",
    position: { x: 20, y: los - 1 },
    assignment: "none",
    path: [],
  };
  const dl2: Player = {
    id: "dl2",
    label: "DT1",
    team: "defense",
    role: "DL",
    position: { x: 24, y: los - 1 },
    assignment: "none",
    path: [],
  };
  const dl3: Player = {
    id: "dl3",
    label: "DT2",
    team: "defense",
    role: "DL",
    position: { x: 28, y: los - 1 },
    assignment: "none",
    path: [],
  };
  const dl4: Player = {
    id: "dl4",
    label: "DE2",
    team: "defense",
    role: "DL",
    position: { x: 32, y: los - 1 },
    assignment: "none",
    path: [],
  };
  const lb1: Player = {
    id: "lb1",
    label: "LB1",
    team: "defense",
    role: "LB",
    position: { x: 20, y: los - 4 },
    assignment: "none",
    path: [],
  };
  const lb2: Player = {
    id: "lb2",
    label: "LB2",
    team: "defense",
    role: "LB",
    position: { x: 26, y: los - 4 },
    assignment: "none",
    path: [],
  };
  const lb3: Player = {
    id: "lb3",
    label: "LB3",
    team: "defense",
    role: "LB",
    position: { x: 32, y: los - 4 },
    assignment: "none",
    path: [],
  };
  const db1: Player = {
    id: "db1",
    label: "CB1",
    team: "defense",
    role: "DB",
    position: { x: 8, y: los - 7 },
    assignment: "none",
    path: [],
  };
  const db2: Player = {
    id: "db2",
    label: "S1",
    team: "defense",
    role: "DB",
    position: { x: 20, y: los - 7 },
    assignment: "none",
    path: [],
  };
  const db3: Player = {
    id: "db3",
    label: "S2",
    team: "defense",
    role: "DB",
    position: { x: 32, y: los - 7 },
    assignment: "none",
    path: [],
  };
  const db4: Player = {
    id: "db4",
    label: "CB2",
    team: "defense",
    role: "DB",
    position: { x: 44, y: los - 7 },
    assignment: "none",
    path: [],
  };

  return [
    qb,
    rb,
    lt,
    lg,
    c,
    rg,
    rt,
    wr1,
    wr2,
    wr3,
    te,
    dl1,
    dl2,
    dl3,
    dl4,
    lb1,
    lb2,
    lb3,
    db1,
    db2,
    db3,
    db4,
  ];
};

export default function Home() {
  const offenseTemplates = getPlayTemplatesForTeam("offense");
  const defenseTemplates = getPlayTemplatesForTeam("defense");
  const [situation, setSituation] = useState<Situation>(DEFAULT_SITUATION);
  const [players, setPlayers] = useState<Player[]>(() =>
    createRoster(DEFAULT_SITUATION),
  );
  const [phase, setPhase] = useState<Phase>("offense-design");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>();
  const [activeAssignment, setActiveAssignment] = useState<AssignmentType>();
  const [controlsOpen, setControlsOpen] = useState(true);
  const [offenseWins, setOffenseWins] = useState(0);
  const [defenseWins, setDefenseWins] = useState(0);
  const [resultMessage, setResultMessage] = useState("");
  const [queuedRoundSituation, setQueuedRoundSituation] = useState<Situation>();
  const [pathStartOverrides, setPathStartOverrides] = useState<
    Record<string, Point> | undefined
  >();
  const [ballPosition, setBallPosition] = useState<Point>();
  const [ballCarrierId, setBallCarrierId] = useState<string | undefined>(QB_ID);
  const [lastOffensePlay, setLastOffensePlay] = useState<
    { players: Player[]; losYard: number } | undefined
  >();
  const [lastDefensePlay, setLastDefensePlay] = useState<
    { players: Player[]; losYard: number } | undefined
  >();
  const [selectedOffenseTemplateId, setSelectedOffenseTemplateId] = useState(
    () => offenseTemplates[0]?.id ?? "",
  );
  const [selectedDefenseTemplateId, setSelectedDefenseTemplateId] = useState(
    () => defenseTemplates[0]?.id ?? "",
  );

  const initialPositionsRef = useRef<Record<string, Point>>({});
  const lastRevealRef = useRef<RevealSnapshot>();
  const roundStartFormationRef = useRef<{
    players: Player[];
    losYard: number;
  }>();

  const currentSelected = useMemo(
    () => players.find((p) => p.id === selectedPlayerId),
    [players, selectedPlayerId],
  );
  const isManTargetSelectionMode =
    phase === "defense-design" &&
    currentSelected?.team === "defense" &&
    currentSelected.assignment === "man";
  const currentManTargetId = isManTargetSelectionMode
    ? currentSelected.manTargetId
    : undefined;
  const offenseRunCarrierId = players.find(
    (player) => player.team === "offense" && player.assignment === "run",
  )?.id;

  const canApplyAssignmentToPlayer = (
    assignment: AssignmentType,
    player?: Player,
  ) => {
    if (!player) return false;
    if (
      phase === "offense-design" &&
      player.team === "offense" &&
      assignment === "run" &&
      offenseRunCarrierId &&
      offenseRunCarrierId !== player.id
    ) {
      return false;
    }
    return true;
  };

  const resetRound = (nextSituation?: Situation) => {
    const fresh = nextSituation ?? randomSituation(situation.id);
    setSituation(fresh);
    setPlayers((prev) => {
      const sourcePlayers = roundStartFormationRef.current?.players ?? prev;
      const sourceLosYard =
        roundStartFormationRef.current?.losYard ?? situation.ballSpotYard;
      return sourcePlayers.length
        ? projectFormationToSituation(
            sourcePlayers,
            sourceLosYard,
            fresh.ballSpotYard,
          )
        : createRoster(fresh);
    });
    setSelectedPlayerId(undefined);
    setActiveAssignment(undefined);
    setBallPosition(undefined);
    setBallCarrierId(QB_ID);
    setPhase("offense-design");
  };

  const resetMatch = () => {
    const fresh = DEFAULT_SITUATION;
    setOffenseWins(0);
    setDefenseWins(0);
    setResultMessage("");
    setSituation(fresh);
    setPlayers(createRoster(fresh));
    roundStartFormationRef.current = undefined;
    setLastOffensePlay(undefined);
    setLastDefensePlay(undefined);
    setPathStartOverrides(undefined);
    setSelectedPlayerId(undefined);
    setActiveAssignment(undefined);
    setBallPosition(undefined);
    setBallCarrierId(QB_ID);
    setPhase("offense-design");
  };

  const isInteractive =
    phase === "offense-design" || phase === "defense-design";

  const handleSelectPlayer = (id: string) => {
    const p = players.find((player) => player.id === id);
    if (!p) return;
    if (
      phase === "defense-design" &&
      isManTargetSelectionMode &&
      p.team === "offense" &&
      ELIGIBLE_ROLES.has(p.role)
    ) {
      setManTarget(p.id);
      return;
    }
    if (phase === "offense-design" && p.team !== "offense") return;
    if (phase === "defense-design" && p.team !== "defense") return;
    setSelectedPlayerId(id);

    if (!activeAssignment || !canApplyAssignmentToPlayer(activeAssignment, p)) return;
    setPlayers((prev) =>
      enforceSingleRunCarrier(
        prev.map((player) =>
        player.id === id
          ? {
              ...player,
              assignment: activeAssignment,
              path: isPathlessAssignment(activeAssignment) ? [] : player.path,
              manTargetId:
                activeAssignment === "man"
                  ? prev.find(
                      (candidate) =>
                        candidate.team === "offense" &&
                        ELIGIBLE_ROLES.has(candidate.role),
                    )?.id
                  : undefined,
            }
          : player,
        ),
      ),
    );
  };

  const setAssignment = (assignment: AssignmentType) => {
    if (
      assignment === "run" &&
      !canApplyAssignmentToPlayer(assignment, currentSelected)
    ) {
      return;
    }
    setActiveAssignment(assignment);
    if (!selectedPlayerId) return;
    setPlayers((prev) =>
      enforceSingleRunCarrier(
        prev.map((p) =>
        p.id === selectedPlayerId
          ? {
              ...p,
              assignment,
              path: isPathlessAssignment(assignment) ? [] : p.path,
              manTargetId:
                assignment === "man"
                  ? prev.find(
                      (candidate) =>
                        candidate.team === "offense" &&
                        ELIGIBLE_ROLES.has(candidate.role),
                    )?.id
                  : undefined,
            }
          : p,
        ),
      ),
    );
  };

  const setManTarget = (targetId: string) => {
    if (!currentSelected || currentSelected.assignment !== "man") return;
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === currentSelected.id ? { ...p, manTargetId: targetId } : p,
      ),
    );
  };

  const clearPath = () => {
    if (!selectedPlayerId) return;
    setPlayers((prev) =>
      prev.map((p) => (p.id === selectedPlayerId ? { ...p, path: [] } : p)),
    );
  };

  const movePlayer = (id: string, point: Point) => {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              position: clampToLineOfScrimmageSide(
                p,
                point,
                situation.ballSpotYard,
              ),
            }
          : p,
      ),
    );
  };

  const appendPathPoint = (id: string, point: Point) => {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === id
          ? isPathlessAssignment(p.assignment)
            ? p
            : { ...p, path: [...p.path, point] }
          : p,
      ),
    );
  };

  const evaluateRound = (
    finalPlayers: Player[],
    manRandomizedTargetIds: Set<string> = new Set(),
    finalBallCarrierId?: string,
  ) => {
    setQueuedRoundSituation(undefined);
    const offenseEligible = finalPlayers.filter(
      (p) => p.team === "offense" && ELIGIBLE_ROLES.has(p.role),
    );
    const defenders = finalPlayers.filter((p) => p.team === "defense");
    const blockers = finalPlayers.filter(
      (p) => p.team === "offense" && p.assignment === "block",
    );
    const runCarrier = finalPlayers.find(
      (p) => p.team === "offense" && p.assignment === "run",
    );
    const blockedDefenderIds = getBlockedDefenderIds(blockers, defenders);
    const activeDefenders = defenders.filter(
      (defender) => !blockedDefenderIds.has(defender.id),
    );
    const manDefenders = activeDefenders.filter(
      (defender) => defender.assignment === "man",
    );
    const zoneDefenders = activeDefenders.filter(
      (defender) => defender.assignment === "zone",
    );
    const zoneCoverages = getZoneCoverageAreas(zoneDefenders, situation.ballSpotYard);
    const zoneCoveredOffenseIds = getOffenseCoveredByZones(
      offenseEligible,
      zoneCoverages,
    );
    // Zone outcomes are handled by zone relation. Proximity separation applies to man defenders.
    const separation = evaluateSeparation(offenseEligible, manDefenders);
    const manDefenderByTarget = new Map(
      manDefenders
        .filter((defender) => defender.manTargetId)
        .map((defender) => [defender.manTargetId as string, defender]),
    );
    const manCoveredTargetIds = new Set<string>();
    for (const [targetId, defender] of manDefenderByTarget) {
      const target = offenseEligible.find((player) => player.id === targetId);
      if (!target) continue;
      if (manRandomizedTargetIds.has(targetId)) continue;
      const isTight = distanceBetweenPoints(defender.position, target.position) <= 2;
      if (isTight) {
        manCoveredTargetIds.add(targetId);
      }
    }

    if (runCarrier) {
      const activeBallCarrier =
        finalPlayers.find((player) => player.id === finalBallCarrierId) ??
        runCarrier;
      const gainedYards = Math.max(
        0,
        situation.ballSpotYard - activeBallCarrier.position.y,
      );
      const nextSituation = buildNextSituationAfterGain(situation, gainedYards);
      setQueuedRoundSituation(nextSituation);

      if (gainedYards >= situation.requiredYards) {
        const nextOffenseWins = offenseWins + 1;
        setOffenseWins(nextOffenseWins);
        if (nextOffenseWins >= 3) {
          setResultMessage("Offense wins the match 3 plays to glory.");
          setActiveAssignment(undefined);
          setPhase("match-over");
          return;
        }
        setResultMessage(
          `Run success by ${activeBallCarrier.label} for ${toDisplayYards(
            gainedYards,
          )} yds. Next: ${getDownAndDistanceLabel(nextSituation)}.`,
        );
        setActiveAssignment(undefined);
        setPhase("discussion");
        return;
      }

      if (gainedYards > 0) {
        setResultMessage(
          `Run gain of ${toDisplayYards(gainedYards)} yds by ${activeBallCarrier.label}. Next: ${getDownAndDistanceLabel(
            nextSituation,
          )}.`,
        );
        setActiveAssignment(undefined);
        setPhase("discussion");
        return;
      }

      const nextDefenseWins = defenseWins + 1;
      setDefenseWins(nextDefenseWins);
      if (nextDefenseWins >= 3) {
        setResultMessage("Defense stonewalls the match and wins.");
        setActiveAssignment(undefined);
        setPhase("match-over");
        return;
      }
      setResultMessage(
        `Defense stuffs the run. Next: ${getDownAndDistanceLabel(
          nextSituation,
        )}.`,
      );
      setActiveAssignment(undefined);
      setPhase("discussion");
      return;
    }

    if (finalBallCarrierId === QB_ID) {
      const nextDefenseWins = defenseWins + 1;
      setDefenseWins(nextDefenseWins);
      const nextSituation = buildNextSituationAfterGain(situation, 0);
      setQueuedRoundSituation(nextSituation);
      if (nextDefenseWins >= 3) {
        setResultMessage("Defense stonewalls the match and wins.");
        setActiveAssignment(undefined);
        setPhase("match-over");
        return;
      }
      setResultMessage(
        `Sack. QB kept the ball with no completion. Next: ${getDownAndDistanceLabel(
          nextSituation,
        )}.`,
      );
      setActiveAssignment(undefined);
      setPhase("discussion");
      return;
    }

    const openTargets = separation
      .filter((res) => {
        const player = offenseEligible.find((candidate) => candidate.id === res.offensiveId);
        if (!player) return false;
        if (zoneCoveredOffenseIds.has(player.id)) return false;
        if (manRandomizedTargetIds.has(player.id)) return true;
        if (manCoveredTargetIds.has(player.id)) return false;
        return res.isOpen;
      })
      .map((res) => {
        const player = offenseEligible.find((candidate) => candidate.id === res.offensiveId)!;
        const rawGain = situation.ballSpotYard - player.position.y;
        return {
          player,
          gainedYards: Math.max(0, rawGain)
        };
      });
    openTargets.sort((a, b) => b.gainedYards - a.gainedYards);
    const bestOpenTarget = openTargets[0];

    if (bestOpenTarget && bestOpenTarget.gainedYards >= situation.requiredYards) {
      const nextOffenseWins = offenseWins + 1;
      setOffenseWins(nextOffenseWins);
      const nextSituation = buildNextSituationAfterGain(
        situation,
        bestOpenTarget.gainedYards,
      );
      setQueuedRoundSituation(nextSituation);
      if (nextOffenseWins >= 3) {
        setResultMessage("Offense wins the match 3 plays to glory.");
        setActiveAssignment(undefined);
        setPhase("match-over");
        return;
      }
      setResultMessage(
        `Offense scores! ${bestOpenTarget.player.label} converted for ${toDisplayYards(
          bestOpenTarget.gainedYards,
        )} yds. Next: ${getDownAndDistanceLabel(nextSituation)}.`,
      );
    } else if (bestOpenTarget && bestOpenTarget.gainedYards > 0) {
      const nextSituation = buildNextSituationAfterGain(
        situation,
        bestOpenTarget.gainedYards,
      );
      setQueuedRoundSituation(nextSituation);
      setResultMessage(
        `Gain of ${toDisplayYards(bestOpenTarget.gainedYards)} yds by ${bestOpenTarget.player.label}. Next: ${getDownAndDistanceLabel(
          nextSituation,
        )}.`,
      );
    } else {
      const nextDefenseWins = defenseWins + 1;
      setDefenseWins(nextDefenseWins);
      const nextSituation = buildNextSituationAfterGain(situation, 0);
      setQueuedRoundSituation(nextSituation);
      if (nextDefenseWins >= 3) {
        setResultMessage("Defense stonewalls the match and wins.");
        setActiveAssignment(undefined);
        setPhase("match-over");
        return;
      }
      setResultMessage(
        `Defense wins the rep. No eligible receiver finished open. Next: ${getDownAndDistanceLabel(
          nextSituation,
        )}.`,
      );
    }

    setActiveAssignment(undefined);
    setPhase("discussion");
  };

  const animateReveal = () => {
    const preSnapPenalty = getPreSnapPenalty(players, situation.ballSpotYard);
    if (preSnapPenalty) {
      const nextBallSpot = Math.min(
        PLAYABLE_END_YARD,
        situation.ballSpotYard + 5,
      );
      setQueuedRoundSituation({ ...situation, ballSpotYard: nextBallSpot });
      setResultMessage(
        `${preSnapPenalty.label} on the ${preSnapPenalty.team}. Ball moved back 5 yards.`,
      );
      setActiveAssignment(undefined);
      setPhase("discussion");
      return;
    }

    setActiveAssignment(undefined);
    setPhase("animating");
    const startPlayers = clonePlayers(players);
    const startPositions = Object.fromEntries(
      startPlayers.map((p) => [p.id, { ...p.position }]),
    );
    initialPositionsRef.current = startPositions;
    setPathStartOverrides(startPositions);
    setBallPosition(startPositions[QB_ID]);
    setBallCarrierId(QB_ID);
    const ballPlan = buildRevealBallPlan(startPlayers);
    const runBlockEngagements = findRunBlockEngagements(
      startPlayers,
      startPositions,
      situation.ballSpotYard,
      ballPlan,
    );
    const runTackleResult = ballPlan.isRunPlay
      ? findRunTackle(
          startPlayers,
          startPositions,
          situation.ballSpotYard,
          runBlockEngagements,
          ballPlan,
        )
      : undefined;
    lastRevealRef.current = {
      startPlayers: clonePlayers(startPlayers),
      startPositions: Object.fromEntries(
        Object.entries(startPositions).map(([id, point]) => [id, { ...point }]),
      ),
      runBlockEngagements,
      ballPlan,
      runTackleResult,
    };

    const duration = ballPlan.isRunPlay
      ? RUN_REVEAL_DURATION_MS
      : PASS_SCAN_DURATION_MS;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const basePositions = computeFramePositions(
        startPlayers,
        initialPositionsRef.current,
        progress,
        situation.ballSpotYard,
        runBlockEngagements,
        getRunCarrierIdAtProgress(ballPlan, progress),
      );
      const baseBallState = getBallStateAtProgress(basePositions, ballPlan, progress);
      const nextPositions = computeFramePositions(
        startPlayers,
        initialPositionsRef.current,
        progress,
        situation.ballSpotYard,
        runBlockEngagements,
        getRunCarrierIdAtProgress(ballPlan, progress),
        baseBallState?.position,
      );
      if (!ballPlan.isRunPlay && !ballPlan.completionTargetId) {
        const minReadProgress = PASS_MIN_READ_TIME_MS / PASS_SCAN_DURATION_MS;
        if (progress >= minReadProgress) {
          const openTarget = getBestOpenPassTargetAtFrame(
            startPlayers,
            nextPositions,
            situation.ballSpotYard,
          );
          if (openTarget) {
            ballPlan.completionTargetId = openTarget.id;
            ballPlan.passThrowStartProgress = Math.min(
              progress,
              1 - PASS_TRAVEL_DURATION_PROGRESS,
            );
            ballPlan.passThrowStartPoint =
              nextPositions[QB_ID] ?? startPositions[QB_ID];
          }
        }
      }
      const afterCatch = !ballPlan.isRunPlay
        ? applyAfterCatchEffort(
            startPlayers,
            nextPositions,
            situation.ballSpotYard,
            situation.requiredYards,
            ballPlan,
            progress,
          )
        : undefined;
      const resolvedPositions = afterCatch?.positions ?? nextPositions;
      const liveBallState =
        afterCatch?.ballState ??
        getBallStateAtProgress(resolvedPositions, ballPlan, progress);
      if (
        afterCatch?.tacklerId &&
        afterCatch.ballState.carrierId
      ) {
        const tackleResult: RunTackleResult = {
          ballCarrierId: afterCatch.ballState.carrierId,
          stopProgress: progress,
          stopPoint: afterCatch.ballState.position,
          frozenPositions: buildTackleFrozenPositions(
            startPlayers,
            resolvedPositions,
            afterCatch.ballState.carrierId,
            afterCatch.tacklerId,
          ),
        };
        if (lastRevealRef.current) {
          lastRevealRef.current.runTackleResult = tackleResult;
          lastRevealRef.current.ballPlan = { ...ballPlan };
        }
        setBallPosition(tackleResult.stopPoint);
        setBallCarrierId(tackleResult.ballCarrierId);
        setPlayers((prev) =>
          prev.map((player) => ({
            ...player,
            position: tackleResult.frozenPositions[player.id] ?? player.position,
          })),
        );
        setTimeout(
          () =>
            evaluateRound(
              startPlayers.map((player) => ({
                ...player,
                position: tackleResult.frozenPositions[player.id] ?? player.position,
              })),
              getManRandomizedTargetIds(
                startPlayers,
                initialPositionsRef.current,
                progress,
              ),
              tackleResult.ballCarrierId,
            ),
          120,
        );
        return;
      }
      const qbTacklerId =
        !ballPlan.isRunPlay && liveBallState?.carrierId === QB_ID
          ? getQuarterbackTacklerAtFrame(
              startPlayers,
              nextPositions,
              progress,
              runBlockEngagements,
            )
          : undefined;
      if (qbTacklerId) {
        const sackResult: RunTackleResult = {
          ballCarrierId: QB_ID,
          stopProgress: progress,
          stopPoint: nextPositions[QB_ID] ?? startPositions[QB_ID],
          frozenPositions: buildTackleFrozenPositions(
            startPlayers,
            nextPositions,
            QB_ID,
            qbTacklerId,
          ),
        };
        if (lastRevealRef.current) {
          lastRevealRef.current.runTackleResult = sackResult;
          lastRevealRef.current.ballPlan = { ...ballPlan };
        }
        setBallPosition(sackResult.stopPoint);
        setBallCarrierId(QB_ID);
        setPlayers((prev) =>
          prev.map((player) => ({
            ...player,
            position: sackResult.frozenPositions[player.id] ?? player.position,
          })),
        );
        setTimeout(
          () =>
            evaluateRound(
              startPlayers.map((player) => ({
                ...player,
                position: sackResult.frozenPositions[player.id] ?? player.position,
              })),
              getManRandomizedTargetIds(
                startPlayers,
                initialPositionsRef.current,
                progress,
              ),
              QB_ID,
            ),
          120,
        );
        return;
      }
      if (runTackleResult && progress >= runTackleResult.stopProgress) {
        const stopBallState = getBallStateAtProgress(
          runTackleResult.frozenPositions,
          ballPlan,
          runTackleResult.stopProgress,
        );
        setBallPosition(stopBallState?.position);
        setBallCarrierId(stopBallState?.carrierId);
        setPlayers((prev) =>
          prev.map((player) => ({
            ...player,
            position:
              runTackleResult.frozenPositions[player.id] ?? player.position,
          })),
        );
        setTimeout(
          () =>
            evaluateRound(
              startPlayers.map((player) => ({
                ...player,
                position:
                  runTackleResult.frozenPositions[player.id] ??
                  player.position,
              })),
              getManRandomizedTargetIds(
                startPlayers,
                initialPositionsRef.current,
                runTackleResult.stopProgress,
              ),
              runTackleResult.ballCarrierId,
            ),
          120,
        );
        return;
      }
      setBallPosition(liveBallState?.position);
      setBallCarrierId(liveBallState?.carrierId);
      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          position: resolvedPositions[p.id] ?? p.position,
        })),
      );
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        if (lastRevealRef.current) {
          lastRevealRef.current.ballPlan = { ...ballPlan };
        }
        setTimeout(
          () => {
            const randomizedTargets = getManRandomizedTargetIds(
              startPlayers,
              initialPositionsRef.current,
              1,
            );
            evaluateRound(
              startPlayers.map((p) => ({
                ...p,
                position: resolvedPositions[p.id] ?? p.position,
              })),
              randomizedTargets,
              liveBallState?.carrierId ?? ballPlan.completionTargetId,
            );
          },
          120,
        );
      }
    };

    requestAnimationFrame(tick);
  };

  const replayReveal = () => {
    if (phase !== "discussion") return;
    const snapshot = lastRevealRef.current;
    if (!snapshot) return;

    const startPlayers = clonePlayers(snapshot.startPlayers);
    const startPositions = Object.fromEntries(
      Object.entries(snapshot.startPositions).map(([id, point]) => [
        id,
        { ...point },
      ]),
    );
    initialPositionsRef.current = startPositions;
    setPathStartOverrides(startPositions);
    setPlayers(
      startPlayers.map((player) => ({
        ...player,
        position: startPositions[player.id] ?? player.position,
      })),
    );
    setBallPosition(startPositions[QB_ID]);
    setBallCarrierId(QB_ID);
    setPhase("animating");

    const duration = snapshot.ballPlan.isRunPlay
      ? RUN_REVEAL_DURATION_MS
      : PASS_SCAN_DURATION_MS;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const basePositions = computeFramePositions(
        startPlayers,
        initialPositionsRef.current,
        progress,
        situation.ballSpotYard,
        snapshot.runBlockEngagements,
        getRunCarrierIdAtProgress(snapshot.ballPlan, progress),
      );
      const baseBallState = getBallStateAtProgress(
        basePositions,
        snapshot.ballPlan,
        progress,
      );
      const nextPositions = computeFramePositions(
        startPlayers,
        initialPositionsRef.current,
        progress,
        situation.ballSpotYard,
        snapshot.runBlockEngagements,
        getRunCarrierIdAtProgress(snapshot.ballPlan, progress),
        baseBallState?.position,
      );
      const afterCatch = !snapshot.ballPlan.isRunPlay
        ? applyAfterCatchEffort(
            startPlayers,
            nextPositions,
            situation.ballSpotYard,
            situation.requiredYards,
            snapshot.ballPlan,
            progress,
          )
        : undefined;
      const resolvedPositions = afterCatch?.positions ?? nextPositions;
      if (
        snapshot.runTackleResult &&
        progress >= snapshot.runTackleResult.stopProgress
      ) {
        const stopBallState = getBallStateAtProgress(
          snapshot.runTackleResult.frozenPositions,
          snapshot.ballPlan,
          snapshot.runTackleResult.stopProgress,
        );
        setBallPosition(stopBallState?.position);
        setBallCarrierId(stopBallState?.carrierId);
        setPlayers((prev) =>
          prev.map((player) => ({
            ...player,
            position:
              snapshot.runTackleResult?.frozenPositions[player.id] ??
              player.position,
          })),
        );
        setTimeout(() => setPhase("discussion"), 120);
        return;
      }

      const liveBallState = getBallStateAtProgress(
        resolvedPositions,
        snapshot.ballPlan,
        progress,
      );
      const resolvedBallState = afterCatch?.ballState ?? liveBallState;
      setBallPosition(resolvedBallState?.position);
      setBallCarrierId(resolvedBallState?.carrierId);
      setPlayers((prev) =>
        prev.map((player) => ({
          ...player,
          position: resolvedPositions[player.id] ?? player.position,
        })),
      );

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(() => setPhase("discussion"), 120);
      }
    };

    requestAnimationFrame(tick);
  };

  const lockPhase = () => {
    if (phase === "offense-design") {
      setLastOffensePlay({
        players: clonePlayers(
          players.filter((player) => player.team === "offense"),
        ),
        losYard: situation.ballSpotYard,
      });
      setSelectedPlayerId(undefined);
      setActiveAssignment(undefined);
      setPhase("pass-device");
      return;
    }

    if (phase === "defense-design") {
      const snapshot = clonePlayers(players);
      roundStartFormationRef.current = {
        players: snapshot,
        losYard: situation.ballSpotYard,
      };
      setLastDefensePlay({
        players: clonePlayers(
          players.filter((player) => player.team === "defense"),
        ),
        losYard: situation.ballSpotYard,
      });
      setSelectedPlayerId(undefined);
      animateReveal();
    }
  };

  const advanceToNextRound = () => {
    if (phase !== "discussion") return;
    resetRound(queuedRoundSituation);
    setQueuedRoundSituation(undefined);
  };

  const applySavedTeamPlay = (team: "offense" | "defense") => {
    const saved = team === "offense" ? lastOffensePlay : lastDefensePlay;
    if (!saved) return;

    setPlayers((prev) =>
      enforceSingleRunCarrier(
        prev.map((player) => {
        if (player.team !== team) return player;
        const savedPlayer = saved.players.find(
          (candidate) => candidate.id === player.id,
        );
        if (!savedPlayer) return player;

        const translatedPosition = translatePointToLine(
          savedPlayer.position,
          saved.losYard,
          situation.ballSpotYard,
        );
        return {
          ...player,
          position: clampToLineOfScrimmageSide(
            player,
            translatedPosition,
            situation.ballSpotYard,
          ),
          assignment: savedPlayer.assignment,
          manTargetId: savedPlayer.manTargetId,
          path: savedPlayer.path.map((point) =>
            translatePointToLine(point, saved.losYard, situation.ballSpotYard),
          ),
        };
        }),
      ),
    );
  };

  const applySelectedTemplate = (team: "offense" | "defense") => {
    const templateId =
      team === "offense" ? selectedOffenseTemplateId : selectedDefenseTemplateId;
    if (!templateId) return;
    setPlayers((prev) =>
      enforceSingleRunCarrier(
        applyPlayTemplate(prev, team, templateId, situation.ballSpotYard),
      ),
    );
  };

  const applyTemplateById = (
    team: "offense" | "defense",
    templateId: string,
  ) => {
    if (!templateId) return;
    setPlayers((prev) =>
      enforceSingleRunCarrier(
        applyPlayTemplate(prev, team, templateId, situation.ballSpotYard),
      ),
    );
  };

  const offensivePlayers = players.filter((p) => p.team === "offense");
  const defensivePlayers = players.filter((p) => p.team === "defense");
  const displayBallPosition =
    ballPosition ?? players.find((player) => player.id === QB_ID)?.position;
  const displayBallCarrierId =
    ballCarrierId ?? (displayBallPosition ? QB_ID : undefined);
  const visibleZoneCoverages =
    phase === "defense-design" || phase === "animating" || phase === "discussion"
      ? getZoneCoverageAreas(defensivePlayers, situation.ballSpotYard)
      : [];

  return (
    <main className="h-screen overflow-hidden bg-gradient-to-b from-black via-zinc-950 to-black">
      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-[320px] max-w-[86vw] transform border-r border-zinc-700 bg-zinc-950/95 shadow-[14px_0_36px_rgba(0,0,0,0.45)] backdrop-blur transition-transform duration-300 ${
          controlsOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col pb-2">
          <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-3">
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-300">
              Turn:{" "}
              <span className="text-white">
                {phase === "offense-design" || phase === "pass-device"
                  ? "Offense"
                  : phase === "defense-design"
                    ? "Defense"
                    : "Reveal / Review"}
              </span>
            </div>
            {phase === "animating" ? (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-zinc-300">
                Simultaneous Reveal In Progress
              </div>
            ) : null}
            {phase === "pass-device" ? (
              <div className="rounded-xl border border-zinc-700/90 bg-zinc-900/85 p-3">
                <p className="text-xs font-semibold text-zinc-200">
                  Offense is locked. Hand to defense to set assignments.
                </p>
                <button
                  onClick={() => {
                    setActiveAssignment(undefined);
                    setPhase("defense-design");
                  }}
                  className="mt-3 w-full rounded-md border border-white bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-zinc-200"
                >
                  Defense Ready
                </button>
              </div>
            ) : null}
            {phase === "discussion" ? (
              <div className="rounded-xl border border-zinc-700/90 bg-zinc-900/85 p-3">
                <p className="text-xs font-semibold text-zinc-200">
                  {resultMessage}
                </p>
                <button
                  onClick={replayReveal}
                  className="mt-3 w-full rounded-md border border-zinc-500 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-100 transition hover:border-white hover:bg-zinc-800"
                >
                  Replay Reveal
                </button>
                <button
                  onClick={advanceToNextRound}
                  className="mt-3 w-full rounded-md border border-white bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-zinc-200"
                >
                  Next Round
                </button>
              </div>
            ) : null}

            {(phase === "offense-design" || phase === "defense-design") && (
              <>
                {phase === "offense-design" ? (
                  <div className="rounded-xl border border-zinc-700/90 bg-zinc-950/80 p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                      Offense Templates
                    </p>
                    <select
                      className="w-full rounded-md border border-zinc-600 bg-black px-2 py-2 text-xs font-semibold text-zinc-100"
                      value={selectedOffenseTemplateId}
                      onChange={(e) => {
                        const templateId = e.target.value;
                        setSelectedOffenseTemplateId(templateId);
                        applyTemplateById("offense", templateId);
                      }}
                    >
                      {offenseTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-[11px] text-zinc-400">
                      {offenseTemplates.find(
                        (template) => template.id === selectedOffenseTemplateId,
                      )?.description ?? "Select a template to seed assignments."}
                    </p>
                    <button
                      onClick={() => applySelectedTemplate("offense")}
                      className="mt-2 w-full rounded-md border border-zinc-500 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-100 transition hover:border-white hover:bg-zinc-800"
                    >
                      Apply Offense Template
                    </button>
                  </div>
                ) : null}
                {phase === "defense-design" ? (
                  <div className="rounded-xl border border-zinc-700/90 bg-zinc-950/80 p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                      Defense Templates
                    </p>
                    <select
                      className="w-full rounded-md border border-zinc-600 bg-black px-2 py-2 text-xs font-semibold text-zinc-100"
                      value={selectedDefenseTemplateId}
                      onChange={(e) => {
                        const templateId = e.target.value;
                        setSelectedDefenseTemplateId(templateId);
                        applyTemplateById("defense", templateId);
                      }}
                    >
                      {defenseTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-[11px] text-zinc-400">
                      {defenseTemplates.find(
                        (template) => template.id === selectedDefenseTemplateId,
                      )?.description ?? "Select a template to seed assignments."}
                    </p>
                    <button
                      onClick={() => applySelectedTemplate("defense")}
                      className="mt-2 w-full rounded-md border border-zinc-500 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-100 transition hover:border-white hover:bg-zinc-800"
                    >
                      Apply Defense Template
                    </button>
                  </div>
                ) : null}
                {currentSelected?.assignment === "man" ? (
                  <div className="rounded-xl border border-zinc-700/90 bg-zinc-950/80 p-3 text-xs font-semibold text-zinc-100">
                    <p className="uppercase tracking-wide text-zinc-400">
                      Man target
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-zinc-300">
                      Click an offensive skill player on the field or in the
                      player list.
                    </p>
                    <p className="mt-2 text-[11px] font-bold text-cyan-300">
                      Current:{" "}
                      {offensivePlayers.find(
                        (player) => player.id === currentSelected.manTargetId,
                      )?.label ?? "None"}
                    </p>
                  </div>
                ) : null}
                <AssignmentPanel
                  selectedPlayer={currentSelected}
                  phase={phase}
                  activeAssignment={activeAssignment}
                  offenseRunCarrierId={offenseRunCarrierId}
                  setAssignment={setAssignment}
                  clearPath={clearPath}
                  lockPhase={lockPhase}
                />
                {phase === "offense-design" && lastOffensePlay ? (
                  <button
                    onClick={() => applySavedTeamPlay("offense")}
                    className="w-full rounded-md border border-zinc-500 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-100 transition hover:border-white hover:bg-zinc-800"
                  >
                    Run Same Offense Play
                  </button>
                ) : null}
                {phase === "defense-design" && lastDefensePlay ? (
                  <button
                    onClick={() => applySavedTeamPlay("defense")}
                    className="w-full rounded-md border border-zinc-500 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-100 transition hover:border-white hover:bg-zinc-800"
                  >
                    Run Same Defense Play
                  </button>
                ) : null}
              </>
            )}

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                Players
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-200">
                {[...offensivePlayers, ...defensivePlayers].map((player) => (
                  <PlayerPiece
                    key={player.id}
                    player={player}
                    isSelected={player.id === selectedPlayerId}
                    isManTargetCandidate={
                      isManTargetSelectionMode &&
                      player.team === "offense" &&
                      ELIGIBLE_ROLES.has(player.role)
                    }
                    isCurrentManTarget={currentManTargetId === player.id}
                    onClick={handleSelectPlayer}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <button
        onClick={() => setControlsOpen((prev) => !prev)}
        aria-label={controlsOpen ? "Hide controls" : "Show controls"}
        title={controlsOpen ? "Hide controls" : "Show controls"}
        className={`fixed top-1/2 z-50 -translate-y-1/2 rounded-r-md border border-l-0 border-zinc-600 bg-zinc-950/95 px-2 py-3 text-zinc-100 shadow-[0_8px_18px_rgba(0,0,0,0.45)] transition hover:border-white hover:bg-zinc-900 ${
          controlsOpen ? "left-[320px] max-[640px]:left-[86vw]" : "left-0"
        }`}
      >
        {controlsOpen ? (
          <LuPanelLeftOpen className="h-4 w-4" />
        ) : (
          <LuPanelRightOpen className="h-4 w-4" />
        )}
      </button>

      <section
        className={`flex h-full min-h-0 w-full flex-col px-2 pb-2 transition-all duration-300 ${controlsOpen ? "md:pl-[330px]" : "md:pl-2"}`}
      >
        <div className="mb-1 flex items-center justify-center pt-1">
          <img
            src="/whiteboard-logo-poweredby.svg"
            alt="Whiteboard logo"
            className="h-12 w-auto max-w-[460px] object-contain"
          />
        </div>

        <div className="mb-2 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/90 backdrop-blur">
          <Scoreboard
            situation={situation}
            offenseWins={offenseWins}
            defenseWins={defenseWins}
            onReset={resetMatch}
          />
          <div className="border-t border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300">
            {situation.description} • Shared-device duel. First side to 3 round
            wins takes the match.
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <Field
            players={players}
            selectedPlayerId={selectedPlayerId}
            ballSpotYard={situation.ballSpotYard}
            requiredYards={situation.requiredYards}
            interactive={isInteractive}
            editableTeam={
              phase === "offense-design"
                ? "offense"
                : phase === "defense-design"
                  ? "defense"
                  : undefined
            }
            pathStartOverrides={
              phase === "animating" || phase === "discussion"
                ? pathStartOverrides
                : undefined
            }
            hiddenPathTeams={
              phase === "pass-device" || phase === "defense-design"
                ? ["offense"]
                : []
            }
            onSelectPlayer={handleSelectPlayer}
            onMovePlayer={movePlayer}
            onAppendPathPoint={appendPathPoint}
            zoneCoverages={visibleZoneCoverages}
            manTargetSelectionMode={isManTargetSelectionMode}
            ballPosition={displayBallPosition}
            ballCarrierId={displayBallCarrierId}
          />
        </div>
      </section>

      {phase === "match-over" && (
        <RevealOverlay
          title={resultMessage}
          subtitle="Reset to start a new match."
          actionLabel="Play Again"
          onAction={resetMatch}
        />
      )}
    </main>
  );
}
