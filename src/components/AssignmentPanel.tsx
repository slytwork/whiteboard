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
    <div className="border-t border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between text-sm text-slate-200">
        <p>
          Selected:{' '}
          <span className="font-semibold text-chalk">{selectedPlayer ? `${selectedPlayer.label} (${selectedPlayer.role})` : 'None'}</span>
        </p>
        <button className="rounded border border-white/20 px-3 py-1 hover:bg-white/10" onClick={clearPath}>
          Clear path
        </button>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {assignments.map((assignment) => (
          <button
            key={assignment}
            onClick={() => setAssignment(assignment)}
            className="rounded border border-white/20 px-3 py-1 text-xs uppercase tracking-wide text-slate-200 hover:border-accent hover:text-white"
          >
            {assignment.replace('-', ' ')}
          </button>
        ))}
      </div>
      <button
        onClick={lockPhase}
        className="w-full rounded bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-lime-300"
      >
        {phase === 'offense-design' ? 'Lock Offense' : 'Lock Defense & Reveal'}
      </button>
    </div>
  );
}
