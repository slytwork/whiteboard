import { clampFieldPoint, Point } from "@/lib/coordinateSystem";
import { AssignmentType, Player, Team } from "@/lib/movementEngine";

type TemplatePlayerUpdate = {
  assignment: AssignmentType;
  path: Point[];
  manTargetId?: string;
  preSnapPosition?: Point;
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

const defenseSpot = (losYard: number, x: number, depth: number): Point =>
  clampFieldPoint({
    x,
    y: losYard - depth,
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
  {
    id: "all-hitches",
    team: "offense",
    label: "All Hitches",
    description: "Outside and slot receivers settle on quick hitches with six-man protection.",
    buildAssignments: (players) => {
      const p = byId(players);
      return {
        qb: { assignment: "none", path: [] },
        rb: { assignment: "block", path: [from(p.rb, 0.2, -1.4)] },
        lt: { assignment: "block", path: [from(p.lt, -0.8, -1.2)] },
        lg: { assignment: "block", path: [from(p.lg, -0.5, -1.2)] },
        c: { assignment: "block", path: [from(p.c, 0, -1.2)] },
        rg: { assignment: "block", path: [from(p.rg, 0.5, -1.2)] },
        rt: { assignment: "block", path: [from(p.rt, 0.8, -1.2)] },
        wr1: { assignment: "pass-route", path: [from(p.wr1, 0, -6)] },
        wr2: { assignment: "pass-route", path: [from(p.wr2, 0, -6)] },
        wr3: { assignment: "pass-route", path: [from(p.wr3, 0, -5.5)] },
        te: { assignment: "pass-route", path: [from(p.te, 0, -5)] },
      };
    },
  },
  {
    id: "stick",
    team: "offense",
    label: "Stick",
    description: "Y-stick concept with flat release and quick spacing underneath.",
    buildAssignments: (players) => {
      const p = byId(players);
      return {
        qb: { assignment: "none", path: [] },
        rb: {
          assignment: "pass-route",
          path: [from(p.rb, 2.6, -1.6), from(p.rb, 4.4, -2)],
        },
        lt: { assignment: "block", path: [from(p.lt, -0.8, -1.2)] },
        lg: { assignment: "block", path: [from(p.lg, -0.5, -1.2)] },
        c: { assignment: "block", path: [from(p.c, 0, -1.2)] },
        rg: { assignment: "block", path: [from(p.rg, 0.5, -1.2)] },
        rt: { assignment: "block", path: [from(p.rt, 0.8, -1.2)] },
        wr1: { assignment: "pass-route", path: [from(p.wr1, 0, -8)] },
        wr2: { assignment: "pass-route", path: [from(p.wr2, 0, -8)] },
        wr3: { assignment: "pass-route", path: [from(p.wr3, 0, -5)] },
        te: {
          assignment: "pass-route",
          path: [from(p.te, -1.1, -4.8), from(p.te, -1, -6.2)],
        },
      };
    },
  },
  {
    id: "snag",
    team: "offense",
    label: "Snag",
    description: "Triangle spacing with corner route, snag settle, and quick flat.",
    buildAssignments: (players) => {
      const p = byId(players);
      return {
        qb: { assignment: "none", path: [] },
        rb: {
          assignment: "pass-route",
          path: [from(p.rb, 2.8, -1.4), from(p.rb, 4.8, -2)],
        },
        lt: { assignment: "block", path: [from(p.lt, -0.8, -1.2)] },
        lg: { assignment: "block", path: [from(p.lg, -0.5, -1.2)] },
        c: { assignment: "block", path: [from(p.c, 0, -1.2)] },
        rg: { assignment: "block", path: [from(p.rg, 0.5, -1.2)] },
        rt: { assignment: "block", path: [from(p.rt, 0.8, -1.2)] },
        wr1: { assignment: "pass-route", path: [from(p.wr1, 0, -9)] },
        wr2: {
          assignment: "pass-route",
          path: [from(p.wr2, -4.2, -8.8)],
        },
        wr3: {
          assignment: "pass-route",
          path: [from(p.wr3, 2.2, -4.2), from(p.wr3, 1.8, -4.8)],
        },
        te: { assignment: "pass-route", path: [from(p.te, 0, -4.8)] },
      };
    },
  },
  {
    id: "smash",
    team: "offense",
    label: "Smash",
    description: "Corner-over-hitch concept on both sides with quick underneath control.",
    buildAssignments: (players) => {
      const p = byId(players);
      return {
        qb: { assignment: "none", path: [] },
        rb: { assignment: "block", path: [from(p.rb, 0.4, -1.3)] },
        lt: { assignment: "block", path: [from(p.lt, -0.8, -1.2)] },
        lg: { assignment: "block", path: [from(p.lg, -0.5, -1.2)] },
        c: { assignment: "block", path: [from(p.c, 0, -1.2)] },
        rg: { assignment: "block", path: [from(p.rg, 0.5, -1.2)] },
        rt: { assignment: "block", path: [from(p.rt, 0.8, -1.2)] },
        wr1: {
          assignment: "pass-route",
          path: [from(p.wr1, 4.2, -8.8)],
        },
        wr2: {
          assignment: "pass-route",
          path: [from(p.wr2, -4.2, -8.8)],
        },
        wr3: { assignment: "pass-route", path: [from(p.wr3, 0, -5)] },
        te: { assignment: "pass-route", path: [from(p.te, 0, -5.5)] },
      };
    },
  },
  {
    id: "four-verts",
    team: "offense",
    label: "4 Verts",
    description: "Vertical stretch with four routes attacking deep seams and outside leverage.",
    buildAssignments: (players) => {
      const p = byId(players);
      return {
        qb: { assignment: "none", path: [] },
        rb: { assignment: "block", path: [from(p.rb, 0.2, -1.4)] },
        lt: { assignment: "block", path: [from(p.lt, -0.8, -1.2)] },
        lg: { assignment: "block", path: [from(p.lg, -0.5, -1.2)] },
        c: { assignment: "block", path: [from(p.c, 0, -1.2)] },
        rg: { assignment: "block", path: [from(p.rg, 0.5, -1.2)] },
        rt: { assignment: "block", path: [from(p.rt, 0.8, -1.2)] },
        wr1: { assignment: "pass-route", path: [from(p.wr1, 0.2, -16)] },
        wr2: { assignment: "pass-route", path: [from(p.wr2, -0.2, -16)] },
        wr3: { assignment: "pass-route", path: [from(p.wr3, 0, -14)] },
        te: { assignment: "pass-route", path: [from(p.te, 0, -14)] },
      };
    },
  },
  {
    id: "y-cross",
    team: "offense",
    label: "Y-Cross",
    description: "Primary Y crossing route with backside dig and clear-out verticals.",
    buildAssignments: (players) => {
      const p = byId(players);
      return {
        qb: { assignment: "none", path: [] },
        rb: {
          assignment: "pass-route",
          path: [from(p.rb, -2.6, -1.3), from(p.rb, -4.4, -2)],
        },
        lt: { assignment: "block", path: [from(p.lt, -0.8, -1.2)] },
        lg: { assignment: "block", path: [from(p.lg, -0.5, -1.2)] },
        c: { assignment: "block", path: [from(p.c, 0, -1.2)] },
        rg: { assignment: "block", path: [from(p.rg, 0.5, -1.2)] },
        rt: { assignment: "block", path: [from(p.rt, 0.8, -1.2)] },
        wr1: { assignment: "pass-route", path: [from(p.wr1, 0, -14)] },
        wr2: { assignment: "pass-route", path: [from(p.wr2, 0, -14)] },
        wr3: {
          assignment: "pass-route",
          path: [from(p.wr3, 4.8, -8.2)],
        },
        te: {
          assignment: "pass-route",
          path: [from(p.te, -9.5, -9), from(p.te, -15, -9.4)],
        },
      };
    },
  },
  {
    id: "mesh",
    team: "offense",
    label: "Mesh",
    description: "Shallow crossing mesh with a sit route and a backside vertical.",
    buildAssignments: (players) => {
      const p = byId(players);
      return {
        qb: { assignment: "none", path: [] },
        rb: {
          assignment: "pass-route",
          path: [from(p.rb, 2.3, -1.4), from(p.rb, 4.2, -2)],
        },
        lt: { assignment: "block", path: [from(p.lt, -0.8, -1.2)] },
        lg: { assignment: "block", path: [from(p.lg, -0.5, -1.2)] },
        c: { assignment: "block", path: [from(p.c, 0, -1.2)] },
        rg: { assignment: "block", path: [from(p.rg, 0.5, -1.2)] },
        rt: { assignment: "block", path: [from(p.rt, 0.8, -1.2)] },
        wr1: { assignment: "pass-route", path: [from(p.wr1, 0, -14)] },
        wr2: {
          assignment: "pass-route",
          path: [from(p.wr2, -10.5, -3.8), from(p.wr2, -16, -4)],
        },
        wr3: {
          assignment: "pass-route",
          path: [from(p.wr3, 9.8, -3.8), from(p.wr3, 15.5, -4)],
        },
        te: { assignment: "pass-route", path: [from(p.te, -1.8, -5.2)] },
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
        db1: { assignment: "zone", path: [from(p.db1, 0, -9)] },
        db2: {
          assignment: "zone",
          path: [
            clampFieldPoint({
              x: 26.65,
              y: (p.db2?.position.y ?? 0) - 9,
            }),
          ],
        },
        db3: { assignment: "zone", path: [from(p.db3, 0, 2.2)] },
        db4: { assignment: "zone", path: [from(p.db4, 0, -9)] },
      };
    },
  },
  {
    id: "cover-0",
    team: "defense",
    label: "Cover 0",
    description: "Zero-high man pressure with six rushers and tight press alignment.",
    buildAssignments: (_players, losYard) => ({
      dl1: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 21, -2.6)],
        preSnapPosition: defenseSpot(losYard, 20.5, 1),
      },
      dl2: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 24.5, -2.8)],
        preSnapPosition: defenseSpot(losYard, 24, 1),
      },
      dl3: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 27.5, -2.8)],
        preSnapPosition: defenseSpot(losYard, 28, 1),
      },
      dl4: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 31.5, -2.6)],
        preSnapPosition: defenseSpot(losYard, 31.5, 1),
      },
      lb1: {
        assignment: "man",
        path: [],
        manTargetId: "rb",
        preSnapPosition: defenseSpot(losYard, 29, 2.4),
      },
      lb2: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 26.2, -3.8)],
        preSnapPosition: defenseSpot(losYard, 26, 2),
      },
      lb3: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 23.8, -3.6)],
        preSnapPosition: defenseSpot(losYard, 23.8, 2.2),
      },
      db1: {
        assignment: "man",
        path: [],
        manTargetId: "wr1",
        preSnapPosition: defenseSpot(losYard, 8, 1.8),
      },
      db2: {
        assignment: "man",
        path: [],
        manTargetId: "te",
        preSnapPosition: defenseSpot(losYard, 34.5, 2),
      },
      db3: {
        assignment: "man",
        path: [],
        manTargetId: "wr3",
        preSnapPosition: defenseSpot(losYard, 16, 2),
      },
      db4: {
        assignment: "man",
        path: [],
        manTargetId: "wr2",
        preSnapPosition: defenseSpot(losYard, 44, 1.8),
      },
    }),
  },
  {
    id: "cover-1",
    team: "defense",
    label: "Cover 1",
    description: "Single-high safety with man coverage underneath and a 4-man rush.",
    buildAssignments: (_players, losYard) => ({
      dl1: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 21, -2.6)],
        preSnapPosition: defenseSpot(losYard, 20, 1),
      },
      dl2: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 24.5, -2.8)],
        preSnapPosition: defenseSpot(losYard, 24, 1),
      },
      dl3: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 27.5, -2.8)],
        preSnapPosition: defenseSpot(losYard, 28, 1),
      },
      dl4: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 31, -2.6)],
        preSnapPosition: defenseSpot(losYard, 32, 1),
      },
      lb1: {
        assignment: "man",
        path: [],
        manTargetId: "te",
        preSnapPosition: defenseSpot(losYard, 34, 3),
      },
      lb2: {
        assignment: "zone",
        path: [defenseSpot(losYard, 26, 6.5)],
        preSnapPosition: defenseSpot(losYard, 26, 3.5),
      },
      lb3: {
        assignment: "man",
        path: [],
        manTargetId: "rb",
        preSnapPosition: defenseSpot(losYard, 29, 3.2),
      },
      db1: {
        assignment: "man",
        path: [],
        manTargetId: "wr1",
        preSnapPosition: defenseSpot(losYard, 8, 3),
      },
      db2: {
        assignment: "zone",
        path: [defenseSpot(losYard, 26.65, 14)],
        preSnapPosition: defenseSpot(losYard, 26.65, 9),
      },
      db3: {
        assignment: "man",
        path: [],
        manTargetId: "wr3",
        preSnapPosition: defenseSpot(losYard, 16, 3.2),
      },
      db4: {
        assignment: "man",
        path: [],
        manTargetId: "wr2",
        preSnapPosition: defenseSpot(losYard, 44, 3),
      },
    }),
  },
  {
    id: "cover-2",
    team: "defense",
    label: "Cover 2",
    description: "Two-high shell with corners in the flats and five underneath zones.",
    buildAssignments: (_players, losYard) => ({
      dl1: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 20.8, -2.6)],
        preSnapPosition: defenseSpot(losYard, 20, 1),
      },
      dl2: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 24.2, -2.8)],
        preSnapPosition: defenseSpot(losYard, 24, 1),
      },
      dl3: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 27.8, -2.8)],
        preSnapPosition: defenseSpot(losYard, 28, 1),
      },
      dl4: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 31.2, -2.6)],
        preSnapPosition: defenseSpot(losYard, 32, 1),
      },
      lb1: {
        assignment: "zone",
        path: [defenseSpot(losYard, 20.5, 7)],
        preSnapPosition: defenseSpot(losYard, 20, 4),
      },
      lb2: {
        assignment: "zone",
        path: [defenseSpot(losYard, 26.5, 7.2)],
        preSnapPosition: defenseSpot(losYard, 26, 4),
      },
      lb3: {
        assignment: "zone",
        path: [defenseSpot(losYard, 32.5, 7)],
        preSnapPosition: defenseSpot(losYard, 32, 4),
      },
      db1: {
        assignment: "zone",
        path: [defenseSpot(losYard, 12.5, 3.5)],
        preSnapPosition: defenseSpot(losYard, 8.5, 4),
      },
      db2: {
        assignment: "zone",
        path: [defenseSpot(losYard, 19.5, 14)],
        preSnapPosition: defenseSpot(losYard, 19.5, 10),
      },
      db3: {
        assignment: "zone",
        path: [defenseSpot(losYard, 33.8, 14)],
        preSnapPosition: defenseSpot(losYard, 33.8, 10),
      },
      db4: {
        assignment: "zone",
        path: [defenseSpot(losYard, 40.8, 3.5)],
        preSnapPosition: defenseSpot(losYard, 44, 4),
      },
    }),
  },
  {
    id: "cover-4",
    team: "defense",
    label: "Cover 4",
    description: "Quarters shell with four deep defenders and underneath hook/curl support.",
    buildAssignments: (_players, losYard) => ({
      dl1: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 20.8, -2.6)],
        preSnapPosition: defenseSpot(losYard, 20, 1),
      },
      dl2: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 24.2, -2.8)],
        preSnapPosition: defenseSpot(losYard, 24, 1),
      },
      dl3: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 27.8, -2.8)],
        preSnapPosition: defenseSpot(losYard, 28, 1),
      },
      dl4: {
        assignment: "blitz",
        path: [defenseSpot(losYard, 31.2, -2.6)],
        preSnapPosition: defenseSpot(losYard, 32, 1),
      },
      lb1: {
        assignment: "zone",
        path: [defenseSpot(losYard, 20.5, 6.8)],
        preSnapPosition: defenseSpot(losYard, 20, 4),
      },
      lb2: {
        assignment: "zone",
        path: [defenseSpot(losYard, 26.5, 7)],
        preSnapPosition: defenseSpot(losYard, 26, 4),
      },
      lb3: {
        assignment: "zone",
        path: [defenseSpot(losYard, 32.5, 6.8)],
        preSnapPosition: defenseSpot(losYard, 32, 4),
      },
      db1: {
        assignment: "zone",
        path: [defenseSpot(losYard, 10.5, 13.5)],
        preSnapPosition: defenseSpot(losYard, 8.5, 8),
      },
      db2: {
        assignment: "zone",
        path: [defenseSpot(losYard, 21, 14)],
        preSnapPosition: defenseSpot(losYard, 20.5, 8.5),
      },
      db3: {
        assignment: "zone",
        path: [defenseSpot(losYard, 32, 14)],
        preSnapPosition: defenseSpot(losYard, 31.5, 8.5),
      },
      db4: {
        assignment: "zone",
        path: [defenseSpot(losYard, 42.8, 13.5)],
        preSnapPosition: defenseSpot(losYard, 44, 8),
      },
    }),
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
        db2: {
          assignment: "zone",
          path: [
            clampFieldPoint({
              x: 26.65,
              y: (p.db2?.position.y ?? 0) - 8,
            }),
          ],
        },
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
      position: update.preSnapPosition ?? player.position,
      assignment: update.assignment,
      path: update.path,
      manTargetId: update.manTargetId,
    };
  });
};
