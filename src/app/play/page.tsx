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
  getOffenseCoveredByZones,
  getBlockedDefenderIds,
  getZoneCoverageAreas,
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
const RUN_TACKLE_SAMPLE_STEPS = 240;

type RunTackleResult = {
  runnerId: string;
  tackleProgress: number;
  tacklePoint: Point;
  frozenPositions: Record<string, Point>;
};

type RevealSnapshot = {
  startPlayers: Player[];
  startPositions: Record<string, Point>;
  runBlockEngagements: RunBlockEngagementMap;
  runTackleResult?: RunTackleResult;
};

const findRunBlockEngagements = (
  players: Player[],
  startPositions: Record<string, Point>,
  lineOfScrimmageYard: number,
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
      if (!nearest || nearest.distance > RUN_TACKLE_RADIUS_YARDS) continue;
      engagedBlockerIds.add(blocker.id);
      engagedDefenderIds.add(nearest.id);
      const defenderPoint =
        frame[nearest.id] ??
        defenders.find((defender) => defender.id === nearest.id)?.position;
      if (!defenderPoint) continue;
      engagements[nearest.id] = {
        progress,
        freezePoint: defenderPoint,
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
): RunTackleResult | undefined => {
  const runner = players.find(
    (player) => player.team === "offense" && player.assignment === "run",
  );
  if (!runner) return undefined;
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
    );
    const runnerPoint = frame[runner.id];
    if (!runnerPoint) continue;
    const blockedDefenderIds = new Set(
      Object.entries(runBlockEngagements)
        .filter(([, engagement]) => engagement.progress <= progress)
        .map(([defenderId]) => defenderId),
    );

    const tackled = defenders.some((defender) => {
      if (blockedDefenderIds.has(defender.id)) return false;
      const defenderPoint = frame[defender.id];
      if (!defenderPoint) return false;
      return (
        distanceBetweenPoints(runnerPoint, defenderPoint) <=
        RUN_TACKLE_RADIUS_YARDS
      );
    });

    if (tackled) {
      return {
        runnerId: runner.id,
        tackleProgress: progress,
        tacklePoint: runnerPoint,
        frozenPositions: frame,
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
    setPhase("offense-design");
  };

  const resetMatch = () => {
    const fresh = randomSituation();
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
              path: activeAssignment === "man" ? [] : player.path,
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
              path: assignment === "man" ? [] : p.path,
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
          ? p.assignment === "man"
            ? p
            : { ...p, path: [...p.path, point] }
          : p,
      ),
    );
  };

  const evaluateRound = (
    finalPlayers: Player[],
    manRandomizedTargetIds: Set<string> = new Set(),
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
      const gainedYards = Math.max(
        0,
        situation.ballSpotYard - runCarrier.position.y,
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
          `Run success by ${runCarrier.label} for ${toDisplayYards(
            gainedYards,
          )} yds. Next: ${getDownAndDistanceLabel(nextSituation)}.`,
        );
        setActiveAssignment(undefined);
        setPhase("discussion");
        return;
      }

      if (gainedYards > 0) {
        setResultMessage(
          `Run gain of ${toDisplayYards(gainedYards)} yds by ${runCarrier.label}. Next: ${getDownAndDistanceLabel(
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
    const runBlockEngagements = findRunBlockEngagements(
      startPlayers,
      startPositions,
      situation.ballSpotYard,
    );
    const runTackleResult = findRunTackle(
      startPlayers,
      startPositions,
      situation.ballSpotYard,
      runBlockEngagements,
    );
    lastRevealRef.current = {
      startPlayers: clonePlayers(startPlayers),
      startPositions: Object.fromEntries(
        Object.entries(startPositions).map(([id, point]) => [id, { ...point }]),
      ),
      runBlockEngagements,
      runTackleResult,
    };

    const duration = 3000;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const nextPositions = computeFramePositions(
        startPlayers,
        initialPositionsRef.current,
        progress,
        situation.ballSpotYard,
        runBlockEngagements,
      );
      if (runTackleResult && progress >= runTackleResult.tackleProgress) {
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
                runTackleResult.tackleProgress,
              ),
            ),
          120,
        );
        return;
      }
      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          position: nextPositions[p.id] ?? p.position,
        })),
      );
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(
          () => {
            const randomizedTargets = getManRandomizedTargetIds(
              startPlayers,
              initialPositionsRef.current,
              1,
            );
            return (
            evaluateRound(
              startPlayers.map((p) => ({
                ...p,
                position: nextPositions[p.id] ?? p.position,
              })),
              randomizedTargets,
            )
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
    setPhase("animating");

    const duration = 3000;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const nextPositions = computeFramePositions(
        startPlayers,
        initialPositionsRef.current,
        progress,
        situation.ballSpotYard,
        snapshot.runBlockEngagements,
      );
      if (
        snapshot.runTackleResult &&
        progress >= snapshot.runTackleResult.tackleProgress
      ) {
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

      setPlayers((prev) =>
        prev.map((player) => ({
          ...player,
          position: nextPositions[player.id] ?? player.position,
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
            {phase === "animating" ? (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-zinc-300">
                Simultaneous Reveal In Progress
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
          />
        </div>
      </section>

      {phase === "pass-device" && (
        <RevealOverlay
          title="Pass the device to the Defense"
          subtitle="Defense sets assignments and snapped paths next."
          actionLabel="Defense Ready"
          onAction={() => {
            setActiveAssignment(undefined);
            setPhase("defense-design");
          }}
        />
      )}

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
