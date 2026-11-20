# Code review: stability and performance

Scope: data safety, crash risks, speed, leaks and build hygiene of the Vite + React +
TypeScript app (Konva 2D, three.js 3D, zustand + immer, IndexedDB, no backend). UI copy and CSS
were left to the UX review. Reviewed at `ccd37f8`.

Severity: **P1** data loss or crash. **P2** wrong result. **P3** slow. **P4** hygiene.

## Found and fixed

### P1

| # | Problem | Where it was | Fix |
| --- | --- | --- | --- |
| 1 | A plan could be **replaced by the starting plan**. `loadSavedProject` returned `undefined` for "nothing saved", for a read error and for a record that failed validation, and boot then saved the seed over it. | `persistence.ts`, `main.tsx` | `readSavedProject` returns `none / ok / unusable / error`. An unusable record is copied to `flatplan:unreadable:<time>` before anything is written. If storage cannot be read (after one retry) saving is paused so the stored plan is not replaced. `loadForBoot` makes the decision; tests in `persistence.test.ts`. |
| 2 | **Page hide during start-up saved the empty placeholder plan** (`flushSave` ran on `pagehide` before the plan had loaded, and wrote `{ levels: [] }`). | `persistence.ts` `flushSave`, `main.tsx` | Nothing is written while `ready` is false. |
| 3 | **A finished drag was not saved** until the next edit. A drag ends by changing `gesture`, not `project`, and the autosave returned early on "project unchanged". Closing the tab, a crash or an iOS tab kill lost the last drag. | `startAutosave` | The subscriber compares with the last saved plan, not with the previous state. Also saves on `visibilitychange` (phones skip `pagehide`). |
| 4 | **A failed write was never retried** (`lastSaved` was set before the write) and a full disk was one toast and then silence. | `writeNow` | `lastSaved` only after success; retry every 10 s; a clear "out of room" message, at most one per 30 s. Writes run in order. |
| 5 | **Damaged plans crashed the editor.** `validateProject` checked only that `levels`, `nodes` and `walls` were arrays. A wall pointing at a missing corner throws in `nodePos` on render; a `null` position (NaN is saved as `null`) breaks the geometry; a stair with length `1e12` loops for billions of treads. | `persistence.ts` | New `repair.ts` (`repairProject`) drops what is broken (walls with a missing or equal corner, non-finite positions, duplicate ids, bad sizes, groups with missing members, notes and pins with no position, rooms with missing corners, unusable pictures) and tells her what was left out. A healthy plan, the seed included, passes through unchanged (tested). 60 randomly damaged copies of a busy plan are opened, repaired, then run through joints, rooms, dimensions, rules, 3D build and walk physics (`repair.test.ts`); the same test without the repair fails on most seeds. Version history in a file is repaired too (`parseHistory`). |
| 6 | **A render crash blanked the page** (nothing caught it), and `Opening your plan…` stayed for ever if start-up threw. | `main.tsx` | Top-level `ErrorBoundary`: "Something went wrong. Your plan is saved." with **Reload**, **Save a copy of my plan** (from the store, or from IndexedDB if the store is unusable) and **Undo my last change**. Saving is paused while it is up, so the state that crashed is not written over the good copy. Boundaries around the 3D view and each side panel (a panel retries when the selection changes). The plan is drawn in react-konva's own React root, which the page boundary cannot see, so a `canvas` boundary inside it reports to `CrashGate`. Errors in event handlers and promises show one short toast. Start-up falls back to an empty plan instead of hanging. `e2e/errors.spec.ts`. |
| 7 | **Two windows overwrote each other.** The older window saved over newer work. | `startAutosave` | A `BroadcastChannel` tells other windows when one saves; the others stop saving and say so until she opens a file or reloads. |

### P2

| # | Problem | Fix |
| --- | --- | --- |
| 8 | Undo or redo of "delete option" left `levelId` on a floor that no longer exists (a blank plan area). | `validLevelId` in `store.ts`; test in `storeSafety.test.ts`. |
| 9 | Deleting a floor option left stairs on other floors pointing at it (no stair in 3D, no destination on the plan). | `deleteOption` retargets them to the option that is left. |
| 10 | Undo patches that no longer fit the plan threw out of the click handler. | `tryApply`: the undo list is cleared with a message. A failing "finish" step at the end of a drag keeps the drag as it was. |
| 11 | `openingTools.ts` used `outlines.get(id)!`; a wall with no length has no outline, so dragging an opening on it threw. | Guarded. |

### P3 (speed). Browser measurements, 150 pieces + 30 notes + 2 options, dev server

Dev builds are slow (React creates a stack for every element), so use the numbers for
*before / after*, not as absolute. Main-thread time per step, from `scripts/perf-browser.mjs`;
renders counted with `src/perf.ts` (halve for StrictMode). The 38 pieces of the floor shown
were redrawn on every pointer move.

