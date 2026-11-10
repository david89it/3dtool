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

## Phase 3: furniture

- **Catalogue:** 82 items with typical UK sizes, built only from boxes and
  cylinders. A TV is part of "TV unit with TV". The sofa-to-TV distance is
  a rule (Phase 4), not a clearance strip, because a 2.5 m strip
  swamped the plan.
- **Item frame and states:** `PlacedItem.pos` is the centre of the item in
  its default state, and `dims` is her size in that state. Other states
  scale their catalogue size by the same ratios and keep the back edge
  fixed. All of this lives in `src/catalogue/catalogue.ts`, shared by the
  plan, 3D and rules.
- **Placing:** a new item backs onto the nearest wall face within 60 cm
  (more when zoomed out), turning to face away from it. Things meant to
  stand free (anything with an "all round" clearance: tables, island) are
  not pulled to walls. Wall items (shelves, radiator, towel rail, wall
  cupboards, mirror cabinet) must go on a wall and record `mountedTo`.
  Items don't yet follow a wall when the wall is moved.
- **Moving** keeps an item's turn. If its back is parallel to a wall within
  15 cm (or 20 px) it slides flush along the wall. Alt turns all snapping
  off. Positions round to 10 mm.
- **Resizing:** edge dots appear only for dimensions the catalogue allows,
  within its range. The opposite edge stays put, including when the item
  is folded down. In the panel, width grows from the centre and depth
  grows from the back. Fixed-size items show their sizes as plain text.
- **Turning:** the handle snaps to 90° (Alt: 1°). R turns 90° clockwise,
  Shift+R anticlockwise. Items turn about their centre.
- **Lock:** a locked item can't be dragged, resized or turned. A drag on it
  shows a short note. It can still be selected, duplicated and removed.
- **Clearance colours:** orange strips (darker = minimum, lighter = ideal),
  blue dashed arcs for hinged doors, purple dashed outlines for drawers and
  for folding down or extending. They show for the selected item, or for
  everything when the toggle is on. The toggle is saved with her settings.
- **Custom items:** a single box (wall items sit high on the wall), resizable
  from half to double the given size. Front and side clearances share one
  reason. Removing a custom item from the list also removes it from the
  plan; undo brings both back.
- **Typing sizes:** in size fields, a decimal under 10 means metres ("2.4"),
  a whole number under 100 means centimetres ("45"), anything larger means
  millimetres.
- **Tests on another port:** `PW_PORT=5174 npm run e2e` runs the Playwright
  tests against a dev server on another port, so two checkouts can test
  side by side.

## Phase 4: layout advice

- **Where it shows.** Advice mode lists every problem on the current floor,
  grouped by room, with the worst rooms first. The Advice button shows a
  count coloured by the worst severity. A selected item lists its own
  problems in Furnish mode. Rules re-run on every change, memoised per
  level object, with stable formatter and settings objects.
- **Highlight.** Clicking a problem stores `highlight` (item and wall ids) in
  the store, outlines those in red on the plan in every mode, and zooms to
  them with 1.2 m of context. Changing mode or floor clears it.
- **Fix** runs `fixIssue` (nearest valid position or quarter turn for the
  named items only, never locked ones). It applies the result as one undo
  step. When there is no mechanical fix, a toast says "No simple fix: move
  things by hand".
- **Rule settings** are stored per project in `Project.ruleOverrides`
  (EXTENSION, commented in types.ts), so they travel with saved files and
  are undoable. Lengths are edited like every other length. The two TV
  factors are plain numbers (× screen size).
- **Claude advice** is optional and off by default. The switch and the key
  live in this browser's IndexedDB only (`src/advice/keyStore.ts`); the key
  is never put in the store, the project or any file. The Anthropic SDK
  (`@anthropic-ai/sdk`, the official client; added beyond §1, flagged to
  you) is loaded only when she presses *Ask for advice*. Requests use
  `claude-opus-5-5` with the server-side refusal fallback (`fallbacks:
  "default"`) and medium effort. The answer is rendered from a tiny,
  HTML-escaped Markdown subset (headings, lists, bold, italics); nothing in
  it can inject markup.
- **Engine simplifications** (rules engine, built alongside):
  - Clearance rays stop at windows; only doors and cased openings let them
    through. Otherwise a desk facing a window wall would measure metres of
    clear floor.
  - `loft-headroom` warns when an item's top is within 50 mm of the
    ceiling, because there is no roof-slope model yet.
  - `walkway` checks pairs where one item has the walkway rule, with gaps
    from 300 mm up to the comfortable width. Items under 500 mm tall
    (coffee tables, footstools) are ignored.
  - `bed-side-access` applies to beds at least 1.3 m wide. A side with
    under 150 mm counts as against the wall.
  - `dining-chair-pullback` ignores chairs and stools, skips wall-side
    edges, and reports the tightest side.
  - `sofa-tv-distance` measures centre to centre, for a sofa and a TV
    facing each other. Screen diagonal = screen width ÷ 0.87.
  - Kitchen runs are worktop-height units in line, with gaps of 20 mm or
    less.
  - There is no mechanical fix for `structural-opening`, `loft-headroom`,
    or the kitchen worktop, sink-hob and triangle rules: those need units
    added or reordered, not a nudge.

