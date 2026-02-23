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

  const offense: Player[] = [
    { id: 'qb', label: 'QB', team: 'offense', role: 'QB', position: { x: 26, y: los - 4 }, assignment: 'none', path: [] },
    { id: 'rb', label: 'RB', team: 'offense', role: 'RB', position: { x: 29, y: los - 6 }, assignment: 'none', path: [] },
    ...['LT', 'LG', 'C', 'RG', 'RT'].map((role, idx) => ({
      id: role.toLowerCase(), label: role, team: 'offense' as const, role, position: { x: 22 + idx * 2, y: los - 1 }, assignment: 'none' as const, path: []
    })),
    { id: 'wr1', label: 'WR1', team: 'offense', role: 'WR', position: { x: 8, y: los - 2 }, assignment: 'none', path: [] },
    { id: 'wr2', label: 'WR2', team: 'offense', role: 'WR', position: { x: 44, y: los - 2 }, assignment: 'none', path: [] },
    { id: 'wr3', label: 'WR3', team: 'offense', role: 'WR', position: { x: 4, y: los - 4 }, assignment: 'none', path: [] },
    { id: 'te', label: 'TE', team: 'offense', role: 'TE', position: { x: 36, y: los - 1 }, assignment: 'none', path: [] }
  ];

  const defense: Player[] = [
    ...['DE', 'DT1', 'DT2', 'DE2'].map((role, idx) => ({
      id: `dl${idx + 1}`,
      label: role,
      team: 'defense' as const,
      role: 'DL',
      position: { x: 20 + idx * 4, y: los + 1 },
      assignment: 'none' as const,
      path: []
    })),
    ...['LB1', 'LB2', 'LB3'].map((label, idx) => ({
      id: `lb${idx + 1}`,
      label,
      team: 'defense' as const,
      role: 'LB',
      position: { x: 20 + idx * 6, y: los + 4 },
      assignment: 'none' as const,
      path: []
    })),
    ...['CB1', 'S1', 'S2', 'CB2'].map((label, idx) => ({
      id: `db${idx + 1}`,
      label,
      team: 'defense' as const,
      role: 'DB',
      position: { x: 8 + idx * 12, y: los + 7 },
      assignment: 'none' as const,
      path: []
    }))
  ];

  return [...offense, ...defense];
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

    const duration = 2200;
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
    const newOffenseTotal = offenseWins;
    const newDefenseTotal = defenseWins;

    if (newOffenseTotal >= 3 || newDefenseTotal >= 3) {
      setPhase('match-over');
      setResultMessage(newOffenseTotal >= 3 ? 'Offense wins the match 3 plays to glory.' : 'Defense stonewalls the match and wins.');
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
    <main className="min-h-screen bg-gradient-to-b from-board to-black">
      <Scoreboard situation={situation} offenseWins={offenseWins} defenseWins={defenseWins} onReset={resetMatch} />

      <section className="mx-auto max-w-[1400px] px-2 py-2">
        <div className="mb-2 rounded border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-300">
          {situation.description} • Offense remains on offense all match. First side to 3 round wins takes it.
        </div>

        <Field
          players={players}
          selectedPlayerId={selectedPlayerId}
          ballSpotYard={situation.ballSpotYard}
          interactive={isInteractive}
          onSelectPlayer={handleSelectPlayer}
          onMovePlayer={movePlayer}
          onAppendPathPoint={appendPathPoint}
        />

        <div className="grid grid-cols-2 gap-2 px-2 text-xs text-slate-300 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
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
            <div className="mx-4 mt-2 rounded border border-sky-300/30 bg-sky-950/30 p-2 text-xs text-sky-100">
              Man target:
              <select
                className="ml-2 rounded bg-black/40 px-2 py-1"
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

      {phase === 'animating' && <RevealOverlay title="Simultaneous Reveal" subtitle="Executing movement..." />}
      {phase === 'discussion' && (
        <RevealOverlay title={resultMessage} subtitle={`Discuss the rep. Next round in ${discussionSeconds}s`} />
      )}
      {phase === 'match-over' && (
        <RevealOverlay title={resultMessage} subtitle="Reset to start a new match." actionLabel="Play Again" onAction={resetMatch} />
      )}
    </main>
  );
}
