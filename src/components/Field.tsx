'use client';

import {
  FIELD_LENGTH_PX,
  FIELD_WIDTH_PX,
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

const getSnappedPointFromPointer = (svg: SVGSVGElement, clientX: number, clientY: number): Point => {
  const ctm = svg.getScreenCTM();
  if (ctm) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const transformed = pt.matrixTransform(ctm.inverse());
    return snapPointToYard({ x: transformed.x / YARD_TO_PX, y: transformed.y / YARD_TO_PX });
  }

  const rect = svg.getBoundingClientRect();
  const relativeX = (clientX - rect.left) / rect.width;
  const relativeY = (clientY - rect.top) / rect.height;
  return snapPointToYard({
    x: relativeX * (FIELD_WIDTH_PX / YARD_TO_PX),
    y: relativeY * (FIELD_LENGTH_PX / YARD_TO_PX)
  });
};

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

  const handleFieldClick = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || !selected) return;
    const point = getSnappedPointFromPointer(event.currentTarget, event.clientX, event.clientY);
    onAppendPathPoint(selected.id, point);
  };

  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 px-0 py-2">
      <svg
        viewBox={`0 0 ${FIELD_WIDTH_PX} ${FIELD_LENGTH_PX}`}
        preserveAspectRatio="none"
        className="h-[calc(100vh-250px)] min-h-[560px] w-screen rounded-none border-y border-white/25 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
        onPointerDown={handleFieldClick}
      >
        <rect x={0} y={0} width={FIELD_WIDTH_PX} height={FIELD_LENGTH_PX} fill="#111111" />
        <rect x={0} y={0} width={FIELD_WIDTH_PX} height={yardsToPx(10)} fill="#202020" />
        <rect x={0} y={yardsToPx(110)} width={FIELD_WIDTH_PX} height={yardsToPx(10)} fill="#202020" />

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
              stroke={yard % 10 === 0 ? '#f5f5f5' : '#9ca3af'}
              strokeWidth={yard % 10 === 0 ? 1.6 : 0.8}
              opacity={0.7}
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
              <text x={yardsToPx(6)} y={y - 2} fill="#fafafa" fontSize={12} fontWeight={700}>
                {display}
              </text>
              <text x={yardsToPx(47)} y={y - 2} fill="#fafafa" fontSize={12} fontWeight={700}>
                {display}
              </text>
            </g>
          );
        })}

        {Array.from({ length: 100 }).map((_, i) => {
          const y = yardsToPx(i + 10);
          return (
            <g key={`hash-${i}`} opacity={0.9}>
              <line x1={yardsToPx(20)} x2={yardsToPx(21)} y1={y} y2={y} stroke="#f3f4f6" strokeWidth={1} />
              <line x1={yardsToPx(32.3)} x2={yardsToPx(33.3)} y1={y} y2={y} stroke="#f3f4f6" strokeWidth={1} />
            </g>
          );
        })}

        <line
          x1={0}
          x2={FIELD_WIDTH_PX}
          y1={yardsToPx(ballSpotYard)}
          y2={yardsToPx(ballSpotYard)}
          stroke="#ffffff"
          strokeDasharray="7 4"
          strokeWidth={2.2}
          opacity={0.9}
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
                  stroke={player.team === 'offense' ? '#ffffff' : '#a1a1aa'}
                  strokeDasharray={player.assignment === 'block' ? '3 3' : 'none'}
                  fill="none"
                  strokeWidth={isSelected ? 3.2 : 2.2}
                  opacity={0.9}
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
                    const next = getSnappedPointFromPointer(svg, moveEvent.clientX, moveEvent.clientY);
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
                  r={8.5}
                  fill={player.team === 'offense' ? '#ffffff' : '#52525b'}
                  stroke={isSelected ? '#ffffff' : '#09090b'}
                  strokeWidth={isSelected ? 3 : 2}
                />
                <text x={0} y={3} textAnchor="middle" fill={player.team === 'offense' ? '#09090b' : '#fafafa'} fontSize={7} fontWeight={800}>
                  {player.role}
                </text>
                {isEligible ? <circle r={11.5} fill="none" stroke="#e4e4e7" strokeWidth={1.1} opacity={0.9} /> : null}
              </g>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-xs font-medium text-zinc-300">
        Drag players for alignment. Click field for snapped 1-yard path points from selected player.
      </p>
    </div>
  );
}
