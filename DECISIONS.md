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

## Bookcase surround, finishes and the Japanese bath

- **Parametric items.** `CatalogueItem.builder` names a shape builder in
  `src/catalogue/builders.ts`. `itemParts()` calls it instead of stretching
  the parts, and `PlacedItem.params` holds its numbers. The bookcase
  surround keeps its gap the size of the opening (`gapW`, `gapH`); its
  towers take the remaining width, and the bridge fills from the head of
  the opening to the top. Widening it with the edge handles widens the
  towers, not the gap.
- **Fitting to an opening.** Placed or dragged near a door, window or
  opening, the surround centres on it on the side the pointer is on, backs
  onto the wall face, takes the opening's width and height, and runs up to
  50 mm below the room's ceiling (the floor's, if the room has no override).
  After an opening is resized, it re-fits only when she presses *Fit to
  opening*, so manual changes aren't overwritten.
- **Hollow footprints.** `obstacleRects()` gives the plan rectangles of
  parts whose underside is below 0.9 m. The rules engine (ray casts,
  overlaps, door swings, walkways, windows, fixer checks), walk collision
  in 3D and clicking on the plan use these instead of the whole outline. So
  the opening in a surround stays passable, and an L-shaped corner sofa no
  longer blocks the empty corner. Clicking the plan uses them only for
  parametric pieces, so clicking a sofa's seat still selects it.
- **Finish colour.** `PlacedItem.finish` (hex) repaints the parts using the
  joinery, cabinet, wood and white tokens, in 2D and 3D. Glass, metal,
  fabric and so on keep their own colour. Swatches are classic joinery
  colours, plus a free colour picker.
- **Japanese soaking bath (ofuro).** A 1.1 m square, 650 mm deep hinoki tub
  with water 100 mm below the rim. The stool and slatted duckboard sit just
  in front of its footprint, inside the 700/900 mm space it needs in front,
  so its outline stays the tub itself.

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

## Public site on GitHub Pages

- **Public build, private flat.** `VITE_PUBLIC_BUILD=1` makes the first run
  an empty project ("My flat", one empty "Ground floor") and removes the seed
  from the bundle: `firstRun.ts` imports the seed dynamically behind that
  flag, so the bundler drops it, with the address, the notes and the
  floorplan PNG. Checked by grepping `dist/` for "Balmore", "N19" and
  "floorplan-bleuplan" (and the e2e checks the page text). Normal `dev` and
  `build` still open on the seed.
- **Encrypted seed, no new dependencies, no browser.**
  `scripts/encrypt-seed.mjs` loads the app's own `buildSeedProject()` and
  `applySeedUnderlays()` through Vite's `ssrLoadModule`, cuts the floorplan
  crops in Node (`node:zlib` PNG read and write, composited on white like
  the canvas version), and encrypts with AES-256-GCM, key from
  PBKDF2-SHA256 (600,000 iterations, random 16-byte salt and 12-byte IV).
  This avoids installing Chromium on the CI runner. `seed.enc` is never
  committed (git-ignored) and the password is read only from `SEED_PASSWORD`;
  without it the script warns and exits 0.
- **Unlock.** `seedCrypto.ts` fetches `./seed.enc` (relative, so it works
  under `/3dtool/`) with revalidation, decrypts with WebCrypto, then
  `validateProject` and `loadProject`, then saves. The password is only kept
  in the open dialog. The option is hidden unless the file exists and parses
  (a dev server answers any path with the app's page, so a 200 alone is not
  enough). A wrong password and a damaged file both fail the GCM check and
  give "That password didn't work."
- **Honest limit.** The file is public, so its strength is the password's:
  guesses can be tried offline, only slowed by the 600,000 iterations. The
  README says to use a long passphrase.
- **Public wording.** "Start again from the agent's plan" becomes "Start a
  new empty plan", and tour step 1 no longer says a floorplan is already
  underneath.


## Versions

- **Own keys, not in the project.** Versions live in IndexedDB beside the
  autosave (`flatplan:version:<id>`, an index under `flatplan:versions:index`
  and `flatplan:image:<hash>`), so the autosave of the plan stays small and
  `Project` is unchanged. Code: `src/model/versions.ts`. The core functions
  take a tiny key-value interface so unit tests use a `Map`
  (`fake-indexeddb` is not installed and was not added).
