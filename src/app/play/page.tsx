"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AssignmentPanel } from "@/components/AssignmentPanel";
import { Field } from "@/components/Field";
import { PlayerPiece } from "@/components/PlayerPiece";
import { RevealOverlay } from "@/components/RevealOverlay";
import { Scoreboard } from "@/components/Scoreboard";
import {
  clampFieldPoint,
  PLAYABLE_END_YARD,
  Point,
} from "@/lib/coordinateSystem";
import {
  AssignmentType,
  computeFramePositions,
  Player,
} from "@/lib/movementEngine";
import {
  evaluateSeparation,
  getBlockedDefenderIds,
} from "@/lib/separationEngine";
import {
  DEFAULT_SITUATION,
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
    label: "WR1",
    team: "offense",
    role: "WR",
    position: { x: 8, y: los + 2 },
    assignment: "none",
    path: [],
  };
  const wr2: Player = {
    id: "wr2",
    label: "WR2",
    team: "offense",
    role: "WR",
    position: { x: 44, y: los + 2 },
    assignment: "none",
    path: [],
  };
  const wr3: Player = {
    id: "wr3",
    label: "WR3",
    team: "offense",
    role: "WR",
    position: { x: 4, y: los + 4 },
    assignment: "none",
    path: [],
  };
  const te: Player = {
    id: "te",
    label: "TE",
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

  const initialPositionsRef = useRef<Record<string, Point>>({});
  const roundStartFormationRef = useRef<{
    players: Player[];
    losYard: number;
  }>();
  const lastOffensePlayRef = useRef<{ players: Player[]; losYard: number }>();
  const lastDefensePlayRef = useRef<{ players: Player[]; losYard: number }>();

  const currentSelected = useMemo(
    () => players.find((p) => p.id === selectedPlayerId),
    [players, selectedPlayerId],
  );

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
    lastOffensePlayRef.current = undefined;
    lastDefensePlayRef.current = undefined;
    setSelectedPlayerId(undefined);
    setPhase("offense-design");
  };

  const isInteractive =
    phase === "offense-design" || phase === "defense-design";

  const handleSelectPlayer = (id: string) => {
    const p = players.find((player) => player.id === id);
    if (!p) return;
    if (phase === "offense-design" && p.team !== "offense") return;
    if (phase === "defense-design" && p.team !== "defense") return;
    setSelectedPlayerId(id);

    if (!activeAssignment) return;
    setPlayers((prev) =>
      prev.map((player) =>
        player.id === id
          ? {
              ...player,
              assignment: activeAssignment,
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
    );
  };

  const setAssignment = (assignment: AssignmentType) => {
    setActiveAssignment(assignment);
    if (!selectedPlayerId) return;
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === selectedPlayerId
          ? {
              ...p,
              assignment,
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
      prev.map((p) => (p.id === id ? { ...p, path: [...p.path, point] } : p)),
    );
  };

  const evaluateRound = (finalPlayers: Player[]) => {
    setQueuedRoundSituation(undefined);
    const offenseEligible = finalPlayers.filter(
      (p) => p.team === "offense" && ELIGIBLE_ROLES.has(p.role),
    );
    const defenders = finalPlayers.filter((p) => p.team === "defense");
    const blockers = finalPlayers.filter(
      (p) => p.team === "offense" && p.assignment === "block",
    );
    const blockedDefenderIds = getBlockedDefenderIds(blockers, defenders);
    const activeDefenders = defenders.filter(
      (defender) => !blockedDefenderIds.has(defender.id),
    );
    const separation = evaluateSeparation(offenseEligible, activeDefenders);

    const successfulReceiver = separation.find((res) => {
      const player = offenseEligible.find((p) => p.id === res.offensiveId);
      if (!player) return false;
      const gainedYards = situation.ballSpotYard - player.position.y;
      return gainedYards >= situation.requiredYards && res.isOpen;
    });

    if (successfulReceiver) {
      setOffenseWins((prev) => prev + 1);
      const winner = offenseEligible.find(
        (p) => p.id === successfulReceiver.offensiveId,
      );
      setResultMessage(
        `Offense scores! ${winner?.label ?? "Receiver"} got open beyond the sticks.`,
      );
    } else {
      setDefenseWins((prev) => prev + 1);
      setResultMessage(
        "Defense wins the rep. No eligible receiver finished open past the line to gain.",
      );
    }

    setPhase("evaluation");
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
      setPhase("discussion");
      return;
    }

    setPhase("animating");
    const startPlayers = clonePlayers(players);
    initialPositionsRef.current = Object.fromEntries(
      startPlayers.map((p) => [p.id, { ...p.position }]),
    );

    const duration = 3000;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const nextPositions = computeFramePositions(
        startPlayers,
        initialPositionsRef.current,
        progress,
      );
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
          () =>
            evaluateRound(
              startPlayers.map((p) => ({
                ...p,
                position: nextPositions[p.id] ?? p.position,
              })),
            ),
          120,
        );
      }
    };

    requestAnimationFrame(tick);
  };

  const lockPhase = () => {
    if (phase === "offense-design") {
      lastOffensePlayRef.current = {
        players: clonePlayers(
          players.filter((player) => player.team === "offense"),
        ),
        losYard: situation.ballSpotYard,
      };
      setSelectedPlayerId(undefined);
      setPhase("pass-device");
      return;
    }

    if (phase === "defense-design") {
      const snapshot = clonePlayers(players);
      roundStartFormationRef.current = {
        players: snapshot,
        losYard: situation.ballSpotYard,
      };
      lastDefensePlayRef.current = {
        players: clonePlayers(
          players.filter((player) => player.team === "defense"),
        ),
        losYard: situation.ballSpotYard,
      };
      setSelectedPlayerId(undefined);
      animateReveal();
    }
  };

  useEffect(() => {
    if (offenseWins >= 3 || defenseWins >= 3) {
      setPhase("match-over");
      setResultMessage(
        offenseWins >= 3
          ? "Offense wins the match 3 plays to glory."
          : "Defense stonewalls the match and wins.",
      );
      return;
    }

    if (phase === "evaluation") {
      setPhase("discussion");
    }
  }, [offenseWins, defenseWins, phase]);

  useEffect(() => {
    setActiveAssignment(undefined);
  }, [phase]);

  const advanceToNextRound = () => {
    if (phase !== "discussion") return;
    resetRound(queuedRoundSituation);
    setQueuedRoundSituation(undefined);
  };

  const applySavedTeamPlay = (team: "offense" | "defense") => {
    const saved =
      team === "offense"
        ? lastOffensePlayRef.current
        : lastDefensePlayRef.current;
    if (!saved) return;

    setPlayers((prev) =>
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
    );
  };

  const offensivePlayers = players.filter((p) => p.team === "offense");
  const defensivePlayers = players.filter((p) => p.team === "defense");

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
                  onClick={advanceToNextRound}
                  className="mt-3 w-full rounded-md border border-white bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-zinc-200"
                >
                  Next Round
                </button>
              </div>
            ) : null}

            {(phase === "offense-design" || phase === "defense-design") && (
              <>
                {currentSelected?.assignment === "man" ? (
                  <div className="rounded-xl border border-zinc-700/90 bg-zinc-950/80 p-3 text-xs font-semibold text-zinc-100">
                    <label className="mr-2 uppercase tracking-wide text-zinc-400">
                      Man target
                    </label>
                    <select
                      className="rounded-md border border-zinc-600 bg-black px-2 py-1 text-xs font-semibold text-zinc-100"
                      value={currentSelected.manTargetId}
                      onChange={(e) => setManTarget(e.target.value)}
                    >
                      {offensivePlayers
                        .filter((p) => ELIGIBLE_ROLES.has(p.role))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                    </select>
                  </div>
                ) : null}
                <AssignmentPanel
                  selectedPlayer={currentSelected}
                  phase={phase}
                  activeAssignment={activeAssignment}
                  setAssignment={setAssignment}
                  clearPath={clearPath}
                  lockPhase={lockPhase}
                />
                {phase === "offense-design" && lastOffensePlayRef.current ? (
                  <button
                    onClick={() => applySavedTeamPlay("offense")}
                    className="w-full rounded-md border border-zinc-500 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-100 transition hover:border-white hover:bg-zinc-800"
                  >
                    Run Same Offense Play
                  </button>
                ) : null}
                {phase === "defense-design" && lastDefensePlayRef.current ? (
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
                ? initialPositionsRef.current
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
          />
        </div>
      </section>

      {phase === "pass-device" && (
        <RevealOverlay
          title="Pass the device to the Defense"
          subtitle="Defense sets assignments and snapped paths next."
          actionLabel="Defense Ready"
          onAction={() => setPhase("defense-design")}
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
