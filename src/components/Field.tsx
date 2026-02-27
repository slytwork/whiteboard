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
import { ZoneCoverageArea } from '@/lib/separationEngine';
import { snapPointToYard } from '@/lib/snapping';

const offenseEligibleRoles = new Set(['WR', 'TE', 'RB']);

type FieldProps = {
  players: Player[];
  selectedPlayerId?: string;
  ballSpotYard: number;
  requiredYards: number;
  interactive: boolean;
  editableTeam?: Team;
  pathStartOverrides?: Record<string, Point>;
  hiddenPathTeams?: Team[];
  zoneCoverages?: ZoneCoverageArea[];
  manTargetSelectionMode?: boolean;
  ballPosition?: Point;
  ballCarrierId?: string;
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
  requiredYards,
  interactive,
  editableTeam,
  pathStartOverrides,
  hiddenPathTeams = [],
  zoneCoverages = [],
  manTargetSelectionMode = false,
  ballPosition,
  ballCarrierId,
  onSelectPlayer,
  onMovePlayer,
  onAppendPathPoint
}: FieldProps) {
  const lineToGainYard = Math.max(0, ballSpotYard - requiredYards);
  const selected = players.find((p) => p.id === selectedPlayerId);
  const manLinks = players
    .filter(
      (player) =>
        player.team === 'defense' &&
        player.assignment === 'man' &&
        Boolean(player.manTargetId)
    )
    .map((defender) => ({
      defender,
      target: players.find((candidate) => candidate.id === defender.manTargetId)
    }))
    .filter((link): link is { defender: Player; target: Player } => Boolean(link.target));
  const selectedManTargetId = selected?.assignment === 'man' ? selected.manTargetId : undefined;
  const dynamicViewBox = useMemo(() => {
    const minVisibleHeight = yardsToPx(60);
    const edgePadding = yardsToPx(10);
    const defenseSideOffset = yardsToPx(10);
    const playerYs = players.map((player) => yardsToPx(player.position.y));
    const minPlayerY = playerYs.length ? Math.min(...playerYs) : yardsToPx(ballSpotYard);
    const maxPlayerY = playerYs.length ? Math.max(...playerYs) : yardsToPx(ballSpotYard);
    const playerSpan = Math.max(0, maxPlayerY - minPlayerY) + edgePadding * 2;
    const viewHeight = Math.min(FIELD_LENGTH_PX, Math.max(minVisibleHeight, playerSpan));
    const desiredCenterY = yardsToPx(ballSpotYard) - defenseSideOffset;
    const maxTop = FIELD_LENGTH_PX - viewHeight;
    const baseTop = Math.max(0, Math.min(maxTop, desiredCenterY - viewHeight / 2));
    const minimumOffenseSideVisibleY = yardsToPx(ballSpotYard + 5);
    const minTopForOffenseSide = minimumOffenseSideVisibleY - viewHeight;
    const top = Math.max(0, Math.min(maxTop, Math.max(baseTop, minTopForOffenseSide)));
    return { x: 0, y: top, width: FIELD_WIDTH_PX, height: viewHeight };
  }, [ballSpotYard, players]);

  const handleFieldClick = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || !selected || (editableTeam && selected.team !== editableTeam)) return;
    if (selected.assignment === 'man' || selected.assignment === 'blitz') return;
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
          <marker id="blitz-arrow-end" markerWidth="4" markerHeight="4" refX="3.5" refY="2" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 3.5 2 L 0 4 z" fill="#ef4444" />
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
          stroke="#2563eb"
          strokeWidth={2.2}
          opacity={0.9}
        />
        <line
          x1={0}
          x2={FIELD_WIDTH_PX}
          y1={yardsToPx(lineToGainYard)}
          y2={yardsToPx(lineToGainYard)}
          stroke="#facc15"
          strokeWidth={2}
          opacity={0.95}
        />

        {manLinks.map(({ defender, target }) => (
          <line
            key={`man-link-${defender.id}-${target.id}`}
            x1={yardsToPx(defender.position.x)}
            y1={yardsToPx(defender.position.y)}
            x2={yardsToPx(target.position.x)}
            y2={yardsToPx(target.position.y)}
            stroke={defender.id === selectedPlayerId ? '#67e8f9' : '#22d3ee'}
            strokeWidth={defender.id === selectedPlayerId ? 1.4 : 1.1}
            strokeDasharray="4 4"
            opacity={defender.id === selectedPlayerId ? 0.6 : 0.38}
          />
        ))}

        {ballPosition ? (
          <g transform={`translate(${yardsToPx(ballPosition.x)}, ${yardsToPx(ballPosition.y)})`}>
            <ellipse rx={2.1} ry={1.45} fill="#8b5a2b" stroke="#f5f5f5" strokeWidth={0.45} />
            <line x1={-0.95} x2={0.95} y1={0} y2={0} stroke="#f5f5f5" strokeWidth={0.35} strokeLinecap="round" />
          </g>
        ) : null}

        {zoneCoverages.map((zone) => (
          <g key={`zone-${zone.defenderId}`}>
            {zone.shape === 'ellipse' &&
            zone.center &&
            zone.radiusX !== undefined &&
            zone.radiusY !== undefined ? (
              <>
                <ellipse
                  cx={yardsToPx(zone.center.x)}
                  cy={yardsToPx(zone.center.y)}
                  rx={yardsToPx(zone.radiusX)}
                  ry={yardsToPx(zone.radiusY)}
                  fill="#93c5fd"
                  opacity={0.12}
                />
                <ellipse
                  cx={yardsToPx(zone.center.x)}
                  cy={yardsToPx(zone.center.y)}
                  rx={yardsToPx(zone.radiusX)}
                  ry={yardsToPx(zone.radiusY)}
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth={1.2}
                  strokeDasharray="5 4"
                  opacity={0.45}
                />
              </>
            ) : null}
            {zone.shape === 'circle' && zone.center && zone.radius !== undefined ? (
              <>
                <circle
                  cx={yardsToPx(zone.center.x)}
                  cy={yardsToPx(zone.center.y)}
                  r={yardsToPx(zone.radius)}
                  fill="#93c5fd"
                  opacity={0.12}
                />
                <circle
                  cx={yardsToPx(zone.center.x)}
                  cy={yardsToPx(zone.center.y)}
                  r={yardsToPx(zone.radius)}
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth={1.2}
                  strokeDasharray="5 4"
                  opacity={0.45}
                />
              </>
            ) : null}
          </g>
        ))}

        {players.map((player) => {
          const p = toSvg(player.position);
          const pathStart = pathStartOverrides?.[player.id] ?? player.position;
          const pathPoints = [pathStart, ...player.path].map(toSvg);
          const pathD = pathPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
          const isSelected = player.id === selectedPlayerId;
          const isEligible = player.team === 'offense' && offenseEligibleRoles.has(player.role);
          const fieldTag = player.label;
          const fieldTagFontSize = fieldTag.length >= 4 ? 4.2 : 5.25;
          const isManTargetCandidate = manTargetSelectionMode && isEligible;
          const isCurrentManTarget = isManTargetCandidate && selectedManTargetId === player.id;
          const isArrowAssignment =
            player.assignment === 'run' ||
            player.assignment === 'pass-route' ||
            player.assignment === 'blitz';
          const isBlockAssignment = player.assignment === 'block';
          const isBlitzAssignment = player.assignment === 'blitz';
          const markerEnd = isBlockAssignment
            ? `url(#${player.team === 'offense' ? 'offense' : 'defense'}-block-end)`
            : isBlitzAssignment
              ? 'url(#blitz-arrow-end)'
            : isArrowAssignment
              ? `url(#${player.team === 'offense' ? 'offense' : 'defense'}-arrow-end)`
              : undefined;
          const pathStroke = isBlitzAssignment
            ? '#ef4444'
            : player.team === 'offense'
              ? '#ffffff'
              : '#a1a1aa';

          return (
            <g key={player.id}>
              {!hiddenPathTeams.includes(player.team) &&
              player.assignment !== 'blitz' &&
              player.path.length ? (
                <path
                  d={pathD}
                  stroke={pathStroke}
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
                  const isEditable = !editableTeam || player.team === editableTeam;
                  const canChooseManTarget =
                    manTargetSelectionMode &&
                    editableTeam === 'defense' &&
                    player.team === 'offense' &&
                    offenseEligibleRoles.has(player.role);
                  if (!interactive || (!isEditable && !canChooseManTarget)) return;
                  onSelectPlayer(player.id);
                  if (!isEditable) return;
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
                className={
                  interactive &&
                  ((!editableTeam || player.team === editableTeam) ||
                    (manTargetSelectionMode && player.team === 'offense' && offenseEligibleRoles.has(player.role)))
                    ? 'cursor-pointer'
                    : 'cursor-not-allowed'
                }
              >
                <circle
                  r={6.375}
                  fill={player.team === 'offense' ? '#ffffff' : '#52525b'}
                  stroke={isCurrentManTarget ? '#67e8f9' : isSelected ? '#ffffff' : '#09090b'}
                  strokeWidth={isSelected ? 2.25 : 1.5}
                />
                {ballCarrierId === player.id ? (
                  <circle r={8.1} fill="none" stroke="#facc15" strokeWidth={0.9} opacity={0.9} />
                ) : null}
                <text x={0} y={2.25} textAnchor="middle" fill={player.team === 'offense' ? '#09090b' : '#fafafa'} fontSize={fieldTagFontSize} fontWeight={800}>
                  {fieldTag}
                </text>
                {isEligible ? <circle r={8.625} fill="none" stroke="#e4e4e7" strokeWidth={0.825} opacity={0.9} /> : null}
                {isManTargetCandidate ? (
                  <circle
                    r={9.8}
                    fill="none"
                    stroke={isCurrentManTarget ? '#67e8f9' : '#22d3ee'}
                    strokeDasharray="2.5 2"
                    strokeWidth={0.9}
                    opacity={0.85}
                  />
                ) : null}
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