- **Images stored once.** Each underlay image is hashed (SHA-256 of the data
  URL; a plain fallback hash on pages without WebCrypto) and the stored copy
  holds `img:<hash>`. Restore swaps them back exactly. An image that has
  gone missing drops that floor's picture with a warning. Images no version
  uses any more are deleted with the last version that used them.
- **Retention.** Named versions are never pruned. Automatic ones: the newest
  30, plus the newest of each calendar day (local time) for 14 days.
- **When snapshots happen.** `store.snapshotBefore(reason)` is called before
  deleting a wall (button and key), "Open up this wall", adding an opening to
  a wall that is not marked non-load-bearing, importing a plan picture, DXF
  or scan, opening a saved plan or the owners' flat, and "Start again". The
  first change of each day also snapshots the plan as it was (`commit` and
  `endGesture` call `noteChange`). Snapshots capture the immutable project
  synchronously and save in the background, one job at a time; asking again
  for the same unchanged project does nothing. A failing automatic save shows
  one warning per session, never blocks the edit.
- **Restore.** Saves the current plan as "Before restoring <name>" first (and
  stops if that fails), then `loadProject(project, { keepLevel: true })`.
  Undo history is cleared by `loadProject`, as for opening a file; the
  safety version is the way back.
- **Change summary.** `diffProjects` (`src/model/diffProjects.ts`) matches
  floors, walls, openings, items and rooms by id and writes plain sentences;
  walls are named by the rooms they bound ("Kitchen wall", "wall between
  Kitchen and Reception"). Items are counted, not named, to keep the catalogue
  out of the model code. A row shows up to 3 lines, Compare up to 12, the
  default cap is 8 plus "and N more changes".
- **File format.** Saving a copy with versions adds a `versionHistory` key
  (`{ format: 1, versions, images }`) beside the plan's own fields, so older
  copies of the app still open the file and `validateProject` is unchanged.
  Opening such a file offers to add the versions; ones with an id already
  here are skipped.
## Engineer and landlord pack, notes, smaller structural pin

- **The structural badge is a pin, not a text box.** On the plan it is now a
  28 px amber ⚠ circle (44 px target) beside the first new opening, on the
  side away from the measurements. It is still drawn for every wall where
  `needsStructuralBadge()` is true and cannot be switched off. Hover shows the
  full `STRUCTURAL_BADGE_TEXT` in a tooltip; a tap selects the wall, whose
  panel already shows the text. The pin is hit-tested in the select tools
  (Trace and Openings), before anything under it. In Furnish mode it is drawn
  but not tappable.
- **Notes are `Level.notes` (EXTENSION), not markers.** Markers are the
  agent's "measure me" pins (one point, text, hideable). Notes are the
  owners' own annotations with three kinds (`note`, `measure`, `arrow`),
  colour, and they always show. A measure's length is computed from its two
  points, never stored, so it stays right when a point is dragged. Added to
  `levelBounds` so Fit and the print include them.
- **Placement tools are real tools** (`placeNote`, `placeMeasure`,
  `placeArrow`), each placing on the second click (or first for a note), then
  going back to Select with the new note selected. Notes are hit in the
  Trace select tool only (not Openings or Furnish) and before walls and
  markers. Drag uses a gesture, measured from where the drag started, so it
  is one undo step. Text edits save when the box loses focus or the panel
  closes (one undo step each), so typing never makes dozens of steps.
- **Print pack is a portal over the app**, not a route: it reads the project
  once when opened, so it cannot change under the reader. Print CSS hides
  `#root` and prints the pack (`@page` A4 landscape, 10 mm margins, a page
  break after each section; floor pages are fixed to one page).
- **Plan pictures reuse the Konva layers.** `canvasApi.renderLevelImage`
  mounts the same Room, Wall, Stair and Overlay layers in a detached React
  root with a fresh Stage, fitted to the page, with no selection or hover
  and no photo underlay, furniture or "measure me" pins. This works in any
  mode, including 3D, where the editor canvas is not mounted. Text is drawn at
  its screen size on a 1040 x 560 stage at pixel ratio 2.5 (about 2600 px),
  so it prints crisp at 9-10 pt. The scale bar is drawn into the picture so it
  stays true however the page is scaled. North is not modelled and is left out.
- **Structural table rows are per new opening.** A wall with two new
  openings has two rows. Piers are measured from the inside face at each end
  of the wall (`usableRange`, `endDistances`), or to the next opening when one
  is beside it. Sides are named as the plan shows them (left and right, or
  top and bottom). Wall location is in words from the rooms on each side
  ("Wall between Kitchen and Reception").
- **Walls removed.** The model has no "before" state, so a deleted wall
  cannot be detected. The cover lists new openings and says when one runs
  along almost all of its wall (90% or more of the usable length). Versions
  (planned) would let the pack compare.
- **3D picture without three.js.** `view3d/captureBridge.ts` holds the last
  overview picture (JPEG from the live canvas, refreshed every 5 s while the
  overview shows). The pack imports only the bridge, so printing never loads
  three.js; it just has no 3D section until 3D was opened. Walk view does not
  update it.

## Add a piece by description or image link

- **Sizes are estimates.** Claude gives the size it was told, a typical UK
  retail size, or a guess, and says which (`sizeConfidence`: stated, typical,
  guess). A guess gets a "?" badge in the list and a note in the item panel.
  She can edit every size in the preview before adding. A size she stated
  ("2.4 m") is kept up to 4 m even if it is wider than the base shape's
  usual range; estimated sizes are clamped to the base shape's range (100 to
  4000 mm if the shape is unknown).
