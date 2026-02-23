# Whiteboard (Slytwork.com MVP)

Whiteboard is a shared-device, pass-and-play football strategy game. Two players use one device: offense draws first, passes the device, defense responds, then both plans reveal simultaneously.

## Tech

- Next.js App Router
- TypeScript
- Tailwind CSS
- SVG field + piece rendering
- Fully client-side (no backend, auth, DB, or networking)

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Gameplay loop

1. **Offense design**: align offense, select assignment, draw snapped movement path.
2. **Pass device** overlay appears.
3. **Defense design**: align defense, assign, draw paths.
4. **Lock + reveal**: all pieces animate simultaneously.
5. **Evaluation**: separation is measured at movement end.
6. **5-second discussion** screen.
7. Next round begins with a new random situation.

Offense stays on offense for the full match.
First to 3 round wins takes the match.

## Situations

The engine rotates these scenarios:

- 1st & 10
- 3rd & 6
- Red Zone

Each situation sets:

- Required yards
- Ball spot yard line
- A textual description

## Snapping model

- Coordinate system is in **yards**.
- `1 yard = fixed pixel unit` (`YARD_TO_PX` in `coordinateSystem.ts`).
- Player drag and path points snap to integer yard coordinates.
- Paths are saved as ordered arrays of snapped yard points.

## Separation model

At reveal completion:

- Offensive eligibles: WR/TE/RB.
- For each eligible, find nearest defender distance.
- If nearest defender is **more than 2 yards**, the eligible is **OPEN**.
- A round is offensive success if any eligible is both:
  - Open, and
  - Finished at/after required yardage from line of scrimmage.

## Man coverage attachment

If a defender is assigned **Man**:

- User picks an offensive target.
- During animation, defender does not run its own path.
- Defender mirrors the target’s movement path with a slight trailing offset.
- Zone/Blitz/Contain follow their own snapped paths.

## Project structure

```text
src/
  app/
    layout.tsx
    page.tsx
    globals.css
  components/
    AssignmentPanel.tsx
    Field.tsx
    PlayerPiece.tsx
    RevealOverlay.tsx
    Scoreboard.tsx
  lib/
    coordinateSystem.ts
    movementEngine.ts
    separationEngine.ts
    situationEngine.ts
    snapping.ts
```
