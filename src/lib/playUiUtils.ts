import { AssignmentType, Player } from '@/lib/movementEngine';

export const toDisplayYards = (yards: number) => Math.max(1, Math.round(yards));

export const isPathlessAssignment = (assignment: AssignmentType) =>
  assignment === 'man' || assignment === 'blitz';

export const isPassEligibleReceiver = (
  player: Player,
  eligibleRoles: Set<string>
): boolean =>
  player.team === 'offense' &&
  eligibleRoles.has(player.role) &&
  player.assignment !== 'block';