## Phase 5: 3D and walkthrough

- **Axes.** Plan millimetres become metres. Plan (x, y) maps to world
  (x, z), and up is world y, so a top-down 3D view reads like the plan.
  All floors share the plan's coordinates and sit at their `elevation`.
- **Which floors show.** The overview shows the floor selected in the tabs
  and everything below it; floors above are hidden so she can see in. Walk
  shows every floor.
- **Walls** are side profiles with rectangular holes, extruded (no CSG).
  Each wall is two half-thickness slabs, so each face wears the finish of
  the room on that side. Ends are extended by half the thickest wall
  meeting at an angle, so corners close. Walls running straight through a
  T-junction are not extended. A hole always keeps 20 mm of wall at the
  ends and top (a hole may not touch the outline). Doors and openings keep
  1 mm below them, hidden under the floor.
- **Chimney breast voids** (closed loops under 0.4 m²) are solid masonry to
  ceiling height.
- **Windows** get a glass pane, a frame and a meeting rail. **Doors** get a
  leaf at the same hinge, side and angle as the 2D swing arc. Cased
  openings get nothing.
- **Ceilings** face down, so they are invisible from above (overview) and
  visible from inside (walk).
- **Stairs** are drawn as steps along their footprint, rising linearly from
  their level's floor to the target level's floor. The seed's stairs are
  rough, so some flights overlap where the agent's plan is vague.
- **Merging.** Each floor's geometry is merged into one mesh per material: a
  whole floor is a few dozen draw calls. Materials are shared and created
  once. A floor rebuilds only when that level, the custom catalogue or a
  floor height changes. three.js loads only when she first opens 3D, so
  the plan editor starts fast.
- **Lighting.**
  - One sun with a shadow map (2048², PCF), plus soft sky light. The sky
    light's ground colour is a pale floor tone, not brown, so ceilings stay
    white.
  - Neutral tone mapping keeps the swatch colours true.
  - Ceiling lights: one warm point light per room, at its label point,
    30 cm below the ceiling. Off by default.
- **Sun direction.** Plan "up" (towards the garden) is taken as bearing 330°
  (NNW), from the agent's north arrow. The bay then faces 150° (SSE), as
  the brief says. The sun slider is a compass bearing, defaulting to 200°
  at 35° high.
- **Finishes.**
  - `Room.floorFinish` holds a swatch id. `Room.wallFinish` is a new
    extension.
  - Defaults match the listing photos: pale oak floors, a grey tile
    bathroom floor, white walls, white tile in the bathroom.
  - Swatches are drawn procedurally on canvas, so no image files ship.
  - The lease hint appears when a hard floor is chosen outside the
    kitchen and bathroom, or anything but carpet or cork in them. It is a
    hint, never a block.
  - Rubber isn't in the palette yet.
