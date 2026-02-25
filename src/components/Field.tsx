'use client';

import { useMemo } from 'react';

import {
  FIELD_LENGTH_PX,
  FIELD_WIDTH_PX,
  Point,
  YARD_TO_PX,
  yardsToPx
} from '@/lib/coordinateSystem';
import { Player, Team } from '@/lib/movementEngine';
import { snapPointToYard } from '@/lib/snapping';

const offenseEligibleRoles = new Set(['WR', 'TE', 'RB']);

type FieldProps = {
  players: Player[];
  selectedPlayerId?: string;
  ballSpotYard: number;
  interactive: boolean;
  editableTeam?: Team;
  pathStartOverrides?: Record<string, Point>;
  hiddenPathTeams?: Team[];
  onSelectPlayer: (id: string) => void;
  onMovePlayer: (id: string, point: Point) => void;
  onAppendPathPoint: (id: string, point: Point) => void;
};

const toSvg = (point: Point) => ({ x: yardsToPx(point.x), y: yardsToPx(point.y) });

const getSnappedPointFromPointer = (svg: SVGSVGElement, clientX: number, clientY: number): Point => {
  const viewBox = svg.viewBox.baseVal;
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
    x: (viewBox.x + relativeX * viewBox.width) / YARD_TO_PX,
    y: (viewBox.y + relativeY * viewBox.height) / YARD_TO_PX
  });
};

