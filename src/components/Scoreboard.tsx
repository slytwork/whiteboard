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
    <div className="flex items-center justify-between border-b border-zinc-700 bg-black px-4 py-3 text-sm text-zinc-200">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Situation</p>
        <p className="font-black text-white">
          {situation.label} • Need {situation.requiredYards} yds
        </p>
      </div>
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Score</p>
        <p className="font-black text-white">Offense {offenseWins} - {defenseWins} Defense</p>
      </div>
      <button onClick={onReset} className="rounded border border-zinc-500 px-3 py-1 font-bold hover:border-white hover:bg-zinc-800">
        Reset Match
      </button>
    </div>
  );
}