| Step | Before | After |
| --- | --- | --- |
| Hover over the plan (Furnish), per move | 59 ms, 38 piece redraws | 12 ms, about 0.2 |
| Drag a piece, per move | 138 ms, 38 piece redraws | 44 ms, 1 |
| Drag a wall, per move | 100 ms | 46 ms |
| Change a piece (typed value), per edit | 157 ms | 41 ms |
| Switch floor | 162 ms | about 160 ms (everything on the new floor is drawn once, as it must be) |

Changes: hovering no longer re-renders the plan when nothing under the pointer changed
(`sameOverlay`); piece, wall, room, stair, note and dimension shapes are memoised on the data they
draw; wall geometry is kept while only furniture or notes change (`derived` keyed on
`nodes` and `walls`); the rule check is paused during a drag (`useLevelIssues`) and the top bar
no longer re-renders on every drag. The furniture panel rebuilt its search index on every edit
(it depended on the whole plan, now only on her own items).

Node timings on the same plan (`src/test/perf.test.ts`, all five floors): `computeJoints` 0.75 ms,
`detectRooms` 0.8 ms, `wallDimensions` 0.7 ms (cheap: no cache needed), `runRules` 39 ms for about
150 pieces cold and 47 ms after a move, 0.00 ms on a memo hit. 3D `buildLevel` 35 ms for five
floors. In headless Chromium (software GL) the 3D view first builds in about 1.7 s and runs at 1 to
3 frames a second; relative only.

**Bundle**: first load JavaScript `index` 986 kB to 859 kB (gzip 305 to 268 kB). Print pack, budget,
versions panel, site measure, scan import (the USD loader was 270 kB of source in the main chunk),
scan guide and the command palette now load when first opened. pdf.js, the Anthropic SDK and three.js
were already lazy. What is left is React, Konva (690 kB of source) and the app itself, all needed at
first paint. The public build was checked: no seed, no "Balmore", no "N19".

### P4

* `.github/workflows/test.yml`: `tsc -b`, `vitest run` and a public production build on every push and pull request (no Playwright; it needs a browser and takes minutes).
* `pages.yml` and `test.yml` set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`. No newer majors of `configure-pages`, `upload-pages-artifact` or `deploy-pages` could be checked from here; bump them if the Node 20 warning stays.
* Fuzz tests for `addWall`, `splitWall`, `deleteWall`, `mergeNodes`, `settleNode`, openings, `detectRooms`, `computeJoints`, `wallDimensions`, `runRules` (40 random edit sequences, results checked for NaN) found no crash on valid graphs.
* Leaks reviewed: every `addEventListener` has its `removeEventListener`; object URLs are revoked; 3D geometry is disposed with its level; the sun job is stopped on unmount; the off-screen renderer clears its timer. Nothing to fix.

## What remains

* **P2** The one place that still throws for a missing corner is `nodePos` (`geometry/wallGraph.ts:26`), used by about 25 callers. Loading now repairs, and the store keeps the graph consistent, but a future edit that leaves a wall without its corner would still throw in a render. The error screen catches it.
* **P2** Pointer handlers use `!` on lookups that hold by construction (`editor2d/tools/selectTool.ts:77,91,140-143`). An error there shows the generic toast and leaves the plan as it was.
* **P3** `runRules` is about 10 ms a floor with 40 pieces and runs once after each edit. Most of it is the per-piece clearance rays (`rules/context.ts`). Fine today; the next thing to cache if floors get much fuller.
* **P3** Switching floors draws every shape once (about 150 ms in dev). Konva shapes for a whole floor could be cached as one bitmap per floor.
* **P3** `dist/assets/index` is still 860 kB. Splitting Konva out of the first load would need the plan canvas itself to be lazy.
* **P4** Material caches (`view3d/materials.ts:55`) grow with every distinct custom colour she picks; small, never freed.
* **P4** Automatic versions are pruned (`versions.ts:147`) but named versions and the images they hold are kept for ever; a quota error is reported once.
* **P4** `e2e/materials.spec.ts` ("wall colour in 3D") timed out once under a parallel full run (software 3D is slow when several tests run at once) and passed alone in 41 s.
* **Risk** The unreadable-record backups (`flatplan:unreadable:*`) have no screen; they can only be recovered from the browser's developer tools. The data is kept, but she cannot reach it herself.
* **Risk** Two windows: the second window stops saving. She has to reload; there is no merge.
* **Risk** Everything is in one browser's IndexedDB. Clearing site data, or the browser evicting storage on a nearly full disk, loses the plan and its versions. Nothing prompts her to save a file; a periodic "save a copy" reminder would help.