- **The image is fetched by Anthropic's API, not by the browser.** The image
  goes in as a URL source block, so there is no CORS problem and no copy is
  kept. It does mean the link is sent to Anthropic and must be a public,
  direct image address (a Pinterest pin page is not an image; the image
  address on i.pinimg.com is). Only http(s) links are accepted. Only the text and the
  link are sent, never the plan.
- **Same client as advice.** Same key (IndexedDB), model, beta fallback
  and error messages as `claudeAdvice.ts`; shown only when Ask Claude is
  turned on and a key is saved. Replies use structured outputs
  (`output_config.format` as a JSON schema, with the base shape restricted to
  the catalogue's ids) and are validated again locally: unknown shape falls
  back to a plain box, bad colours are dropped, sizes clamped.
- **Shape and clearances come from a real catalogue item** (the closest
  one, chosen by Claude), scaled to the sizes. If the mounting differs from
  that item's (a floor item wanted on the wall), a plain box is used.
- **Colour is a `tint` on the catalogue item** that repaints the body
  materials (fabric, wood, joinery, cabinet, rug, custom, hinoki) in plan and
  3D. A piece's own finish still wins. Glass, metal and screens keep their
  look. A single hex per item, so a two-tone piece is approximate.
- **Items are stored in `project.catalogueOverrides`** with ids `ai-…`, plus
  `source` (kind, text, link, size confidence). Adding goes through `commit()`
  so it can be undone, and the item travels with saved copies and versions.
## Materials and paint

- **One value, three kinds.** A finish stored in the project (`Wall.faces`,
  `Room.wallFinish`, `ceilingFinish`, `woodworkColor`) is a finish id
  (`wall-tile-white`, `floor-oak`), a paint id (`paint-sage`) or a hex
  colour. `findSurface()` in `src/view3d/finishes.ts` resolves all three, so
  projects saved before the palette still open. Old wall ids such as
  `wall-sage` map to the palette entry with the same colour.
- **Palette.** 32 paints in six groups (`src/model/palette.ts`) with plain
  descriptive names; no paint-brand names or brand colour names. Colours are
  chosen by eye, not matched to any maker's chart.
- **Face sides.** `Wall.faces.L / R` are the left and right of the wall drawn
  from node a to node b, the same sides the 3D build already used for each
  room's finish. `wallSideRooms()` (`src/model/faces.ts`) says which room is on
  each side; the 2D panel words it "Side facing Reception". A side with no
  room (outside the flat) cannot be painted. Splitting a wall copies its face
  paint to both halves.
- **Resolution order:** face override, then the room's wall finish, then the
  default (white, tile in a bathroom).
- **Woodwork.** One colour per room covers skirting, door leaves and
  frames, and window frames. A door or window sits between two rooms, so it
  takes the woodwork colour of the room on the wall's left side, else the
  right. Skirting takes the colour of the room it faces. Doors gain a simple
  50 mm architrave on both faces. Skirting (120 x 18 mm) is merged geometry
  with one mesh per colour, skips openings that reach the floor, and is also
  drawn in the cut-away view. Ceilings: white unless `ceilingFinish` is set.
- **Schemes** (`Project.schemes`, `src/model/finishSchemes.ts`) are saved
  colour sets, not the floor "options" of compare mode. A scheme keeps one
  floor's rooms (floor, walls, ceiling, woodwork) by room name. Applying one
  sets what the scheme has and clears what it leaves out, so the room looks as
  it did when saved. Rooms whose names are not in the scheme are left alone.
  Single-face wall paint is not part of a scheme (it belongs to a wall, not a
  room). *All floors* means the active option of every floor.
- **Lease hint.** Rubber counts like cork: allowed in the kitchen and
  bathroom, the plain carpet note elsewhere. Sisal gets its own note (a woven
  covering, but the lease says carpet), because it is not clear it counts.
- **Clicking a face.** Wall meshes are merged per finish, so each merged mesh
  keeps a list of triangle runs per wall face (`MeshSpec.wallFaces`);
  `e.faceIndex` finds the face. The selected face gets one tinted sheet; there
  is no hover effect, so moving the mouse never rebuilds the scene. Materials
  are cached by colour and textures by finish id.
- **Fixed on the way:** `styles.css` was missing the closing brace of
  `.check-row input`, so every rule after it was nested and never applied.
  The notes colour dot `.swatch` also clashed with the item colour swatches;
  it is now `.note-swatch`.

## Real sun and sun hours

- **Sun position** (`src/view3d/sun.ts`) is the NOAA approximation
  (declination, equation of time, hour angle) for 51.565 N, 0.137 W. It is
  geometric (no refraction) except sunrise and sunset, which use the usual
  90.833 degree zenith. Times use Europe/London through `Intl`, so BST and GMT
  read right. Unit tests check noon heights (about 62 and 15 degrees, due
  south) and sunrise and sunset against published London times within 5 minutes.
- **Orientation.** The one number that ties the plan to the compass is
  `PLAN_UP_BEARING` (330 degrees: plan "up", towards the garden, points north-
  north-west, so the front bay faces south-south-east). It is read off the
  agent's north arrow, so it is a guess. After a site visit, set it from a
  compass in `src/view3d/sun.ts`; the light, shadows and sun-hours table all use
  it. The old direction slider used the same mapping, which is kept.
- **Sun hours.** For each room, points are sampled on the inside floor polygon
  (grid 50 cm, coarser if that would give more than 200 points). Every 15
  minutes between sunrise and sunset, a three.js `Raycaster` fires from 2 cm above
  the floor towards the sun at the built walls, solid masses, floor slabs and
  ceilings of every floor from the one measured upwards. Window panes are left out
  (transparent); furniture and stairs are left out too (the question is the
  room, not the sofa). A point is sunlit if nothing is hit. A room's hours are
  the average over its points of (lit samples x 0.25 h). The geometry is cut
  into small chunks, so a ray only tests the ones near it. The work runs in
  12 ms slices with a progress bar. If the plan is edited afterwards the table
  says so.
- **Neighbours are not modelled** (no terrain, no buildings, no trees, no
  roof overhang, no reveal depth beyond the wall thickness), so real sun will be
  less, most of all in winter when the sun is low. This is said under the table.
- **Light.** The time slider only changes light properties (position, colour,
  intensity), never geometry. Sun state lives in a small zustand store
  (`sunState.ts`), not the project store, so it is not saved or undone. Below
  the horizon the sun goes out, the sky light dims and the background turns
  dark blue. The shadow camera is refitted every frame to the box of the floors
  in view, as seen from the sun.
- **Privacy.** The real-sun label names the address in the private build
  only; the public build says "Real sun for this flat". The site coordinates
  are in the code of both builds (they are only good to about 100 m).

