'use client';

import { AssignmentType, Player } from '@/lib/movementEngine';

type AssignmentPanelProps = {
  selectedPlayer?: Player;
  phase: string;
  activeAssignment?: AssignmentType;
  offenseRunCarrierId?: string;
  setAssignment: (assignment: AssignmentType) => void;
  clearPath: () => void;
  lockPhase: () => void;
};

const OFFENSE_ASSIGNMENTS: AssignmentType[] = ['run', 'pass-route', 'block'];
const DEFENSE_ASSIGNMENTS: AssignmentType[] = ['man', 'zone', 'blitz', 'contain'];

export function AssignmentPanel({
  selectedPlayer,
  phase,
  activeAssignment,
  offenseRunCarrierId,
  setAssignment,
  clearPath,
  lockPhase
}: AssignmentPanelProps) {
  const isOffensePhase = phase === 'offense-design';
  const assignments = isOffensePhase ? OFFENSE_ASSIGNMENTS : DEFENSE_ASSIGNMENTS;
  const isRunLockedForSelected =
    isOffensePhase &&
    Boolean(offenseRunCarrierId) &&
    selectedPlayer?.id !== offenseRunCarrierId;

  return (
    <div className="rounded-xl border border-zinc-700/90 bg-zinc-950/80 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-200">
        <p className="text-xs sm:text-sm">
          Selected:{' '}
          <span className="font-black text-white">{selectedPlayer ? `${selectedPlayer.label} (${selectedPlayer.role})` : 'None'}</span>
        </p>
        <button
          className="rounded-md border border-zinc-600 bg-zinc-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide transition hover:border-white hover:bg-zinc-800"
          onClick={clearPath}
        >
          Clear path
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {assignments.map((assignment) => (
          <button
            key={assignment}
            disabled={!selectedPlayer || (assignment === 'run' && isRunLockedForSelected)}
            onClick={() => setAssignment(assignment)}
            className={`rounded-md border px-3 py-1 text-xs font-bold uppercase tracking-wide transition ${
              assignment === activeAssignment
                ? 'border-white bg-white text-black'
                : 'border-zinc-600 bg-zinc-900 text-zinc-100 hover:border-white hover:bg-zinc-800'
            } ${!selectedPlayer || (assignment === 'run' && isRunLockedForSelected) ? 'cursor-not-allowed opacity-40 hover:border-zinc-600 hover:bg-zinc-900' : ''}`}
            title={
              assignment === 'run' && isRunLockedForSelected
                ? 'Only the selected run carrier can keep the run assignment.'
                : undefined
            }
          >
            {assignment.replace('-', ' ')}
          </button>
        ))}
      </div>
      <button
        onClick={lockPhase}
        className="w-full rounded-md border border-white bg-white px-4 py-2 text-sm font-black uppercase tracking-wide text-black transition hover:bg-zinc-200"
      >
        {phase === 'offense-design' ? 'Lock Offense' : 'Lock Defense & Reveal'}
      </button>
    </div>
  );
}
