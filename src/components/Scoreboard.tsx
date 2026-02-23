'use client';

import { Situation } from '@/lib/situationEngine';

type ScoreboardProps = {
  situation: Situation;
  offenseWins: number;
  defenseWins: number;
  onReset: () => void;
};

export function Scoreboard({ situation, offenseWins, defenseWins, onReset }: ScoreboardProps) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-200">
      <div>
        <p className="text-xs uppercase tracking-widest text-slate-400">Situation</p>
        <p className="font-semibold text-chalk">
          {situation.label} • Need {situation.requiredYards} yds
        </p>
      </div>
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-slate-400">Score</p>
        <p className="font-semibold text-chalk">Offense {offenseWins} - {defenseWins} Defense</p>
      </div>
      <button onClick={onReset} className="rounded border border-white/20 px-3 py-1 hover:bg-white/10">
        Reset Match
      </button>
    </div>
  );
}
