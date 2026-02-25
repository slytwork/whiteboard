'use client';

import { AssignmentType, Player } from '@/lib/movementEngine';

type PlayerPieceProps = {
  player: Player;
  isSelected: boolean;
  onClick: (id: string) => void;
};

const assignmentColor: Record<AssignmentType, string> = {
  none: 'text-zinc-200',
  run: 'text-white',
  'pass-route': 'text-zinc-100',
  block: 'text-zinc-300',
  man: 'text-zinc-100',
  zone: 'text-zinc-300',
  blitz: 'text-white',
  contain: 'text-zinc-300'
};

export function PlayerPiece({ player, isSelected, onClick }: PlayerPieceProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(player.id)}
      className={`rounded-md border px-2 py-1.5 text-xs font-bold transition ${
        player.team === 'offense' ? 'border-white/70 bg-white/10' : 'border-zinc-500 bg-zinc-800/70'
      } ${isSelected ? 'ring-2 ring-white' : 'hover:border-white/90 hover:bg-zinc-700/80'} ${assignmentColor[player.assignment]}`}
      title={`${player.label} (${player.role}) — ${player.assignment}`}
    >
      {player.label}
    </button>
  );
}
