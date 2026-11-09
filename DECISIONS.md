# Decisions and assumptions

Written as I go. Each entry says what was assumed and why, so it can be
challenged.

## Process

- **Go-ahead for Phase 1.** I proposed the Phase 1 file plan and asked two
  questions. The reply was the floorplan, brochure and photos. I read that
  as approval of the plan and went ahead.
- **Two dev-only libraries beyond §1, pending your OK:** `vitest` for unit
  tests and `@playwright/test` for the smoke tests (§8 requires both).
  Playwright is pinned to 1.63.0 to match the browser already installed.
  Neither ships to the browser. If you'd rather not have them, say so and
  I'll find another way to run the tests.

## Seed project (18B Balmore Street)

- **Scale.** The agent's plan is 12.18 mm per image pixel. Wall positions
  measured off the image at that scale reproduce every printed room size
  to within about 1%, so I used it for anything the plan doesn't label.
- **Plan coordinates.** (0, 0) is the inside corner of the rear wall and the
  left party wall. x runs across the building, y runs from the rear (garden)
  to the front (street). The bathroom outrigger is at negative y.
- **Wall thicknesses.** Brief defaults: front and rear 330 mm (solid brick),
  party walls 230 mm, internal walls 100 mm. Bay walls are 200 mm because
  they are mostly glass. Inside faces are placed from the printed room
  sizes; thickness only moves the outside faces. All are marked estimated.
- **Room sizes used.** Kitchen 2.81 m wide × 3.32 m deep, reception 4.52 m ×
  3.48 m plus a 0.51 m bay (3.99 m total, as printed), bathroom 2.25 × 2.18 m,
  bedroom 2 2.81 × 3.35 m, bedroom 1 4.52 × 3.45 m (printed 3.42 m). The two
  floors' partitions are 30 mm apart (3.37 m and 3.40 m from the rear wall)
  so that both printed sizes hold. Correct this on site.
- **The wall to open.** The kitchen/reception partition is `loadBearing`
  (provisional, per the brief). The image shows it lines up with the
  bedrooms' partition above. Everything else is `unknown`, including the
  bedrooms' partition.
- **Chimney breasts** are 320 mm deep (measured off the plan). Each is drawn as
  three thin walls against the party wall. Any closed loop smaller than
  0.4 m² is drawn as solid masonry, not as a room, so breasts come out solid
  and their depth stays editable.
- **First-floor hall.** The rear of the stair/hall strip is open, because the
  stair rises to the half-landing there, so the hall is not a closed room.
  The kitchen's rear wall is one 330 mm wall up to the kitchen's side wall.
  The plan shows it thinning at the stair; that detail is left out.
- **Ground floor.** The flat's ground floor is the narrow entrance hall and
  stair off the communal hallway. It is placed under the right-hand side of
  the building, in line with the stair strip above.
