export type Situation = {
  id: string;
  down: number;
  requiredYards: number;
  ballSpotYard: number;
  description: string;
};

const SITUATIONS: Situation[] = [
  {
    id: 'first-and-10',
    down: 1,
    requiredYards: 10,
    ballSpotYard: 35,
    description: 'Standard down-and-distance from your own 35.'
  },
  {
    id: 'third-and-6',
    down: 3,
    requiredYards: 6,
    ballSpotYard: 45,
    description: 'Need six yards and a clear window to convert.'
  },
  {
    id: 'red-zone',
    down: 2,
    requiredYards: 8,
    ballSpotYard: 88,
    description: 'Compressed spacing inside the red zone.'
  }
];

export const DEFAULT_SITUATION: Situation = SITUATIONS[0];

export const randomSituation = (previousId?: string): Situation => {
  const pool = previousId ? SITUATIONS.filter((s) => s.id !== previousId) : SITUATIONS;
  return pool[Math.floor(Math.random() * pool.length)];
};

export const formatDownLabel = (down: number): string => {
  if (down % 100 >= 11 && down % 100 <= 13) return `${down}th`;
  const suffix = down % 10 === 1 ? 'st' : down % 10 === 2 ? 'nd' : down % 10 === 3 ? 'rd' : 'th';
  return `${down}${suffix}`;
};

export const getDownAndDistanceLabel = (situation: Situation): string =>
  `${formatDownLabel(situation.down)} & ${situation.requiredYards}`;
