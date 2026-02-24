'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AssignmentPanel } from '@/components/AssignmentPanel';
import { Field } from '@/components/Field';
import { PlayerPiece } from '@/components/PlayerPiece';
import { RevealOverlay } from '@/components/RevealOverlay';
import { Scoreboard } from '@/components/Scoreboard';
import { Point } from '@/lib/coordinateSystem';
import { AssignmentType, computeFramePositions, Player } from '@/lib/movementEngine';
import { evaluateSeparation } from '@/lib/separationEngine';
import { randomSituation, Situation } from '@/lib/situationEngine';

const ELIGIBLE_ROLES = new Set(['WR', 'TE', 'RB']);

type Phase =
  | 'offense-design'
  | 'pass-device'
  | 'defense-design'
  | 'animating'
  | 'evaluation'
  | 'discussion'
  | 'match-over';

const clonePlayers = (players: Player[]): Player[] => players.map((p) => ({ ...p, position: { ...p.position }, path: [...p.path] }));

const createRoster = (situation: Situation): Player[] => {
  const los = situation.ballSpotYard;

  const qb: Player = { id: 'qb', label: 'QB', team: 'offense', role: 'QB', position: { x: 26, y: los - 4 }, assignment: 'none', path: [] };
  const rb: Player = { id: 'rb', label: 'RB', team: 'offense', role: 'RB', position: { x: 29, y: los - 6 }, assignment: 'none', path: [] };
  const lt: Player = { id: 'lt', label: 'LT', team: 'offense', role: 'LT', position: { x: 22, y: los - 1 }, assignment: 'none', path: [] };
  const lg: Player = { id: 'lg', label: 'LG', team: 'offense', role: 'LG', position: { x: 24, y: los - 1 }, assignment: 'none', path: [] };
  const c: Player = { id: 'c', label: 'C', team: 'offense', role: 'C', position: { x: 26, y: los - 1 }, assignment: 'none', path: [] };
  const rg: Player = { id: 'rg', label: 'RG', team: 'offense', role: 'RG', position: { x: 28, y: los - 1 }, assignment: 'none', path: [] };
  const rt: Player = { id: 'rt', label: 'RT', team: 'offense', role: 'RT', position: { x: 30, y: los - 1 }, assignment: 'none', path: [] };
  const wr1: Player = { id: 'wr1', label: 'WR1', team: 'offense', role: 'WR', position: { x: 8, y: los - 2 }, assignment: 'none', path: [] };
  const wr2: Player = { id: 'wr2', label: 'WR2', team: 'offense', role: 'WR', position: { x: 44, y: los - 2 }, assignment: 'none', path: [] };
  const wr3: Player = { id: 'wr3', label: 'WR3', team: 'offense', role: 'WR', position: { x: 4, y: los - 4 }, assignment: 'none', path: [] };
  const te: Player = { id: 'te', label: 'TE', team: 'offense', role: 'TE', position: { x: 36, y: los - 1 }, assignment: 'none', path: [] };

  const dl1: Player = { id: 'dl1', label: 'DE', team: 'defense', role: 'DL', position: { x: 20, y: los + 1 }, assignment: 'none', path: [] };
  const dl2: Player = { id: 'dl2', label: 'DT1', team: 'defense', role: 'DL', position: { x: 24, y: los + 1 }, assignment: 'none', path: [] };
  const dl3: Player = { id: 'dl3', label: 'DT2', team: 'defense', role: 'DL', position: { x: 28, y: los + 1 }, assignment: 'none', path: [] };
  const dl4: Player = { id: 'dl4', label: 'DE2', team: 'defense', role: 'DL', position: { x: 32, y: los + 1 }, assignment: 'none', path: [] };
  const lb1: Player = { id: 'lb1', label: 'LB1', team: 'defense', role: 'LB', position: { x: 20, y: los + 4 }, assignment: 'none', path: [] };
  const lb2: Player = { id: 'lb2', label: 'LB2', team: 'defense', role: 'LB', position: { x: 26, y: los + 4 }, assignment: 'none', path: [] };
  const lb3: Player = { id: 'lb3', label: 'LB3', team: 'defense', role: 'LB', position: { x: 32, y: los + 4 }, assignment: 'none', path: [] };
  const db1: Player = { id: 'db1', label: 'CB1', team: 'defense', role: 'DB', position: { x: 8, y: los + 7 }, assignment: 'none', path: [] };
  const db2: Player = { id: 'db2', label: 'S1', team: 'defense', role: 'DB', position: { x: 20, y: los + 7 }, assignment: 'none', path: [] };
  const db3: Player = { id: 'db3', label: 'S2', team: 'defense', role: 'DB', position: { x: 32, y: los + 7 }, assignment: 'none', path: [] };
  const db4: Player = { id: 'db4', label: 'CB2', team: 'defense', role: 'DB', position: { x: 44, y: los + 7 }, assignment: 'none', path: [] };

  return [qb, rb, lt, lg, c, rg, rt, wr1, wr2, wr3, te, dl1, dl2, dl3, dl4, lb1, lb2, lb3, db1, db2, db3, db4];
};

