'use client';

import { getDownAndDistanceLabel, Situation } from '@/lib/situationEngine';

type ScoreboardProps = {
  situation: Situation;
  offenseWins: number;
  defenseWins: number;
  onReset: () => void;
};

export function Scoreboard({ situation, offenseWins, defenseWins, onReset }: ScoreboardProps) {
  return (
    <div className="grid gap-3 px-3 py-3 text-sm text-zinc-200">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Situation</p>
        <p className="font-black text-white">
          {getDownAndDistanceLabel(situation)} • Need {situation.requiredYards} yds
        </p>
      </div>
      <div className="grid gap-2">
        <div className="rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Score</p>
          <p className="font-black text-white">Offense {offenseWins} - {defenseWins} Defense</p>
        </div>
        <button
          onClick={onReset}
          className="rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-bold uppercase tracking-wide transition hover:border-white hover:bg-zinc-800"
        >
          Reset Match
        </button>
      </div>
    </div>
  );
}
