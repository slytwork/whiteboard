'use client';

import { AssignmentPanel } from '@/components/AssignmentPanel';
import { PlayerPiece } from '@/components/PlayerPiece';
import { Scoreboard } from '@/components/Scoreboard';
import { PlayTemplate } from '@/lib/playTemplates';
import { Situation } from '@/lib/situationEngine';
import { AssignmentType, Player } from '@/lib/movementEngine';

type Phase =
  | 'offense-design'
  | 'defense-design'
  | 'ready-reveal'
  | 'animating'
  | 'evaluation'
  | 'discussion'
  | 'match-over';

type ControlsPanelProps = {
  controlsOpen: boolean;
  phase: Phase;
  situation: Situation;
  offenseWins: number;
  defenseWins: number;
  onResetMatch: () => void;
  resultMessage: string;
  onReplayReveal: () => void;
  onAdvanceToNextRound: () => void;
  offenseTemplates: PlayTemplate[];
  defenseTemplates: PlayTemplate[];
  selectedOffenseTemplateId: string;
  selectedDefenseTemplateId: string;
  setSelectedOffenseTemplateId: (id: string) => void;
  setSelectedDefenseTemplateId: (id: string) => void;
  applyTemplateById: (team: 'offense' | 'defense', templateId: string) => void;
  applySelectedTemplate: (team: 'offense' | 'defense') => void;
  currentSelected?: Player;
  offensivePlayers: Player[];
  activeAssignment?: AssignmentType;
  offenseRunCarrierId?: string;
  setAssignment: (assignment: AssignmentType) => void;
  clearPath: () => void;
  lockPhase: () => void;
  hasLastOffensePlay: boolean;
  hasLastDefensePlay: boolean;
  applySavedTeamPlay: (team: 'offense' | 'defense') => void;
  onBackToOffense: () => void;
  controlPanelPlayers: Player[];
  selectedPlayerId?: string;
  isManTargetSelectionMode: boolean;
  isCurrentManTarget: (playerId: string) => boolean;
  onSelectPlayer: (id: string) => void;
  isEligibleRole: (role: string) => boolean;
};