- **Half-landing** (its own level, per the brief): bathroom, cupboard and the
  door to the garden stairs (from the brochure: "a door to stairs down to a
  shared rear garden").
- **Second floor.** The cupboard opening into bedroom 1 sits under the loft
  stair. The landing closes off as a room ("Landing").
- **Heights (all estimated).** Floor levels above the front door: ground 0,
  first 2.95 m, half-landing 4.43 m, second 5.90 m, loft 8.80 m. Ceilings:
  2.70 m (ground and first, per brief), 2.40 m (half-landing), 2.60 m
  (second, per brief), 2.20 m (loft).
- **Windows and doors.** Positions are measured off the plan. Sills (0.7 to
  1.1 m) and heights are guesses. All are marked estimated.
- **"Measure me" pins.** One per chimney breast. Radiators where the photos
  show them (reception party wall by the door, kitchen by the table, under
  bedroom 2's window). Also the bay and windows, and the front door. The
  loft gets "Dimensions unknown, measure on site".
- **Stairs** are drawn for orientation only, between the levels the plan
  implies. Positions are rough.
- **Lease covenant (brochure).** Floors must be carpeted except kitchen and
  bathroom, where cork or rubber is allowed. Not used yet; it should feed the
  floor-finish palette (Phase 5) and an advice tip (Phase 4).
- **Underlays.** Each level's underlay is a crop of the plan for that floor,
  stored as a PNG data URL (about 0.1–0.3 MB each), locked, 45% opacity.

## Data model extensions (each also commented in `src/model/types.ts`)

- `Level.markers` holds the "measure me" pins. `Level.estimated` marks seed
  heights.
- `Wall.estimated` and `Opening.estimated`: values copied from the agent's
  plan. They show as "≈" until she edits the value or presses "I've
  measured this wall".
- `Stair` convention: `pos` is the centre. `length` runs along local x. The
  arrow points to local +x before `rotationDeg`, which is clockwise on
  screen.

## Geometry

- **Walls are centrelines.** Joints are mitred by intersecting neighbouring
  faces in angle order at each corner. Junctions of 3+ walls get a filler
  polygon so there are no gaps.
- **Rooms** are traced as faces of the wall graph. Free-ended walls are
  ignored. Area is measured on inside faces. Room names follow the loop
  that shares most of their corners, so moving or splitting walls keeps
  "Kitchen" called Kitchen. Removing a wall between two rooms keeps one
  of the two names.
- **Dimension labels** show the length of the face that bounds a room, the
  shorter face if both sides do. Walls hidden behind a chimney breast get
  no label. Typing a length moves the wall's free end, or end b. Walls at
  that end that are square to it move too, so rectangles stay rectangles.
- **Drawing over walls.** A new wall that crosses or touches existing walls
  splits them, so the graph stays planar and rooms are found. A drawing
  chain ends by itself when it reaches an existing corner or wall.
- **Splitting** never cuts through a door or window. The split point moves
  to the opening's nearer edge.

## Interaction

- **Wheel** works like Figma: two-finger scroll pans; pinch or Ctrl/⌘ +
  scroll zooms. A notched mouse wheel zooms.
- **Dragging a wall** slides it square to itself, in 10 mm steps. Alt frees
  it. Dragging a corner snaps to other corners, midpoints and walls, and
  lines up with neighbouring corners. Dropping it on a corner or wall
  joins them.
- **Undo** keeps 200 steps. A whole drag is one step. While drawing, each
  wall segment is its own step.
- **Typed lengths.** A bare number is read in the unit shown. Implausible
  values fall back sensibly: "332" on a metre field means 332 cm, "3320"
  means mm. Thickness fields read bare numbers under 100 as cm.
- The **mode bar** shows all five modes. The ones not built yet are greyed
  out with "Coming in a later phase".
- The **amber structural badge** (Phase 2) shows in Phase 1 only in the wall
  panel, for cased openings. Phase 2 implements it properly.

## Phase 2: openings

- **Which openings get the structural badge.** Every door and window in the
  seed is marked `existing`. The badge appears on a wall that is
  load-bearing or "Don't know" once it has a new opening. Moving an
  existing opening, making it wider or taller, or moving it to another
  wall turns it into a new one. Changing a sill or flipping a door swing
  does not. Outside and party walls count too: they are structural unless
  she marks them "Not load-bearing".
- **Ends and piers.** An opening is measured between the inside faces of the
  walls at each end of its wall, using the mitred outlines. The 100 mm pier
  applies at both wall ends and between neighbouring openings, in any wall
  not confirmed non-load-bearing. "Allow less than 10 cm" is per opening
  (`nibOverride`). The opening then shows a "Narrow pier" warning while a
  pier is under 100 mm.
- **Dragging and drop targets.** Openings snap to 10 mm along the wall (Alt:
  free). A dragged opening moves to another wall only when the pointer is
  right on that wall. Otherwise it stays on its own wall. If the drop
  point has no room, it goes to the nearest free spot on that wall. If
  there is no room anywhere on the wall, it is refused with "No room on
  this wall".
- **Palette uses pointer events, not HTML drag and drop**, so it works with a
  finger or an Apple Pencil. Clicking an item (without dragging) arms it;
  the next click on a wall places it.
- **"Open up this wall"** adds the widest cased opening the wall allows,
  2.10 m high, keeping piers. On the seed, the kitchen/reception wall gives
  2.61 m. The kitchen and reception stay two named rooms either side of
  the opening: rooms come from walls, and an opening doesn't remove the
  wall.
- **Default sizes:** door 80 cm × 2.00 m, window 1.00 × 1.20 m on a 90 cm sill,
  opening 1.20 × 2.10 m, bay window face 1.00 × 1.60 m on a 70 cm sill.
- **Deleting a wall that may be structural** shows a warning toast. The
  delete still happens: undo is always there, and the brief asks for
  warnings, not blocks.
- **Measurements of the selected opening** (width, and the wall left at each
  side) are drawn on the plan and can be clicked to type. While one is
  selected, the other wall labels are hidden to keep it readable.