export function Field({
  players,
  selectedPlayerId,
  ballSpotYard,
  interactive,
  editableTeam,
  pathStartOverrides,
  hiddenPathTeams = [],
  onSelectPlayer,
  onMovePlayer,
  onAppendPathPoint
}: FieldProps) {
  const selected = players.find((p) => p.id === selectedPlayerId);
  const dynamicViewBox = useMemo(() => {
    const minVisibleHeight = yardsToPx(60);
    const edgePadding = yardsToPx(10);
    const playerYs = players.map((player) => yardsToPx(player.position.y));
    const minPlayerY = playerYs.length ? Math.min(...playerYs) : yardsToPx(ballSpotYard);
    const maxPlayerY = playerYs.length ? Math.max(...playerYs) : yardsToPx(ballSpotYard);
    const playerSpan = Math.max(0, maxPlayerY - minPlayerY) + edgePadding * 2;
    const viewHeight = Math.min(FIELD_LENGTH_PX, Math.max(minVisibleHeight, playerSpan));
    const desiredCenterY = yardsToPx(ballSpotYard);
    const maxTop = FIELD_LENGTH_PX - viewHeight;
    const top = Math.max(0, Math.min(maxTop, desiredCenterY - viewHeight / 2));
    return { x: 0, y: top, width: FIELD_WIDTH_PX, height: viewHeight };
  }, [ballSpotYard, players]);

  const handleFieldClick = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || !selected || (editableTeam && selected.team !== editableTeam)) return;
    const point = getSnappedPointFromPointer(event.currentTarget, event.clientX, event.clientY);
    onAppendPathPoint(selected.id, point);
  };

  return (
    <div className="relative flex h-full w-full flex-col px-0 py-2">
      <svg
        viewBox={`${dynamicViewBox.x} ${dynamicViewBox.y} ${dynamicViewBox.width} ${dynamicViewBox.height}`}
        preserveAspectRatio="xMidYMid slice"
        className="block min-h-0 flex-1 w-full rounded-xl border border-white/25 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
        onPointerDown={handleFieldClick}
      >
        <defs>
          <marker id="offense-arrow-end" markerWidth="4" markerHeight="4" refX="3.5" refY="2" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 3.5 2 L 0 4 z" fill="#ffffff" />
          </marker>
          <marker id="defense-arrow-end" markerWidth="4" markerHeight="4" refX="3.5" refY="2" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 3.5 2 L 0 4 z" fill="#a1a1aa" />
          </marker>
          <marker id="offense-block-end" markerWidth="4" markerHeight="4" refX="3.1" refY="2" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 2.6 0.8 L 2.6 3.2" stroke="#ffffff" strokeWidth="0.9" strokeLinecap="round" fill="none" />
          </marker>
          <marker id="defense-block-end" markerWidth="4" markerHeight="4" refX="3.1" refY="2" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 2.6 0.8 L 2.6 3.2" stroke="#a1a1aa" strokeWidth="0.9" strokeLinecap="round" fill="none" />
          </marker>
        </defs>

        <rect x={0} y={0} width={FIELD_WIDTH_PX} height={FIELD_LENGTH_PX} fill="#111111" />
        <rect x={0} y={0} width={FIELD_WIDTH_PX} height={yardsToPx(10)} fill="#202020" />
        <rect x={0} y={yardsToPx(110)} width={FIELD_WIDTH_PX} height={yardsToPx(10)} fill="#202020" />

        <line x1={0} x2={0} y1={0} y2={FIELD_LENGTH_PX} stroke="#f5f5f5" strokeWidth={2} opacity={0.9} />
        <line x1={FIELD_WIDTH_PX} x2={FIELD_WIDTH_PX} y1={0} y2={FIELD_LENGTH_PX} stroke="#f5f5f5" strokeWidth={2} opacity={0.9} />
        <line x1={0} x2={FIELD_WIDTH_PX} y1={yardsToPx(10)} y2={yardsToPx(10)} stroke="#f5f5f5" strokeWidth={2} opacity={0.9} />
        <line x1={0} x2={FIELD_WIDTH_PX} y1={yardsToPx(110)} y2={yardsToPx(110)} stroke="#f5f5f5" strokeWidth={2} opacity={0.9} />

        {Array.from({ length: 25 }).map((_, i) => {
          const yard = i * 5;
          if (yard === 10 || yard === 110) return null;
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
              opacity={yard % 10 === 0 ? 0.28 : 0.16}
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
              <text x={yardsToPx(6)} y={y - 2} fill="#fafafa" fontSize={12} fontWeight={700} opacity={0.38}>
                {display}
              </text>
              <text x={yardsToPx(47)} y={y - 2} fill="#fafafa" fontSize={12} fontWeight={700} opacity={0.38}>
                {display}
              </text>
            </g>
          );
        })}

        {Array.from({ length: 100 }).map((_, i) => {
          const y = yardsToPx(i + 10);
          return (
            <g key={`hash-${i}`} opacity={0.28}>
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
          const pathStart = pathStartOverrides?.[player.id] ?? player.position;
          const pathPoints = [pathStart, ...player.path].map(toSvg);
          const pathD = pathPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
          const isSelected = player.id === selectedPlayerId;
          const isEligible = player.team === 'offense' && offenseEligibleRoles.has(player.role);
          const isArrowAssignment = player.assignment === 'run' || player.assignment === 'pass-route';
          const isBlockAssignment = player.assignment === 'block';
          const markerEnd = isBlockAssignment
            ? `url(#${player.team === 'offense' ? 'offense' : 'defense'}-block-end)`
            : isArrowAssignment
              ? `url(#${player.team === 'offense' ? 'offense' : 'defense'}-arrow-end)`
              : undefined;

          return (
            <g key={player.id}>
              {!hiddenPathTeams.includes(player.team) && player.path.length ? (
                <path
                  d={pathD}
                  stroke={player.team === 'offense' ? '#ffffff' : '#a1a1aa'}
                  strokeDasharray={player.assignment === 'block' ? '3 3' : 'none'}
                  markerEnd={markerEnd}
                  fill="none"
                  strokeWidth={isSelected ? 3.2 : 2.2}
                  strokeLinecap="round"
                  opacity={0.9}
                />
              ) : null}

              <g
                transform={`translate(${p.x}, ${p.y})`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (!interactive || (editableTeam && player.team !== editableTeam)) return;
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
                className={interactive && (!editableTeam || player.team === editableTeam) ? 'cursor-pointer' : 'cursor-not-allowed'}
              >
                <circle
                  r={6.375}
                  fill={player.team === 'offense' ? '#ffffff' : '#52525b'}
                  stroke={isSelected ? '#ffffff' : '#09090b'}
                  strokeWidth={isSelected ? 2.25 : 1.5}
                />
                <text x={0} y={2.25} textAnchor="middle" fill={player.team === 'offense' ? '#09090b' : '#fafafa'} fontSize={5.25} fontWeight={800}>
                  {player.role}
                </text>
                {isEligible ? <circle r={8.625} fill="none" stroke="#e4e4e7" strokeWidth={0.825} opacity={0.9} /> : null}
              </g>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 shrink-0 text-xs font-medium text-zinc-300">
        Drag players for alignment. Click field for snapped 1/5-yard path points from selected player.
      </p>
    </div>
  );
}