export default function Home() {
  const [situation, setSituation] = useState<Situation>(() => randomSituation());
  const [players, setPlayers] = useState<Player[]>(() => createRoster(randomSituation()));
  const [phase, setPhase] = useState<Phase>('offense-design');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>();
  const [offenseWins, setOffenseWins] = useState(0);
  const [defenseWins, setDefenseWins] = useState(0);
  const [resultMessage, setResultMessage] = useState('');
  const [discussionSeconds, setDiscussionSeconds] = useState(5);

  const initialPositionsRef = useRef<Record<string, Point>>({});

  const currentSelected = useMemo(() => players.find((p) => p.id === selectedPlayerId), [players, selectedPlayerId]);

  const resetRound = (nextSituation?: Situation) => {
    const fresh = nextSituation ?? randomSituation(situation.id);
    setSituation(fresh);
    setPlayers(createRoster(fresh));
    setSelectedPlayerId(undefined);
    setPhase('offense-design');
  };

  const resetMatch = () => {
    setOffenseWins(0);
    setDefenseWins(0);
    setResultMessage('');
    resetRound(randomSituation());
  };

  const isInteractive = phase === 'offense-design' || phase === 'defense-design';

  const handleSelectPlayer = (id: string) => {
    const p = players.find((player) => player.id === id);
    if (!p) return;
    if (phase === 'offense-design' && p.team !== 'offense') return;
    if (phase === 'defense-design' && p.team !== 'defense') return;
    setSelectedPlayerId(id);
  };

  const setAssignment = (assignment: AssignmentType) => {
    if (!selectedPlayerId) return;
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === selectedPlayerId
          ? {
              ...p,
              assignment,
              manTargetId:
                assignment === 'man'
                  ? prev.find((candidate) => candidate.team === 'offense' && ELIGIBLE_ROLES.has(candidate.role))?.id
                  : undefined
            }
          : p
      )
    );
  };

  const setManTarget = (targetId: string) => {
    if (!currentSelected || currentSelected.assignment !== 'man') return;
    setPlayers((prev) => prev.map((p) => (p.id === currentSelected.id ? { ...p, manTargetId: targetId } : p)));
  };

  const clearPath = () => {
    if (!selectedPlayerId) return;
    setPlayers((prev) => prev.map((p) => (p.id === selectedPlayerId ? { ...p, path: [] } : p)));
  };

  const movePlayer = (id: string, point: Point) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, position: point } : p)));
  };

  const appendPathPoint = (id: string, point: Point) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, path: [...p.path, point] } : p)));
  };

  const evaluateRound = (finalPlayers: Player[]) => {
    const offenseEligible = finalPlayers.filter((p) => p.team === 'offense' && ELIGIBLE_ROLES.has(p.role));
    const defenders = finalPlayers.filter((p) => p.team === 'defense');
    const separation = evaluateSeparation(offenseEligible, defenders);

    const successfulReceiver = separation.find((res) => {
      const player = offenseEligible.find((p) => p.id === res.offensiveId);
      if (!player) return false;
      const gainedYards = player.position.y - situation.ballSpotYard;
      return gainedYards >= situation.requiredYards && res.isOpen;
    });

    if (successfulReceiver) {
      setOffenseWins((prev) => prev + 1);
      const winner = offenseEligible.find((p) => p.id === successfulReceiver.offensiveId);
      setResultMessage(`Offense scores! ${winner?.label ?? 'Receiver'} got open beyond the sticks.`);
    } else {
      setDefenseWins((prev) => prev + 1);
      setResultMessage('Defense wins the rep. No eligible receiver finished open past the line to gain.');
    }

    setPhase('evaluation');
  };

  const animateReveal = () => {
    setPhase('animating');
    const startPlayers = clonePlayers(players);
    initialPositionsRef.current = Object.fromEntries(startPlayers.map((p) => [p.id, { ...p.position }]));

    const duration = 3000;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const nextPositions = computeFramePositions(startPlayers, initialPositionsRef.current, progress);
      setPlayers((prev) => prev.map((p) => ({ ...p, position: nextPositions[p.id] ?? p.position })));
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(() => evaluateRound(startPlayers.map((p) => ({ ...p, position: nextPositions[p.id] ?? p.position }))), 120);
      }
    };

    requestAnimationFrame(tick);
  };

  const lockPhase = () => {
    if (phase === 'offense-design') {
      setSelectedPlayerId(undefined);
      setPhase('pass-device');
      return;
    }

    if (phase === 'defense-design') {
      setSelectedPlayerId(undefined);
      animateReveal();
    }
  };

  useEffect(() => {
    if (offenseWins >= 3 || defenseWins >= 3) {
      setPhase('match-over');
      setResultMessage(offenseWins >= 3 ? 'Offense wins the match 3 plays to glory.' : 'Defense stonewalls the match and wins.');
      return;
    }

    if (phase === 'evaluation') {
      setDiscussionSeconds(5);
      setPhase('discussion');
    }
  }, [offenseWins, defenseWins, phase]);

  useEffect(() => {
    if (phase !== 'discussion') return;
    const timer = setInterval(() => setDiscussionSeconds((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === 'discussion' && discussionSeconds <= 0) {
      resetRound();
    }
  }, [discussionSeconds, phase]);

  useEffect(() => {
    setPlayers(createRoster(situation));
  }, []);

  const offensivePlayers = players.filter((p) => p.team === 'offense');
  const defensivePlayers = players.filter((p) => p.team === 'defense');

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black">
      <Scoreboard situation={situation} offenseWins={offenseWins} defenseWins={defenseWins} onReset={resetMatch} />

      <section className="w-full px-2 py-2">
        <div className="mb-2 rounded-lg border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-xs font-semibold text-zinc-300">
          {situation.description} • Shared-device duel. First side to 3 round wins takes the match.
        </div>

        {phase === 'animating' ? (
          <div className="px-3 pb-1 text-center text-xs font-bold uppercase tracking-[0.2em] text-zinc-300">Simultaneous Reveal In Progress</div>
        ) : null}

        <Field
          players={players}
          selectedPlayerId={selectedPlayerId}
          ballSpotYard={situation.ballSpotYard}
          interactive={isInteractive}
          onSelectPlayer={handleSelectPlayer}
          onMovePlayer={movePlayer}
          onAppendPathPoint={appendPathPoint}
        />

        <div className="grid grid-cols-2 gap-2 px-2 text-xs text-zinc-200 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-11">
          {[...offensivePlayers, ...defensivePlayers].map((player) => (
            <PlayerPiece
              key={player.id}
              player={player}
              isSelected={player.id === selectedPlayerId}
              onClick={handleSelectPlayer}
            />
          ))}
        </div>
      </section>

      {(phase === 'offense-design' || phase === 'defense-design') && (
        <>
          {currentSelected?.assignment === 'man' ? (
            <div className="mx-4 mt-2 rounded border border-zinc-500 bg-zinc-900 p-2 text-xs font-semibold text-zinc-100">
              Man target:
              <select
                className="ml-2 rounded border border-zinc-600 bg-black px-2 py-1"
                value={currentSelected.manTargetId}
                onChange={(e) => setManTarget(e.target.value)}
              >
                {offensivePlayers.filter((p) => ELIGIBLE_ROLES.has(p.role)).map((p) => (
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
            setAssignment={setAssignment}
            clearPath={clearPath}
            lockPhase={lockPhase}
          />
        </>
      )}

      {phase === 'pass-device' && (
        <RevealOverlay
          title="Pass the device to the Defense"
          subtitle="Defense sets assignments and snapped paths next."
          actionLabel="Defense Ready"
          onAction={() => setPhase('defense-design')}
        />
      )}

      {phase === 'discussion' && (
        <RevealOverlay title={resultMessage} subtitle={`Discussion window: ${discussionSeconds}s remaining`} />
      )}
      {phase === 'match-over' && (
        <RevealOverlay title={resultMessage} subtitle="Reset to start a new match." actionLabel="Play Again" onAction={resetMatch} />
      )}
    </main>
  );
}
