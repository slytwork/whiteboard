'use client';

import {
  FIELD_LENGTH_PX,
  FIELD_LENGTH_YARDS,
  FIELD_WIDTH_PX,
  FIELD_WIDTH_YARDS,
  Point,
  YARD_TO_PX,
  yardsToPx
} from '@/lib/coordinateSystem';
import { Player } from '@/lib/movementEngine';
import { snapPointToYard } from '@/lib/snapping';

const offenseEligibleRoles = new Set(['WR', 'TE', 'RB']);

type FieldProps = {
  players: Player[];
  selectedPlayerId?: string;
  ballSpotYard: number;
  interactive: boolean;
  onSelectPlayer: (id: string) => void;
  onMovePlayer: (id: string, point: Point) => void;
  onAppendPathPoint: (id: string, point: Point) => void;
};

const toSvg = (point: Point) => ({ x: yardsToPx(point.x), y: yardsToPx(point.y) });

export function Field({
  players,
  selectedPlayerId,
  ballSpotYard,
  interactive,
  onSelectPlayer,
  onMovePlayer,
  onAppendPathPoint
}: FieldProps) {
  const selected = players.find((p) => p.id === selectedPlayerId);

  const getPointFromEvent = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * FIELD_WIDTH_YARDS;
    const y = ((event.clientY - rect.top) / rect.height) * FIELD_LENGTH_YARDS;
    return snapPointToYard({ x, y });
  };

  const handleFieldClick = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || !selected) return;
    const point = getPointFromEvent(event);
    onAppendPathPoint(selected.id, point);
  };

  return (
    <div className="relative mx-auto w-full max-w-[1300px] px-2 py-3">
      <svg
        viewBox={`0 0 ${FIELD_WIDTH_PX} ${FIELD_LENGTH_PX}`}
        className="h-[70vh] w-full rounded-lg border border-white/20 bg-board shadow-2xl"
        onPointerDown={handleFieldClick}
      >
        <rect x={0} y={0} width={FIELD_WIDTH_PX} height={FIELD_LENGTH_PX} fill="#0b2e23" />
        <rect x={0} y={0} width={FIELD_WIDTH_PX} height={yardsToPx(10)} fill="#155e4b" />
        <rect x={0} y={yardsToPx(110)} width={FIELD_WIDTH_PX} height={yardsToPx(10)} fill="#155e4b" />

        {Array.from({ length: 25 }).map((_, i) => {
          const yard = i * 5;
          const y = yardsToPx(yard);
          return (
            <line
              key={yard}
              x1={0}
              x2={FIELD_WIDTH_PX}
              y1={y}
              y2={y}
              stroke={yard % 10 === 0 ? '#ecfeff' : '#86efac'}
              strokeWidth={yard % 10 === 0 ? 1.5 : 0.7}
              opacity={0.55}
            />
          );
        })}

        {Array.from({ length: 21 }).map((_, i) => {
          const yard = i * 5 + 10;
          if (yard >= 110 || yard % 10 !== 0) return null;
          const display = yard <= 60 ? yard - 10 : 110 - yard;
          const y = yardsToPx(yard);
          return (
            <g key={`num-${yard}`}>
              <text x={yardsToPx(6)} y={y - 2} fill="#ddf4e7" fontSize={12}>
                {display}
              </text>
              <text x={yardsToPx(47)} y={y - 2} fill="#ddf4e7" fontSize={12}>
                {display}
              </text>
            </g>
          );
        })}

        {Array.from({ length: 100 }).map((_, i) => {
          const y = yardsToPx(i + 10);
          return (
            <g key={`hash-${i}`} opacity={0.7}>
              <line x1={yardsToPx(20)} x2={yardsToPx(21)} y1={y} y2={y} stroke="#f0fdf4" strokeWidth={1} />
              <line x1={yardsToPx(32.3)} x2={yardsToPx(33.3)} y1={y} y2={y} stroke="#f0fdf4" strokeWidth={1} />
            </g>
          );
        })}

        <line
          x1={0}
          x2={FIELD_WIDTH_PX}
          y1={yardsToPx(ballSpotYard)}
          y2={yardsToPx(ballSpotYard)}
          stroke="#facc15"
          strokeDasharray="5 5"
          strokeWidth={2}
        />

        {players.map((player) => {
          const p = toSvg(player.position);
          const pathPoints = [player.position, ...player.path].map(toSvg);
          const pathD = pathPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
          const isSelected = player.id === selectedPlayerId;
          const isEligible = player.team === 'offense' && offenseEligibleRoles.has(player.role);

          return (
            <g key={player.id}>
              {player.path.length ? (
                <path
                  d={pathD}
                  stroke={player.team === 'offense' ? '#fde047' : '#7dd3fc'}
                  strokeDasharray={player.assignment === 'block' ? '2 2' : 'none'}
                  fill="none"
                  strokeWidth={isSelected ? 3 : 2}
                  opacity={0.85}
                />
              ) : null}

              <g
                transform={`translate(${p.x}, ${p.y})`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (!interactive) return;
                  onSelectPlayer(player.id);
                  const svg = (event.target as SVGElement).ownerSVGElement;
                  if (!svg) return;

                  const move = (moveEvent: PointerEvent) => {
                    const rect = svg.getBoundingClientRect();
                    const next = snapPointToYard({
                      x: ((moveEvent.clientX - rect.left) / rect.width) * FIELD_WIDTH_YARDS,
                      y: ((moveEvent.clientY - rect.top) / rect.height) * FIELD_LENGTH_YARDS
                    });
                    onMovePlayer(player.id, next);
                  };
                  const up = () => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                  };

                  window.addEventListener('pointermove', move);
                  window.addEventListener('pointerup', up);
                }}
                className="cursor-pointer"
              >
                <circle
                  r={8}
                  fill={player.team === 'offense' ? '#fef08a' : '#93c5fd'}
                  stroke={isSelected ? '#84cc16' : '#020617'}
                  strokeWidth={isSelected ? 3 : 1.5}
                />
                <text x={0} y={3} textAnchor="middle" fill="#020617" fontSize={7} fontWeight={700}>
                  {player.role}
                </text>
                {isEligible ? <circle r={11} fill="none" stroke="#86efac" strokeWidth={1} opacity={0.7} /> : null}
              </g>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-xs text-slate-300">
        Drag pieces to align. Click the field to add snapped 1-yard path points for the selected piece.
      </p>
    </div>
  );
}
