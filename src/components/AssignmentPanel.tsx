'use client';

import { AssignmentType, Player } from '@/lib/movementEngine';

type AssignmentPanelProps = {
  selectedPlayer?: Player;
  phase: string;
  setAssignment: (assignment: AssignmentType) => void;
  clearPath: () => void;
  lockPhase: () => void;
};

const OFFENSE_ASSIGNMENTS: AssignmentType[] = ['run', 'pass-route', 'block'];
const DEFENSE_ASSIGNMENTS: AssignmentType[] = ['man', 'zone', 'blitz', 'contain'];

export function AssignmentPanel({ selectedPlayer, phase, setAssignment, clearPath, lockPhase }: AssignmentPanelProps) {
  const isOffensePhase = phase === 'offense-design';
  const assignments = isOffensePhase ? OFFENSE_ASSIGNMENTS : DEFENSE_ASSIGNMENTS;

  return (
    <div className="border-t border-zinc-700 bg-black/85 p-4">
      <div className="mb-3 flex items-center justify-between text-sm text-zinc-200">
        <p>
          Selected:{' '}
          <span className="font-black text-white">{selectedPlayer ? `${selectedPlayer.label} (${selectedPlayer.role})` : 'None'}</span>
        </p>
        <button className="rounded border border-zinc-500 px-3 py-1 font-semibold hover:border-white hover:bg-zinc-800" onClick={clearPath}>
          Clear path
        </button>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {assignments.map((assignment) => (
          <button
            key={assignment}
            onClick={() => setAssignment(assignment)}
            className="rounded border border-zinc-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-zinc-100 hover:border-white hover:bg-zinc-800"
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
