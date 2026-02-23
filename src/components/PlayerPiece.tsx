'use client';

import { AssignmentType, Player } from '@/lib/movementEngine';

type PlayerPieceProps = {
  player: Player;
  isSelected: boolean;
  onClick: (id: string) => void;
};

const assignmentColor: Record<AssignmentType, string> = {
  none: 'text-slate-300',
  run: 'text-amber-300',
  'pass-route': 'text-lime-300',
  block: 'text-orange-300',
  man: 'text-sky-300',
  zone: 'text-cyan-300',
  blitz: 'text-rose-300',
  contain: 'text-violet-300'
};

export function PlayerPiece({ player, isSelected, onClick }: PlayerPieceProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(player.id)}
      className={`rounded-full border px-2 py-1 text-xs font-semibold transition ${
        player.team === 'offense'
          ? 'border-amber-200 bg-amber-100/15'
          : 'border-sky-200 bg-sky-200/15'
      } ${isSelected ? 'ring-2 ring-accent' : 'hover:opacity-80'} ${assignmentColor[player.assignment]}`}
      title={`${player.label} (${player.role}) — ${player.assignment}`}
    >
      {player.label}
    </button>
  );
}
