# Flat Planner

A browser app for planning the interior of 18B Balmore Street, London N19:
trace the floorplan, edit walls, furnish, get layout advice, and walk
through in 3D. No backend: everything runs in the browser and is saved in
the browser's own storage (IndexedDB).

Status: **all six phases are built**: plan import and wall editing, doors and windows, furniture, layout advice, 3D with walk-through, and polish (tour, shortcuts, compare options, iPad). See `DECISIONS.md` for assumptions and `assets/` for the agent's plan and photos.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

The first time it opens on the Balmore Street plan. After that it reopens
wherever you left off (autosaved on every change). *File → Start again from
the agent's plan* resets it.

## Test it

```bash
npm test             # unit tests (geometry, units, calibration, seed)
npm run e2e          # Playwright smoke test of the main loop
npm run typecheck
```

## Deploy

```bash
npm run build        # static site in dist/, works from any folder or host
```

## Hosting

The public site is at **https://david89it.github.io/3dtool/**. It starts
empty: no address, no seed plan, no floorplan picture. Our own flat is
published only as an encrypted file (`seed.enc`) and opens with a password:
*File → Open our flat…*, or the button on the empty first screen.

Two steps for the owner, once:

1. Repository **Settings → Secrets and variables → Actions → New repository
   secret**: name `SEED_PASSWORD`, value your password. Choose a long
   passphrase (four or more random words): anyone can download `seed.enc`
   and try passwords against it offline, so a short password can be guessed.
2. **Settings → Pages → Source: GitHub Actions.**

Then every push to `claude/flat-planner-brief-o4stwd` (or *Actions → Publish
site → Run workflow*) rebuilds and publishes. Without the secret the site
still publishes, just without "Open our flat". To change the password, change
the secret and run the workflow again.

Plans live in each visitor's own browser (autosaved there); nothing is sent
to a server. Use *File → Save a copy to my computer* for backups.

How it works: `VITE_PUBLIC_BUILD=1 npm run build` leaves the seed out of the
bundle; `SEED_PASSWORD=… node scripts/encrypt-seed.mjs dist` builds the full
seed project, encrypts it (AES-256-GCM, key from PBKDF2-SHA256 with 600,000
iterations) and writes `dist/seed.enc`. `npm run build` without the flag
behaves as before and opens on the seed.

## Using it (Phase 1)

| Do this | How |
| --- | --- |
| Pan | Drag empty floor, scroll with two fingers, or hold Space and drag |
| Zoom | Pinch, Ctrl/⌘ + scroll, or the + / − buttons. **Fit** shows the whole floor |
| Import a plan | Left panel → *Import PNG, JPG or PDF…* (PDFs use page 1) |
| Set the scale | Click two points on the image, type the real distance. *Set scale (redo)* repeats it |
| Draw walls | **W**, then click corners. Snaps to 0/45/90°, existing corners, wall midpoints and walls. Alt turns snapping off. Double-click, Enter or Esc to finish |
| Edit a wall | **V**, click it: length, thickness, kind, load-bearing in the right panel |
| Move a wall | Drag it; walls joined to it follow. It slides square to itself (Alt: free) |
| Reshape | Drag a corner; drop it on another corner or wall to join them |
| Split a wall | Double-click it, or *Split in two* in the panel |
| Exact length | Click any measurement on the plan and type, e.g. `3.32`, `332cm`, `10' 11"` |
| Delete | Select and press Delete |
| Undo / redo | Buttons top right, Ctrl/⌘ Z, Ctrl/⌘ Shift Z |
| Save a copy | File → *Save a copy to my computer* (`.flatplan.json`); *Open a saved plan…* loads one |
| Picture | File → *Export this floor as a picture (PNG)* |
| Save a version | The clock button next to Undo, or File → *Versions…* → *Save this version…*. Give it a name such as "Kitchen open". Named versions are kept for good |
| Go back to a version | *Versions…* → *Restore* on that row. Your current plan is saved first as "Before restoring …", so nothing is lost and you can restore that one too |
| See what changed | Each row lists what changed since the version before it ("Kitchen wall opened (2.61 m)", "3 items added, 1 moved"). *Compare with now* lists what has changed since that version |
| Automatic versions | Flat Planner saves one before it deletes a wall, opens a wall up, adds an opening to a wall that may be load-bearing, imports a file or scan, opens a saved plan, restores a version, and before your first change each day. It keeps the latest 30, plus one a day for 14 days |
| Keep history in a copy | Tick *Include versions when saving a copy* in the Versions window, then File → *Save a copy to my computer*. Opening that file offers to add its versions |

