import {
  clampFieldPoint,
  PLAYABLE_START_YARD,
  Point,
} from '@/lib/coordinateSystem';
import { Player } from '@/lib/movementEngine';
import { Situation } from '@/lib/situationEngine';

const toDisplayYards = (yards: number) => Math.max(1, Math.round(yards));

export const enforceSingleRunCarrier = (players: Player[]): Player[] => {
  const runCarrier = players.find(
    (player) => player.team === 'offense' && player.assignment === 'run'
  );
  if (!runCarrier) return players;

  return players.map((player) => {
    if (player.team !== 'offense' || player.id === runCarrier.id) return player;
    return {
      ...player,
      assignment: 'block',
      path: player.assignment === 'block' ? player.path : [],
      manTargetId: undefined,
    };
  });
};

export const clampToLineOfScrimmageSide = (
  player: Player,
  point: Point,
  lineOfScrimmageYard: number
): Point =>
  clampFieldPoint({
    x: point.x,
    y:
      player.team === 'offense'
        ? Math.max(point.y, lineOfScrimmageYard)
        : Math.min(point.y, lineOfScrimmageYard),
  });

export const projectFormationToSituation = (
  players: Player[],
  fromLosYard: number,
  toLosYard: number
): Player[] =>
  players.map((player) => {
    const translated = clampFieldPoint({
      x: player.position.x,
      y: toLosYard + (player.position.y - fromLosYard),
    });
    return {
      ...player,
      position: clampToLineOfScrimmageSide(player, translated, toLosYard),
      assignment: 'none',
      path: [],
      manTargetId: undefined,
    };
  });

export const translatePointToLine = (
  point: Point,
  fromLosYard: number,
  toLosYard: number
): Point =>
  clampFieldPoint({
    x: point.x,
    y: toLosYard + (point.y - fromLosYard),
  });

export const getPreSnapPenalty = (
  players: Player[],
  lineOfScrimmageYard: number
):
  | { label: 'False start' | 'Offsides'; team: 'offense' | 'defense' }
  | undefined => {
  const offensePastLine = players.some(
    (player) =>
      player.team === 'offense' && player.position.y < lineOfScrimmageYard
  );
  if (offensePastLine) {
    return { label: 'False start', team: 'offense' };
  }

  const defensePastLine = players.some(
    (player) =>
      player.team === 'defense' && player.position.y > lineOfScrimmageYard
  );
  if (defensePastLine) {
    return { label: 'Offsides', team: 'defense' };
  }

  return undefined;
};

export const buildNextSituationAfterGain = (
  current: Situation,
  gainedYards: number
): Situation => {
  const positiveGain = Math.max(0, gainedYards);
  const nextBallSpot = Math.max(
    PLAYABLE_START_YARD,
    current.ballSpotYard - positiveGain
  );
  const yardsToGoal = Math.max(1, Math.ceil(nextBallSpot - PLAYABLE_START_YARD));
  const nextRequired = current.requiredYards - positiveGain;

  if (nextRequired <= 0) {
    const resetDistance = Math.min(10, yardsToGoal);
    return {
      ...current,
      down: 1,
      requiredYards: resetDistance,
      ballSpotYard: nextBallSpot,
    };
  }

  return {
    ...current,
    down: Math.min(current.down + 1, 4),
    requiredYards: toDisplayYards(nextRequired),
    ballSpotYard: nextBallSpot,
  };
};