- **Walk.**
  - Eye height 1.6 m, speed 1.4 m/s, player radius 250 mm. Collisions
    are worked out in 2D on the plan.
  - Doors and cased openings at least 1.8 m tall with no sill let you
    through. Windows don't.
  - Furniture blocks you if it is a floor obstacle (rugs, ceiling lights
    and wall cupboards don't).
  - On a stair footprint you follow its ramp when it is within reach of
    your feet. Otherwise you stand on the highest floor at or below your
    feet + 400 mm. The floor tabs follow you.
- **Controls.**
  - Desktop: click the view to look with the mouse (pointer lock); Esc
    frees it; W A S D or arrow keys walk.
  - Touch (coarse pointer): left thumb joystick, drag on the right to look.
  - Tab toggles plan and 3D. It returns to the 2D mode she came from.
  - All 2D shortcuts are off in 3D, so W walks instead of drawing.
- **Frame rate.** Headless Chromium uses software rendering (SwiftShader).
  It measured about 7–11 fps in the overview there, which says nothing
  about a real laptop GPU. The 60 fps target on a 2022 MacBook Air has not
  been measured yet.

## Phase 6: polish

- **Tour.** It has five cards, each pointing at the real control and switching
  to that mode. It shows on the first visit and is remembered in this
  browser's settings (`tourSeen`). Skip, Esc or finishing all count as seen.
  The last step opens 3D, and "Start planning" returns to Trace. The tour
  never blocks the plan: only the card takes clicks. `?notour` in the
  address skips it, and every browser test uses it.
- **Shortcuts overlay** (`?` key or the top-bar button) lists the keys that
  exist in the code: global, plan, Trace, Furnish and 3D walk.
- **Compare options.** These extensions are commented in `types.ts`:
  `Level.scheme = { group, name }`, where group is the original floor's
  id, and `Project.activeSchemes[group]`. Duplicating deep-copies the floor
  with fresh ids everywhere: nodes, walls, openings, rooms (boundaries
  remapped, so names survive), items (`mountedTo` remapped), stairs and
  pins. The original becomes "Option A".
  - Only the active option of each floor appears in the tabs and in 3D.
    Stairs whose destination is a floor with options lead to the option
    that is on (`activeLevelsResolved`).
  - Choosing an option isn't an undo step. Undoing an edit made on Option
    B switches back to Option B, so you always see what changed.
  - Deleting down to one option makes it a plain floor again.
  - Rules, advice and the Ask Claude call work on the option you are
    looking at.
- **Touch.** In the click-to-place tools (draw walls, set scale, place
  opening, place furniture), a finger tap places and a finger drag pans.
  In the select tools, dragging empty floor already pans. After a pinch,
  the finger left on the screen is ignored, so lifting it doesn't place
  anything. The plan and panels turn off text selection and the iOS
  long-press callout; inputs keep text selection. A pen (Apple Pencil)
  goes through the mouse path, so it is precise and needs no hover.
- **3D overview camera** looks down at about 58° from the street side,
  framing the floor. **Cut-away walls** are on by default in the overview
  and cut at 1.2 m:
  - an opening that reaches the cut splits the wall, so there is no thin
    strip above it, and windows keep the wall below the sill;
  - glass shows below the cut; door leaves, frames and ceilings are hidden;
  - furniture is shown full height.
  Walk always builds full-height walls.
- **Advice highlight** clears when you click empty canvas (deselect) or
  press Esc.

## Site measure and scan import

- **Checklist.** Built from every active option of every floor: level heights
  (while `Level.estimated`), each estimated wall's inside length (walls hidden
  behind a chimney breast have no face, so only their thickness is asked),
  each estimated opening's width, height and (windows) sill, and every pin.
  Step ids are `levelId|kind|targetId`, so her place survives reloads. The
  list is fixed when she starts; anything newly estimated is added at the
  end next time. Progress and position are kept in this browser only
  (`flatplan:sitemeasure:v1`), not in the project file.
- **A measurement is not a design change.** Measured opening sizes are written
  as given: no pier check, no overlap check, and `existing` is kept, so
  measuring a seed window never raises the structural badge. Wall lengths go
  through `setInternalLength` (the same as typing a length on the plan).
- **RoomPlan USDZ.** Parsed with three's `USDLoader` (USDA and binary USDC,
  zipped or not), so there is no new dependency. Surfaces are found by prim
  name (`Wall0`, `Door0`, `Window0`, `Opening0`, case-insensitive). Each
  prim's box is measured in its own frame; the longer horizontal axis is the
  surface's length. Flat RoomPlan surfaces have no thickness, so walls under
  30 mm thick become 100 mm.
- **Axes.** World metres, Y up, become plan mm with plan (x, y) = world
  (x, z) × 1000: the same mapping the 3D view uses, so a scan isn't mirrored.
  The scan is then turned so its walls run square to the page (a 4-fold
  average of wall directions; RoomPlan's axes are wherever the phone
  started) and moved so its top-left corner sits on the existing plan's
  top-left corner (or the origin on an empty floor). Exact alignment with
  the agent's plan is left to her.
- **Joining.** Wall ends within 150 mm become one corner; an end within 150
  mm of another wall joins it. Doors, windows and openings go on the nearest
  parallel wall within 400 mm; any that match no wall are counted as left
  out. The median wall height becomes the floor's ceiling height. Everything
  from a scan is measured (`estimated` unset) and its openings are
  `existing`. Rooms are named "Scanned room N".
- **Replace or add.** "Replace this floor's walls" swaps the walls on the
  current option (furniture, pins, stairs and the plan picture stay). "Add as
  a new option" duplicates the floor as a new option first and puts the scan
  there, so the original stays as Option A. This was simpler and safer than
  merging a scan into an existing wall graph.
- **DXF.** LINE, LWPOLYLINE and POLYLINE/VERTEX only, in the units of
  `$INSUNITS` (millimetres when unset); y is flipped (DXF is y-up). Stored as
  `Level.vectorUnderlay` (an extension), drawn faintly under the walls, with
  its line ends as snap points for drawing walls. Walls are not built from
  DXF lines automatically.
- **App guide wording.** The LiDAR guide names Polycam (Room mode), 3D
  Scanner App (Room scan) and Canvas as examples, and tells her to check
  each app's export options; it doesn't promise prices or formats.
