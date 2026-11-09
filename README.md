# Flat Planner

A browser app for planning the interior of 18B Balmore Street, London N19:
trace the floorplan, edit walls, furnish, get layout advice, and walk
through in 3D. No backend: everything runs in the browser and is saved in
the browser's own storage (IndexedDB).

Status: **Phases 1–2** (plan import, wall editing, doors, windows and openings). See `DECISIONS.md` for
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

## Using it (Phase 5: 3D)

| Do this | How |
| --- | --- |
| Switch between plan and 3D | **Tab**, or the 3D button in the mode bar |
| Look around the floor | Drag to turn, scroll or pinch to zoom. Floors above the current one are hidden |
| Walk through | *Walk* in the right panel. Click the view to look with the mouse, then W A S D or arrow keys. Esc frees the mouse. On a tablet: left thumb to walk, drag on the right to look |
| Go up or down | Walk onto a stair; the floor tabs follow you |
| Change a floor or wall finish | Pick a room (or click its floor in the overview), then a swatch. Undo works |
| See the daylight | Move the sun's direction and height. The bay faces south-south-east |
| Evening light | Tick *Ceiling lights on* |

Numbers marked **≈** come from the agent's not-to-scale plan. Amber **?** pins
mark things to measure on site; the right panel lists them per floor.

## Code layout

```
assets/            agent floorplan, brochure, listing photos
src/model          types, zustand store, undo history, units, seed, autosave
src/geometry       wall graph, joints, room detection, dimensions, snapping, calibration
src/editor2d       Konva canvas, layers and tools
src/ui             panels, mode bar, inspector
src/view3d         3D scene (walls, floors, furniture), walkthrough, finishes
src/catalogue      (phase 3)
src/rules          (phase 4)
src/advice         (phase 4, optional)
e2e/               Playwright smoke tests
```

## How to add a catalogue item

Arrives in Phase 3. Items will be plain data in `src/catalogue/`, one object
per item following `CatalogueItem` in `src/model/types.ts`: name, search
aliases, category, default size, resize ranges, primitive boxes and
cylinders for the 3D shape, optional states (e.g. Murphy bed folded and
deployed) and clearances. This section will get a worked example then.

## How to add a rule

Arrives in Phase 4. Rules will live in a single registry file in
`src/rules/`: each has an `id`, `applies(item, context)`, `measure()`, a
severity and a plain-English message, with the numbers editable in
settings. Each rule ships with a passing and a failing test fixture. This
section will get a worked example then.
