export type Situation = {
  id: string;
  label: string;
  requiredYards: number;
  ballSpotYard: number;
  description: string;
};

const SITUATIONS: Situation[] = [
  {
    id: 'first-and-10',
    label: '1st & 10',
    requiredYards: 10,
    ballSpotYard: 35,
    description: 'Standard down-and-distance from your own 35.'
  },
  {
    id: 'third-and-6',
    label: '3rd & 6',
    requiredYards: 6,
    ballSpotYard: 45,
    description: 'Need six yards and a clear window to convert.'
  },
  {
    id: 'red-zone',
    label: 'Red Zone',
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
