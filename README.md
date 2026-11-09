# Flat Planner

A browser app for planning the interior of 18B Balmore Street, London N19:
trace the floorplan, edit walls, furnish, get layout advice, and walk
through in 3D. No backend: everything runs in the browser and is saved in
the browser's own storage (IndexedDB).

Status: **Phase 1** (plan import and wall editing). See `DECISIONS.md` for
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
