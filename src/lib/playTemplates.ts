import { clampFieldPoint, Point } from "@/lib/coordinateSystem";
import { AssignmentType, Player, Team } from "@/lib/movementEngine";

type TemplatePlayerUpdate = {
  assignment: AssignmentType;
  path: Point[];
  manTargetId?: string;
};

export type PlayTemplate = {
  id: string;
  team: Team;
  label: string;
  description: string;
  buildAssignments: (players: Player[], losYard: number) => Record<string, TemplatePlayerUpdate>;
};

const byId = (players: Player[]) => Object.fromEntries(players.map((player) => [player.id, player]));

const from = (player: Player | undefined, dx: number, dy: number): Point =>
  clampFieldPoint({
    x: (player?.position.x ?? 0) + dx,
    y: (player?.position.y ?? 0) + dy,
  });

const offenseTemplates: PlayTemplate[] = [
  {
    id: "quick-slants",
    team: "offense",
    label: "Quick Slants",
    description: "Fast inside-breaking routes with six-man protection.",
    buildAssignments: (players) => {
      const p = byId(players);
      return {
        qb: { assignment: "none", path: [] },
        rb: { assignment: "block", path: [from(p.rb, 0, -1.4)] },
        lt: { assignment: "block", path: [from(p.lt, -0.8, -1.2)] },
        lg: { assignment: "block", path: [from(p.lg, -0.5, -1.2)] },
        c: { assignment: "block", path: [from(p.c, 0, -1.2)] },
        rg: { assignment: "block", path: [from(p.rg, 0.5, -1.2)] },
        rt: { assignment: "block", path: [from(p.rt, 0.8, -1.2)] },
        wr1: { assignment: "pass-route", path: [from(p.wr1, 3.5, -5.5)] },
        wr2: { assignment: "pass-route", path: [from(p.wr2, -3.5, -5.5)] },
        wr3: { assignment: "pass-route", path: [from(p.wr3, 2.8, -4.8)] },
        te: { assignment: "pass-route", path: [from(p.te, -2.5, -5)] },
      };
    },
  },
  {
    id: "inside-zone",
    team: "offense",
    label: "Inside Zone",
    description: "Core run concept with downhill RB path and line drive blocks.",
    buildAssignments: (players) => {
      const p = byId(players);
      return {
        qb: { assignment: "none", path: [] },
        rb: { assignment: "run", path: [from(p.rb, -0.6, -3.2), from(p.rb, -0.5, -7.2)] },
        lt: { assignment: "block", path: [from(p.lt, -0.4, -1.2)] },
        lg: { assignment: "block", path: [from(p.lg, -0.2, -1.4)] },
        c: { assignment: "block", path: [from(p.c, 0, -1.4)] },
        rg: { assignment: "block", path: [from(p.rg, 0.2, -1.4)] },
        rt: { assignment: "block", path: [from(p.rt, 0.4, -1.2)] },
        wr1: { assignment: "pass-route", path: [from(p.wr1, 0.6, -5.5)] },
        wr2: { assignment: "pass-route", path: [from(p.wr2, -0.6, -5.5)] },
        wr3: { assignment: "block", path: [from(p.wr3, 2.2, -1)] },
        te: { assignment: "block", path: [from(p.te, 1.2, -1.2)] },
      };
    },
  },
];

const defenseTemplates: PlayTemplate[] = [
  {
    id: "cover-3",
    team: "defense",
    label: "Cover 3",
    description: "3 deep zones, 4 underneath zones, 4-man rush.",
    buildAssignments: (players) => {
      const p = byId(players);
      return {
        dl1: { assignment: "blitz", path: [from(p.dl1, 0.8, 3)] },
        dl2: { assignment: "blitz", path: [from(p.dl2, 0.3, 3)] },
        dl3: { assignment: "blitz", path: [from(p.dl3, -0.3, 3)] },
        dl4: { assignment: "blitz", path: [from(p.dl4, -0.8, 3)] },
        lb1: { assignment: "zone", path: [from(p.lb1, -5.5, 2.4)] },
        lb2: { assignment: "zone", path: [from(p.lb2, 0, 2.6)] },
        lb3: { assignment: "zone", path: [from(p.lb3, 5.5, 2.4)] },
        db1: { assignment: "zone", path: [from(p.db1, 0, -12)] },
        db2: {
          assignment: "zone",
          path: [
            clampFieldPoint({
              x: 26.65,
              y: (p.db2?.position.y ?? 0) - 11,
            }),
          ],
        },
        db3: { assignment: "zone", path: [from(p.db3, 0, 2.2)] },
        db4: { assignment: "zone", path: [from(p.db4, 0, -12)] },
      };
    },
  },
  {
    id: "cover-1-blitz",
    team: "defense",
    label: "Cover 1 Blitz",
    description: "Single-high man coverage with extra pressure.",
    buildAssignments: (players) => {
      const p = byId(players);
      return {
        dl1: { assignment: "blitz", path: [from(p.dl1, 0.6, 3)] },
        dl2: { assignment: "blitz", path: [from(p.dl2, 0.2, 3)] },
        dl3: { assignment: "blitz", path: [from(p.dl3, -0.2, 3)] },
        dl4: { assignment: "blitz", path: [from(p.dl4, -0.6, 3)] },
        lb1: { assignment: "blitz", path: [from(p.lb1, 1.2, 3.4)] },
        lb2: { assignment: "man", path: [], manTargetId: "te" },
        lb3: { assignment: "man", path: [], manTargetId: "rb" },
        db1: { assignment: "man", path: [], manTargetId: "wr1" },
        db2: { assignment: "zone", path: [from(p.db2, 0, -10)] },
        db3: { assignment: "man", path: [], manTargetId: "wr3" },
        db4: { assignment: "man", path: [], manTargetId: "wr2" },
      };
    },
  },
];

export const PLAY_TEMPLATES: PlayTemplate[] = [...offenseTemplates, ...defenseTemplates];

export const getPlayTemplatesForTeam = (team: Team): PlayTemplate[] =>
  PLAY_TEMPLATES.filter((template) => template.team === team);

export const applyPlayTemplate = (players: Player[], team: Team, templateId: string, losYard: number): Player[] => {
  const template = PLAY_TEMPLATES.find((candidate) => candidate.id === templateId && candidate.team === team);
  if (!template) return players;
  const assignments = template.buildAssignments(players, losYard);

  return players.map((player) => {
    if (player.team !== team) return player;
    const update = assignments[player.id];
    if (!update) {
      return {
        ...player,
        assignment: "none",
        path: [],
        manTargetId: undefined,
      };
    }

    return {
      ...player,
      assignment: update.assignment,
      path: update.path,
      manTargetId: update.manTargetId,
    };
  });
};