## Using it (Phase 2: Openings mode)

| Do this | How |
| --- | --- |
| Add a door, window or opening | Drag it from the left onto a wall. Or click it, then click a wall |
| Move it | Drag it along the wall, or onto another wall. It won't overlap another opening or run past a wall end |
| Exact size or position | Click the blue measurements on the plan (width, wall left at each side), or use the right panel |
| Door swing | *Hinge on the other side*, *Open into the other room* |
| Open up a wall | Select the wall → *Open up this wall* (widest opening it allows) |
| Remove | Select and press Delete, or *Remove* |

In a wall that is load-bearing or "Don't know", 10 cm of wall is kept either
side of an opening; tick *Allow less than 10 cm* on one opening to override
(it then shows a warning). New openings in those walls get a permanent amber
⚠ pin beside the opening. It cannot be hidden. Hover it to read the warning
(*Structural opening: needs engineer, steel and Building Control. Leasehold:
needs landlord's licence.*); tap it to select the wall, where the full text is
in the right panel.

## Using it: notes and the engineer and landlord pack

| Do this | How |
| --- | --- |
| Pin a note to the plan | Trace mode → left panel *Notes* → **Note**, then click the plan and type in the right panel |
| Measure a distance | **Measure**, click two points. The length shows as you move (corners and walls snap; Alt turns snapping off) |
| Point at something | **Arrow**, click two points. Add a comment in the right panel if you like |
| Move, edit, delete a note | Click it (V). Drag it, or drag a round end of a measurement or arrow. Delete key or *Delete* in the panel. Each drag is one undo step |
| Print or save as PDF | File → *Print or save as PDF…*, wait for the plans, then *Print / Save as PDF* and choose "Save as PDF" as the printer |

The pack (A4 landscape) has: a cover with a plain summary of the new openings
and *Prepared for*; one page per floor with room names, areas, every wall's
inside length, new opening widths, notes and structural pins, and a scale bar
(1 m and 5 m); a *Structural* page with a table of every new opening in a wall
that may be load-bearing (wall, thickness, opening size, wall left each side)
and *Things the engineer should confirm*; the landlord's licence page with
blanks for freeholder, lease reference and contractor; a 3D overview picture
if you opened 3D (it is the last overview shown); and a list of your notes by
floor.

## Using it (Phase 5: 3D)

| Do this | How |
| --- | --- |
| Switch between plan and 3D | **Tab**, or the 3D button in the mode bar |
| Look around the floor | Drag to turn, scroll or pinch to zoom. Floors above the current one are hidden |
| Walk through | *Walk* in the right panel. Click the view to look with the mouse, then W A S D or arrow keys. Esc frees the mouse. On a tablet: left thumb to walk, drag on the right to look |
| Go up or down | Walk onto a stair; the floor tabs follow you |
| Change a floor, walls, ceiling or woodwork | Pick a room (or click its floor in the overview). The tabs *Floor / Walls / Ceiling / Woodwork* each show swatches. Walls, ceiling and woodwork use a palette of 32 paint colours in six groups, or *Any other colour* (type a hex code such as `#5a2a3a`). Floors include herringbone and chevron oak, pattern tile, sisal and studded rubber. Undo works |
| Paint just one wall | Click the wall in the overview: the Walls tab says *This wall face, facing Reception*. Pick a colour. *Back to the room colour* undoes it for that face. In the plan, select a wall, open *Side facing Reception* (or the other room) under *Paint*. Painted faces get a thin coloured line on the plan |
| Woodwork | The *Woodwork* tab colours the skirting (120 mm), door leaves and frames, and window frames of that room. *Back to white* resets it |
| Save and reuse a colour scheme | Under *Schemes* in the 3D panel, name it and press *Save these finishes as a scheme* (every room on this floor, by room name). *Apply scheme…* → *This floor* or *All floors*. It works on any option whose rooms have the same names |
| See the real sun | *Daylight* in the right panel starts on *Real sun at 18B Balmore Street*. Pick *Today*, *Midwinter 21 Dec*, *Equinox 20 Mar*, *Midsummer 21 Jun* or any date, then drag the time slider (it runs sunrise to sunset in London time, BST or GMT). *Play the day* runs sunrise to sunset in about 12 seconds; press *Pause* to stop. The light, the sun's shadows and the sky follow. Below the horizon it turns to dusk or night |
| Move the sun by hand | *Manual* gives two sliders: direction and height (below 0 is night). The bay faces south-south-east |
| Sun hours per room | *Sun hours: First floor* (or *All floors*) works out, for each room, the average hours of direct sun on its floor on 21 Dec, 20 Mar, 21 Jun and today, with a progress bar. Read the table as *Room / Midwinter / Equinox / Midsummer / Today*. It ignores neighbouring buildings and trees, so real sun will be less. Tick *Show on the floor* for a map in 3D (pale for no sun to warm yellow for the most) and pick the date |
| Evening light | Tick *Ceiling lights on* |

Numbers marked **≈** come from the agent's not-to-scale plan. Amber **?** pins
mark things to measure on site; the right panel lists them per floor.

## Using it (Phase 6: tour, shortcuts, options, iPad)

| Do this | How |
| --- | --- |
| Quick tour | Shows on the first visit (5 short steps). File → *Show the tour again* repeats it |
| Keyboard shortcuts | Press **?** or the **?** button in the top bar. Esc closes |
| Compare layouts | *Options ▾* next to the floor tabs → *Duplicate as a new option*. Switch between Option A and Option B from the same menu; rename or delete an option there |
| 3D overview | Walls are cut away at 1.2 m so you can see in. Untick *Cut-away walls* for full height. Walk always uses full height |

Each floor shows one tab; when it has options, the tab says which one is on.
The 3D view, stairs and walking use the option that is on.

**On an iPad** (Safari): one finger drags the plan, two fingers pinch to zoom,
a tap selects. In *Draw walls*, *Set scale* and when placing things, a tap places
and a drag moves the plan instead. The Apple Pencil works like a mouse: tap to
place corners, press and drag to move walls and furniture. Long-press doesn't
pop up the copy menu. Add the page to the Home Screen for full-screen use.

`?notour` in the address skips the tour (used by the tests).

## Using it: on site and scans

| Do this | How |
| --- | --- |
| Replace estimates with real measurements | Settings → *Measure on site* (or File → *Measure on site*). Works on a phone |
| Answer a step | Type the size (`3.32`, `332 cm`, `23 cm`, `10' 11"`) and *Save*. *Skip* or *Can't measure* to move on, *Back* to return |
| Stop and carry on later | Close it; it reopens where you left off. *Undo* undoes the last measurement |
| Scan rooms with LiDAR | Settings → *Scan with an iPhone or iPad Pro (LiDAR)* for the apps and steps |
| Bring a scan in | File → *Import a scan…*: `.usdz` (RoomPlan) builds walls, doors and windows; `.dxf` goes under the plan as a drawing to trace (corners snap to its line ends); an image or PDF becomes the plan picture |
| Keep your plan while trying a scan | *Add as a new option*: the scan goes in as Option B and your plan stays as Option A |

The checklist asks about every value still marked ≈: each floor's ceiling
height and height above the front door, each wall's inside length and
thickness, each door and window's width and height (and sill for windows),
and every "measure me" pin.

## Code layout

```
assets/            agent floorplan, brochure, listing photos
src/model          types, zustand store, undo history, units, seed, autosave
src/geometry       wall graph, joints, room detection, dimensions, snapping, calibration
src/editor2d       Konva canvas, layers and tools
src/sitemeasure    site-measure checklist and LiDAR scan guide
src/import         RoomPlan (USDZ) and DXF scan import
src/ui             panels, mode bar, inspector
src/view3d         3D scene (walls, floors, furniture), walkthrough, finishes
src/catalogue      (phase 3)
src/rules          (phase 4)
src/advice         (phase 4, optional)
e2e/               Playwright smoke tests
```

## How to add a catalogue item

Items are plain data in `src/catalogue/items.ts` (the `CATALOGUE` array),
built from boxes and cylinders with the helpers in `src/catalogue/parts.ts`.

**Item frame** (millimetres): x runs across the width (−w/2…w/2), y is up
from the floor, z runs through the depth with the **back at −d/2** (against
the wall) and the **front at +d/2** (where you stand to use it). A part's
`pos` is its centre and `size` is `[x, y, z]`. A cylinder's size is
`[diameter, height, diameter]`. `slab(x, bottom, z, sx, sy, sz, colour)`
places a box by its bottom height. Clearance sides: `front` is +z, `back`
is −z, `left` is −x, `right` is +x.

Worked example, a 120 cm hall bench with a cushion:

```ts
{
  id: 'bench-hall',                        // unique, never change once used
  name: 'Hall bench',
  aliases: ['shoe bench', 'entryway bench', 'boot bench'],  // search words
  category: 'sit',                         // which tab it appears under
  defaultDims: { w: 1200, d: 350, h: 480 },
  resizable: { w: [800, 1600] },           // leave out an axis to fix it
  mount: 'floor',                          // 'floor' | 'wall' | 'ceiling'
  geometry: [
    slab(0, 0, 0, 1200, 430, 350, 'wood'),   // the box, sitting on the floor
    slab(0, 430, 0, 1200, 50, 350, 'fabric'), // cushion on top
  ],
  clearance: [
    { side: 'front', min: 450, ideal: 600, reason: 'Room to sit and take shoes off' },
  ],
  rules: ['door-swing', 'walkway'],        // which layout rules check it
}
```

- Sizes in `geometry` are for `defaultDims`. When she resizes an item the
  parts scale with it (`itemParts` in `src/catalogue/catalogue.ts`).
- **States** (folded or deployed, closed or extended...) go in `states`.
  Each state has its own `dims` and `geometry`. The first state is the
  default. Other states keep the **back** edge where it is, so a Murphy bed
  folds down away from the wall. Add a friendly name for a new state in
  `STATE_LABEL`.
- Dynamic clearances: `dynamic: 'doorSwing'` draws door arcs on the front:
  one leaf up to 70 cm wide, two up to 130 cm, then three. `'drawerPull'`
  draws a dashed pull-out zone of depth `min`. `'deploy'` outlines the item's
  other state.
- **Colours** are tokens (`wood`, `fabric`, `white`, `metal`, `cabinet`,
  `worktop`, `ceramic`, `glass`...). The plan colours are in
  `src/catalogue/colors.ts`.
- Run `npm test`. `src/catalogue/catalogue.test.ts` checks that ids are
  unique and every item has parts.

People can also add their own items in the app (*Furnish → Add custom
item…*). These are saved in the project's `catalogueOverrides`.

## Using it (Phase 3: Furnish mode)

| Do this | How |
| --- | --- |
| Find something | Type in the search box (it understands other words: "wall bed" finds the Murphy bed), or pick a category |
| Place it | Click it, then click the plan. Or drag it onto the plan. Near a wall it turns to back onto the wall. Alt: no snapping |
| Move | Drag it. It slides along a wall it is backed onto |
| Resize | Drag the dots on its edges (the other edge stays put), or type sizes in the right panel |
| Turn | Drag the round handle (90° steps; Alt for any angle), press R, or use *Turn 90°* |
| Fold down, extend, open | *Position* in the right panel (Murphy bed, sofa bed, extendable table, fold-down desk, pull-out drawer) |
| Duplicate, lock, remove | Ctrl/⌘ D, *Lock*, Delete |
| See the space things need | Select an item, or tick *Show space needed around everything* |
| Your own item | *Add custom item…* |
| Add a piece by describing it | Needs *Ask for advice* switched on in Settings with your API key. At the top of the Furnish panel, type "Vitra-style lounge chair in tan leather" or "a 2.4 m oak sideboard" (you can paste a product photo or Pinterest image link into the text, or into the *Image link* box), then **Add**. Check the preview: change the name or any size, then *Add to my items* (or *Try again*). It appears under *Your items* in the list, with a **?** if the size is only a guess, and the right panel shows the image link. Sizes are estimates, so measure the real piece. Undo removes it |
| Frame an opening with shelves | Search "library" for the *Bookcase surround*, then click next to a door or opening: it centres on it, sizes its gap to the opening and runs up to the ceiling. Change the opening, tower or depth sizes in the panel; *Fit to opening* re-fits it after the opening changes |
| Paint a piece | *Colour* in the right panel: aubergine, off-black, deep green, navy, warm grey, white, natural oak, or any colour. Shows in the plan and in 3D |

## Using it (Phase 4: Advice mode)

| Do this | How |
| --- | --- |
| See problems | **Advice** in the mode bar. The number on it counts the problems on this floor (red: something blocks use, amber: uncomfortable, blue: tips) |
| See one on the plan | Click it: the plan zooms to it and outlines the furniture and walls involved |
| Fix it | **Fix** nudges (and if needed turns) only the things named, to the nearest spot that works. Undo puts them back |
| Check one item | Select it in Furnish mode: its problems are listed in its panel |
| Change the numbers | **Settings → Layout rules**. Every value is editable, saved with the plan, undoable; *Reset to UK defaults* |
| Ask Claude (optional) | **Settings → Ask Claude for advice**: switch it on and save your own Anthropic API key (kept only in this browser, sent only to Anthropic). Then **Ask for advice** in Advice mode |

Problems are worded as measured against needed, for example *"Wardrobe to
chest of drawers: 40 cm. Needs 50 cm to open the doors."* Claude gets these
measurements as facts and is told not to contradict them.

## How to add a rule

Rules live in one file, `src/rules/registry.ts`, as entries in the `RULES`
array. A rule applies to an item when the catalogue item lists the rule's id
in its `rules` array (in `src/catalogue/items.ts`), so turning a rule on for
more furniture is a data change.

Each rule has an `id`, a plain-English `title`, a `severity` (`error` blocks
use, `warning` is uncomfortable, `tip`), editable `params` with `paramLabels`
for the settings screen, and `fixable`. Item rules have `applies(item, ctx)`
and `measure(item, ctx, params)`. Whole-floor rules use `scope: 'level'` and
`measureLevel(ctx, params)`.

A measurement (`measured`, `required`, optional `ideal`, plus `subject` and
`need`) is reported below `required`, and as a tip between `required` and
`ideal`; a flag (`severity` and `message`) is always reported.
`ctx.clearDepth(item, side)`, `ctx.roomOf(item)`, `ctx.geo.doors` / `windows`
and `ctx.fmt` are available.

Worked example: keep 1 m clear in front of a piano.

```ts
{
  id: 'piano-stool',
  title: 'Room for the piano stool',
  scope: 'item',
  severity: 'warning',
  fixable: true,
  params: { min: 900, ideal: 1000 },
  paramLabels: { min: 'Minimum', ideal: 'Comfortable' },
  applies: (p) => (p.cat.rules ?? []).includes('piano-stool'),
  measure: (p, ctx, { min, ideal }) => {
    const h = ctx.clearDepth(p, 'front');
    return [{ itemIds: [p.item.id], measured: h.dist, required: min, ideal,
              subject: `${p.cat.name} to ${ctx.hitName(h)}`, need: 'for the stool and the player', roomItem: p }];
  },
},
```

Then add `'piano-stool'` to the upright piano's `rules` in `items.ts`, and add
a passing and a failing fixture to `src/rules/rules.test.ts` (build a room
with `room()` and place items with `put()` or `againstTop()`). The new number
appears in Settings automatically.