export const createRoster = (situation: Situation): Player[] => {
  const los = situation.ballSpotYard;

  const qb: Player = {
    id: 'qb',
    label: 'QB',
    team: 'offense',
    role: 'QB',
    position: { x: 26, y: los + 4 },
    assignment: 'none',
    path: [],
  };
  const rb: Player = {
    id: 'rb',
    label: 'RB',
    team: 'offense',
    role: 'RB',
    position: { x: 29, y: los + 6 },
    assignment: 'none',
    path: [],
  };
  const lt: Player = {
    id: 'lt',
    label: 'LT',
    team: 'offense',
    role: 'LT',
    position: { x: 22, y: los + 1 },
    assignment: 'none',
    path: [],
  };
  const lg: Player = {
    id: 'lg',
    label: 'LG',
    team: 'offense',
    role: 'LG',
    position: { x: 24, y: los + 1 },
    assignment: 'none',
    path: [],
  };
  const c: Player = {
    id: 'c',
    label: 'C',
    team: 'offense',
    role: 'C',
    position: { x: 26, y: los + 1 },
    assignment: 'none',
    path: [],
  };
  const rg: Player = {
    id: 'rg',
    label: 'RG',
    team: 'offense',
    role: 'RG',
    position: { x: 28, y: los + 1 },
    assignment: 'none',
    path: [],
  };
  const rt: Player = {
    id: 'rt',
    label: 'RT',
    team: 'offense',
    role: 'RT',
    position: { x: 30, y: los + 1 },
    assignment: 'none',
    path: [],
  };
  const wr1: Player = {
    id: 'wr1',
    label: 'X',
    team: 'offense',
    role: 'WR',
    position: { x: 8, y: los + 2 },
    assignment: 'none',
    path: [],
  };
  const wr2: Player = {
    id: 'wr2',
    label: 'Z',
    team: 'offense',
    role: 'WR',
    position: { x: 44, y: los + 2 },
    assignment: 'none',
    path: [],
  };
  const wr3: Player = {
    id: 'wr3',
    label: 'H',
    team: 'offense',
    role: 'WR',
    position: { x: 16, y: los + 2 },
    assignment: 'none',
    path: [],
  };
  const te: Player = {
    id: 'te',
    label: 'Y',
    team: 'offense',
    role: 'TE',
    position: { x: 36, y: los + 1 },
    assignment: 'none',
    path: [],
  };

  const dl1: Player = {
    id: 'dl1',
    label: 'DE',
    team: 'defense',
    role: 'DL',
    position: { x: 20, y: los - 1 },
    assignment: 'none',
    path: [],
  };
  const dl2: Player = {
    id: 'dl2',
    label: 'DT1',
    team: 'defense',
    role: 'DL',
    position: { x: 24, y: los - 1 },
    assignment: 'none',
    path: [],
  };
  const dl3: Player = {
    id: 'dl3',
    label: 'DT2',
    team: 'defense',
    role: 'DL',
    position: { x: 28, y: los - 1 },
    assignment: 'none',
    path: [],
  };
  const dl4: Player = {
    id: 'dl4',
    label: 'DE2',
    team: 'defense',
    role: 'DL',
    position: { x: 32, y: los - 1 },
    assignment: 'none',
    path: [],
  };
  const lb1: Player = {
    id: 'lb1',
    label: 'LB1',
    team: 'defense',
    role: 'LB',
    position: { x: 20, y: los - 4 },
    assignment: 'none',
    path: [],
  };
  const lb2: Player = {
    id: 'lb2',
    label: 'LB2',
    team: 'defense',
    role: 'LB',
    position: { x: 26, y: los - 4 },
    assignment: 'none',
    path: [],
  };
  const lb3: Player = {
    id: 'lb3',
    label: 'LB3',
    team: 'defense',
    role: 'LB',
    position: { x: 32, y: los - 4 },
    assignment: 'none',
    path: [],
  };
  const db1: Player = {
    id: 'db1',
    label: 'CB1',
    team: 'defense',
    role: 'DB',
    position: { x: 8, y: los - 7 },
    assignment: 'none',
    path: [],
  };
  const db2: Player = {
    id: 'db2',
    label: 'S1',
    team: 'defense',
    role: 'DB',
    position: { x: 20, y: los - 7 },
    assignment: 'none',
    path: [],
  };
  const db3: Player = {
    id: 'db3',
    label: 'S2',
    team: 'defense',
    role: 'DB',
    position: { x: 32, y: los - 7 },
    assignment: 'none',
    path: [],
  };
  const db4: Player = {
    id: 'db4',
    label: 'CB2',
    team: 'defense',
    role: 'DB',
    position: { x: 44, y: los - 7 },
    assignment: 'none',
    path: [],
  };

  return [
    qb,
    rb,
    lt,
    lg,
    c,
    rg,
    rt,
    wr1,
    wr2,
    wr3,
    te,
    dl1,
    dl2,
    dl3,
    dl4,
    lb1,
    lb2,
    lb3,
    db1,
    db2,
    db3,
    db4,
  ];
};
