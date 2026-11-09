# Flat Planner

A browser app for planning the interior of 18B Balmore Street, London N19:
trace the floorplan, edit walls, furnish, get layout advice, and walk
through in 3D. No backend: everything runs in the browser and is saved in
the browser's own storage (IndexedDB).

Status: **Phases 1–3** (plan import, wall editing, doors, windows and openings, furniture). See `DECISIONS.md` for
assumptions and `assets/` for the agent's plan and photos.

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
note: *Structural opening: needs engineer, steel and Building Control.
Leasehold: needs landlord's licence.*

Numbers marked **≈** come from the agent's not-to-scale plan. Amber **?** pins
mark things to measure on site; the right panel lists them per floor.

## Code layout

```
assets/            agent floorplan, brochure, listing photos
src/model          types, zustand store, undo history, units, seed, autosave
src/geometry       wall graph, joints, room detection, dimensions, snapping, calibration
src/editor2d       Konva canvas, layers and tools
src/ui             panels, mode bar, inspector
src/view3d         (phase 5)
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

## How to add a rule

Arrives in Phase 4. Rules will live in a single registry file in
`src/rules/`: each has an `id`, `applies(item, context)`, `measure()`, a
severity and a plain-English message, with the numbers editable in
settings. Each rule ships with a passing and a failing test fixture. This
section will get a worked example then.