export function ControlsPanel({
  controlsOpen,
  phase,
  situation,
  offenseWins,
  defenseWins,
  onResetMatch,
  resultMessage,
  onReplayReveal,
  onAdvanceToNextRound,
  offenseTemplates,
  defenseTemplates,
  selectedOffenseTemplateId,
  selectedDefenseTemplateId,
  setSelectedOffenseTemplateId,
  setSelectedDefenseTemplateId,
  applyTemplateById,
  applySelectedTemplate,
  currentSelected,
  offensivePlayers,
  activeAssignment,
  offenseRunCarrierId,
  setAssignment,
  clearPath,
  lockPhase,
  hasLastOffensePlay,
  hasLastDefensePlay,
  applySavedTeamPlay,
  onBackToOffense,
  controlPanelPlayers,
  selectedPlayerId,
  isManTargetSelectionMode,
  isCurrentManTarget,
  onSelectPlayer,
  isEligibleRole,
}: ControlsPanelProps) {
  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen w-[320px] max-w-[86vw] transform border-r border-zinc-700 bg-zinc-950/95 shadow-[14px_0_36px_rgba(0,0,0,0.45)] backdrop-blur transition-transform duration-300 ${
        controlsOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex h-full flex-col pb-2">
        <div className="hide-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-3">
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-300">
            Turn:{' '}
            <span className="text-white">
              {phase === 'offense-design'
                ? 'Offense'
                : phase === 'defense-design'
                  ? 'Defense'
                  : 'Reveal / Review'}
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/90 backdrop-blur">
            <Scoreboard
              situation={situation}
              offenseWins={offenseWins}
              defenseWins={defenseWins}
              onReset={onResetMatch}
            />
            <div className="border-t border-zinc-800 px-3 py-2 text-[11px] font-semibold text-zinc-300">
              {situation.description} • Shared-device duel. First side to 3 round wins takes the match.
            </div>
          </div>
          {phase === 'animating' ? (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-zinc-300">
              Simultaneous Reveal In Progress
            </div>
          ) : null}
          {phase === 'discussion' ? (
            <div className="rounded-xl border border-zinc-700/90 bg-zinc-900/85 p-3">
              <p className="text-xs font-semibold text-zinc-200">{resultMessage}</p>
              <button
                onClick={onReplayReveal}
                className="mt-3 w-full rounded-md border border-zinc-500 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-100 transition hover:border-white hover:bg-zinc-800"
              >
                Replay Reveal
              </button>
              <button
                onClick={onAdvanceToNextRound}
                className="mt-3 w-full rounded-md border border-white bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-zinc-200"
              >
                Next Round
              </button>
            </div>
          ) : null}

          {(phase === 'offense-design' || phase === 'defense-design') && (
            <>
              {phase === 'offense-design' ? (
                <div className="rounded-xl border border-zinc-700/90 bg-zinc-950/80 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    Offense Templates
                  </p>
                  <select
                    className="w-full rounded-md border border-zinc-600 bg-black px-2 py-2 text-xs font-semibold text-zinc-100"
                    value={selectedOffenseTemplateId}
                    onChange={(e) => {
                      const templateId = e.target.value;
                      setSelectedOffenseTemplateId(templateId);
                      applyTemplateById('offense', templateId);
                    }}
                  >
                    {offenseTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-[11px] text-zinc-400">
                    {offenseTemplates.find((template) => template.id === selectedOffenseTemplateId)
                      ?.description ?? 'Select a template to seed assignments.'}
                  </p>
                  <button
                    onClick={() => applySelectedTemplate('offense')}
                    className="mt-2 w-full rounded-md border border-zinc-500 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-100 transition hover:border-white hover:bg-zinc-800"
                  >
                    Apply Offense Template
                  </button>
                </div>
              ) : null}
              {phase === 'defense-design' ? (
                <div className="rounded-xl border border-zinc-700/90 bg-zinc-950/80 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    Defense Templates
                  </p>
                  <select
                    className="w-full rounded-md border border-zinc-600 bg-black px-2 py-2 text-xs font-semibold text-zinc-100"
                    value={selectedDefenseTemplateId}
                    onChange={(e) => {
                      const templateId = e.target.value;
                      setSelectedDefenseTemplateId(templateId);
                      applyTemplateById('defense', templateId);
                    }}
                  >
                    {defenseTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-[11px] text-zinc-400">
                    {defenseTemplates.find((template) => template.id === selectedDefenseTemplateId)
                      ?.description ?? 'Select a template to seed assignments.'}
                  </p>
                  <button
                    onClick={() => applySelectedTemplate('defense')}
                    className="mt-2 w-full rounded-md border border-zinc-500 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-100 transition hover:border-white hover:bg-zinc-800"
                  >
                    Apply Defense Template
                  </button>
                </div>
              ) : null}
              {currentSelected?.assignment === 'man' ? (
                <div className="rounded-xl border border-zinc-700/90 bg-zinc-950/80 p-3 text-xs font-semibold text-zinc-100">
                  <p className="uppercase tracking-wide text-zinc-400">Man target</p>
                  <p className="mt-1 text-[11px] font-medium text-zinc-300">
                    Click an offensive skill player on the field or in the player list.
                  </p>
                  <p className="mt-2 text-[11px] font-bold text-cyan-300">
                    Current:{' '}
                    {offensivePlayers.find((player) => player.id === currentSelected.manTargetId)
                      ?.label ?? 'None'}
                  </p>
                </div>
              ) : null}
              <AssignmentPanel
                selectedPlayer={currentSelected}
                phase={phase}
                activeAssignment={activeAssignment}
                offenseRunCarrierId={offenseRunCarrierId}
                setAssignment={setAssignment}
                clearPath={clearPath}
                lockPhase={lockPhase}
              />
              {phase === 'offense-design' && hasLastOffensePlay ? (
                <button
                  onClick={() => applySavedTeamPlay('offense')}
                  className="w-full rounded-md border border-zinc-500 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-100 transition hover:border-white hover:bg-zinc-800"
                >
                  Run Same Offense Play
                </button>
              ) : null}
              {phase === 'defense-design' && hasLastDefensePlay ? (
                <button
                  onClick={() => applySavedTeamPlay('defense')}
                  className="w-full rounded-md border border-zinc-500 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-100 transition hover:border-white hover:bg-zinc-800"
                >
                  Run Same Defense Play
                </button>
              ) : null}
              {phase === 'defense-design' ? (
                <button
                  onClick={onBackToOffense}
                  className="w-full rounded-md border border-zinc-500 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-100 transition hover:border-white hover:bg-zinc-800"
                >
                  Back To Offense
                </button>
              ) : null}
            </>
          )}

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Players
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-200">
              {controlPanelPlayers.map((player) => (
                <PlayerPiece
                  key={player.id}
                  player={player}
                  isSelected={player.id === selectedPlayerId}
                  isManTargetCandidate={
                    isManTargetSelectionMode &&
                    player.team === 'offense' &&
                    isEligibleRole(player.role)
                  }
                  isCurrentManTarget={isCurrentManTarget(player.id)}
                  onClick={onSelectPlayer}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
