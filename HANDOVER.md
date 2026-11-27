# Handover

The one document to read before working on Flat Planner. The folder map and
file-size conventions are in [`docs/architecture.md`](docs/architecture.md). It is kept short on
purpose: read this, then only the files your task names. Update the
"State" and "Log" sections at the end of every piece of work.

Last updated: 2026-11-26, after loft slopes and chimney breasts.

## 1. What this is

A browser app for planning the interior of 18B Balmore Street, London N19,
a split-level Victorian flat the owners are buying. The main user is a
designer, not a programmer. The original brief is in the first section of
`README.md` and in `DECISIONS.md`. The product goal is to help them decide
how to renovate and furnish the flat. The first decision is opening the
kitchen into the reception, which needs a structural engineer, Building
Control and the landlord's licence.

Main loop: **trace → openings → furnish → advice → 3D walk.** Ease of use
beats feature count.

## 2. Ground rules

- Stack is fixed: Vite + React + TypeScript (strict), react-konva (2D),
  three / @react-three/fiber / drei (3D), zustand + immer, fuse.js,
  pdfjs-dist, idb-keyval. Also approved: vitest, @playwright/test,
  @anthropic-ai/sdk. **Ask before adding any other library.**
- Millimetres internally. Plan y points down (from the rear of the house to
  the front). Show units with `formatLength` / `parseLength` in
  `src/model/units.ts`.
- Write all UI text in plain language. No "node", "mesh" or "vertex" in the
  UI. Every number she sees is editable. Hit targets are at least 44 px.
- Data model: `src/model/types.ts` follows the brief exactly. Any new field
  is marked `EXTENSION:` with a comment saying why.
- Every edit goes through the store (`editLevel`, `commit`, or gestures for
  drags), so it can be undone and is saved automatically.
- Each change comes with unit tests for its logic and a Playwright test for
  its main flow. `npx tsc -b`, `npx vitest run` and
  `npx playwright test --trace off` must all pass before you commit.
- Commit messages end with the two attribution lines used in `git log`.
  Never push unless the brief tells you to; the lead agent pushes.
- Agents run on Sonnet 5.5 with fresh context. Run at most two at a time.

## 3. Map of the code

| Folder | What lives there | Start with |
| --- | --- | --- |
| `src/model` | Types, store (zustand + immer patches), undo history, units, autosave and file save/open, seed project (private; loaded via `firstRun.ts`), encrypted-seed unlock, schemes ("Options"), paint palette, wall faces, saved colour schemes (`finishSchemes.ts`) | `types.ts`, `store.ts` |
| `src/geometry` | Wall graph, mitred joints, room detection, dimensions, snapping, openings rules and edits, calibration | `wallGraph.ts`, `rooms.ts`, `openings.ts` |
| `src/catalogue` | 84 items as data, shape helpers, state sizes, footprints, `obstacleRects`, parametric builders (bookcase surround), colours | `items.ts`, `data/*`, `catalogue.ts` |
| `src/editor2d` | Konva canvas, layers, tools for each mode, hit testing, `canvasApi` bridge (also used by tests) | `PlanCanvas.tsx`, `tools/*` |
| `src/rules` | 23 layout rules (one file per group in `groups/`), engine, fixers | `registry.ts`, `engine.ts` |
| `src/view3d` | 3D scene, wall profiles with holes, walk physics, materials and finishes | `View3D.tsx`, `sceneBuild.ts` |
| `src/advice` | Optional Claude API client (`claude-opus-5-5`, key kept in the browser): advice and describe-a-piece | `claudeAdvice.ts`, `describeItem.ts` |
| `src/report` | Report a problem: address priority, console ring buffer, details, mailto builder | `report.ts`, `address.ts` |
| `src/ui` | Panels, mode bar, inspector, dialogs, tour, shortcuts, options | `App.tsx`, `Inspector.tsx`, `inspector/*` |
| `e2e` | One Playwright spec per phase or feature | Load the app with `?notour` |
| `assets` | Agent's floorplan, brochure, listing photos (**private**, see §5) | |

Conventions that are easy to get wrong:

- **Walls** are centrelines between shared nodes. Labels show the inside
  face. Openings use `offset` measured from node `a`.
- **Items:** `pos` is the centre of the item in its base state. Front faces
  local +z (down the screen at 0°). Rotation is clockwise. Other states
  (such as a deployed Murphy bed) keep the back edge fixed.
- **3D:** levels share one plan frame and are stacked at their `elevation`.
  Inactive options are hidden through `activeLevelsResolved()`.
- **Rules** apply when the catalogue item's `rules` list contains the rule
  id.
- **Test hooks:** `window.__flatplan` gives `store`, `canvas` and
  `skipTour`; `window.__flatplan3d` exists in dev builds only.

## 4. How to run things

```bash
npm install
npm run dev                          # http://localhost:5173 (?notour skips the tour)
npx tsc -b && npx vitest run         # types + unit tests
npx playwright test --trace off      # e2e; PW_PORT=5191 if 5173 is taken
npm run build                        # static site in dist/
VITE_PUBLIC_BUILD=1 npm run build    # public build: empty start, no seed (see §5)
```

- **Chromium** is preinstalled; do not run `playwright install`.
- **Worktrees:** in a git worktree, copy `node_modules` with
  `cp -al ../../node_modules .`. A symlink breaks Vite's PDF worker path.
- **3D e2e** is slow the first time while three.js loads. Allow 30 s.

## 5. Hosting and the preview link

- **Preview:** the private preview is a claude.ai artifact at
  https://claude.ai/artifact/9ysqKNEzu1cCQavV62tr3R (the lead agent publishes
  it). That viewer blocks downloads and calls to other sites, so saving a
  file, PNG export and Ask Claude only work locally or when hosted. To
  publish, the built JS must have control characters and U+FFFD escaped (see
  the Log).
- **GitHub Pages (built, not yet live):** https://david89it.github.io/3dtool/
  is a **public** site that starts empty. `.github/workflows/pages.yml` runs
  on every push to `claude/flat-planner-brief-o4stwd` and on manual dispatch:
  `VITE_PUBLIC_BUILD=1 npm run build`, then `scripts/encrypt-seed.mjs` writes
  `dist/seed.enc`, then the Pages deploy. The Balmore seed, the floorplan
  crops and the "measure me" notes exist only inside `seed.enc`, encrypted
  with the repository secret `SEED_PASSWORD`; visitors unlock it with
  *File → Open our flat…* (`src/model/seedCrypto.ts`, `src/ui/UnlockDialog.tsx`).
  **Owner steps:** add the secret `SEED_PASSWORD` (a long passphrase) and set
  Settings → Pages → Source to GitHub Actions. Without the secret the site
  publishes with no unlock option. Optional third step: add the secret `REPORT_EMAIL`
  (where *Report a problem* emails go); it is written only inside `seed.enc`.
- **Privacy:** `assets/` and the seed contain the flat's address, plan and
  photos. They must never reach a public build: the seed is loaded only
  through `createStartProject()` in `src/model/firstRun.ts`, behind the build
  flag. After any change to boot or seed code, build with the flag and grep
  `dist/` for "Balmore", "N19" and "floorplan-bleuplan". Never commit a
  `seed.enc` or a password.

## 6. State

**Done (on `claude/flat-planner-brief-o4stwd`, pushed):**

- Brief phases 1–6: trace, openings, furniture, rules and advice, 3D walk,
  tour, shortcuts, options, touch.
- iPad and keyboard fixes from `UX_REVIEW.md`: under 1000 px the details panel opens on selection
  (on pointer-up, not during a drag) and closes on deselect; every `role="dialog"` takes focus, traps Tab
  and returns focus (`useWindowFocus` in `ui/useDialogEsc.ts`, called once from `App`); Esc on a window no
  longer deselects (`keyWasForWindow`); measure-note length and plan image rotation are click-to-type, one-size
  items say "one size"; at 1100 px and under the top chrome is two rows (name and floors, then modes and
  everyday buttons) with Versions, Budget, units, Report, Shortcuts and Settings under "More", and the tool
  hint has its own strip under the plan. Tests: `e2e/ipad-ux.spec.ts`.
- Clearer opening placement: explains full walls and fits openings into
  leftover space.
- Bookcase surround that frames an opening, a colour for each item,
  Japanese bath, and footprints for each part (aae34b5).
- Site measure (`src/sitemeasure`, its UI state in `state.ts`, not the
  store), the LiDAR app guide, and scan import (`src/import`): RoomPlan
  USDZ/USDA/USDC via three's `USDLoader`, and DXF as `Level.vectorUnderlay`
  with snapping to its line ends.
- GitHub Pages workflow, public build mode and the encrypted seed (see §5).
- Versions: named saves, automatic snapshots before big changes, restore with
  a safety copy, plain-language change lists, history optionally inside a
  saved copy (`src/model/versions.ts`, `diffProjects.ts`,
  `src/ui/VersionsPanel.tsx`; `store.snapshotBefore(reason)`).
- Engineer and landlord pack: File → *Print or save as PDF…* (`src/print`),
  notes on the plan (`Level.notes`, `src/model/notes.ts`, Trace panel *Notes*),
  `canvasApi.renderLevelImage`, and the structural badge shrunk to a ⚠ pin
  (`src/editor2d/pins.ts`).
- Materials and paint: a 32-colour palette plus any hex (`src/model/palette.ts`,
  `src/ui/PaintGrid.tsx`), paint per wall face (`Wall.faces`, click a wall in
  3D or use the 2D wall panel), ceiling colour, woodwork colour with skirting
  and door frames, five new floors, and saved colour schemes keyed by room
  name (`Project.schemes`, `src/model/finishSchemes.ts`).

- Add an object by description or image link (`src/advice/describeItem.ts`
  and `describeModel.ts`, `src/ui/DescribeItemBox.tsx`): Claude returns a sized,
  coloured item built from the closest catalogue shape, saved in
  `catalogueOverrides` as `ai-…` with `CatalogueItem.tint` and `.source`.

- Costs and shopping list: price, shop, link and status on each piece,
  paint and flooring quantities per room, Budget panel (£ button, File menu),
  copy as a list, CSV, and a Budget page in the print pack
  (`src/model/costs.ts`, `costEdits.ts`, `src/ui/BudgetPanel.tsx`,
  `Project.costSettings`).
- Real sun and sun hours (`src/view3d/sun.ts`, `sunHours.ts`, `sunState.ts`,
  `SunRig.tsx`, `SunPanel.tsx`): real sun for N19 by date and time in London
  time, play the day, dusk and night, a sun-hours table per room for four
  dates, and an optional floor heatmap. `PLAN_UP_BEARING` in `sun.ts` is the
  one number to correct with a compass at the flat. Neighbours are not modelled.

- UI batch part A: collapsible side panels (`[` and `]`, remembered, overlays
  under 1000 px: `ui/layoutState.ts`, `PanelSlot.tsx`), right-click and
  long-press menu on the plan (`editor2d/contextMenu.ts`, `contextActions.ts`,
  `ContextMenu.tsx`), undo history list (`ui/UndoHistory.tsx`, `historyRows` in
  `model/history.ts`), room views (frame in 2D and 3D, walk in here:
  `ui/roomViews.ts`, `roomViewBridge`). No store changes.

- UI batch part B: multi-select in Furnish (Shift-click, Shift box, touch
  long-press then drag; `Selection` kind `items`), groups (`Level.groups`,
  `src/model/groups.ts`, `editor2d/selectionActions.ts`, `ui/MultiPanel.tsx`),
  align and space evenly, and Ctrl/⌘ K search (`ui/searchIndex.ts`,
  `CommandPalette.tsx`, `paletteCommands.ts`). Pieces in groups follow options
  (`cloneLevel`) and show in the versions change list.

- Pack follow-ups: *Compare with* a saved version in the print view
  (`src/print/compare.ts`): walls removed, new, widened and removed openings,
  structural wording, dashed red ghost walls on floor plans
  (`renderLevelImage` option `ghostWalls`), and 3D per floor, with before and
  after for changed floors, from an off-screen renderer
  (`src/view3d/Offscreen3D.tsx`, `renderOverview3D` in `captureBridge.ts`).

- Report a problem (`src/report/*`, `src/ui/ReportDialog.tsx`): top bar button, File menu, Ctrl/⌘ K
  and the error screen; email link under 1800 characters plus *Copy everything* and picture copy or
  download; the address comes from Settings (per browser) or `Project.reportTo`, set only by the
  encrypted seed from the `REPORT_EMAIL` secret. `noAddress.test.ts` keeps addresses out of the repo.

- Safety batch: "Save a copy" reminder (`model/copyReminder.ts`, `ui/CopyReminder.tsx`), one editor tab
  at a time with an overlay and "Use this tab" (`model/tabOwnership.ts`, `tabLock.ts`, `ui/TabOverlay.tsx`),
  Settings → Recovered backups (`model/backups.ts`, `ui/RecoveredBackups.tsx`), and `nodePos` no longer throws
  (`findNodePos`, `findWallEnds`, `wallEnds` degrade to zero length). `e2e/safety.spec.ts`.

**In flight:** none.

**Blocked:**

- **Pinterest import:** the "home" board is secret, so signed-out access
  gets a 404. Two ways forward: the owner makes it public, or sends images
  in folders per room or the pin links. The scraper is ready in the
  worktree branch `worktree-agent-a5b0b6a35de7f154a`
  (`scripts/pinterest-scrape.mjs`, uncommitted). Never sign in with the
  owner's account.

**Next, in order:**

1. Site visit: type in the numbers marked ≈ (loft knee wall height, pitch, flat ceiling height, loft
   outline and ridge direction; chimney breast sizes). Everything else for the loft and chimneys is built.
**Backlog (tracked, not scheduled):**

- From `UX_REVIEW.md`: no P2 items left except keys 1 to 5 for the modes and the P3 polish list.

**Parked:** path-traced photo render, dark mode, electrics layer,
side-by-side compare, live Pinterest sync, fps meter.

**Known gaps:**

- Multi-select and groups: the touch route (hold on empty floor then drag, and
  *Add to selection* in the menu) is not tested on a real iPad; Playwright
  covers mouse and keyboard only. Groups are not shown in 3D or the print
  pack, and a group has no outline until selected. Search covers only the
  option of each floor that is showing, and does not look inside notes or
  budget fields.
- Print pack: a wall that is only shortened is not reported as removed;
  ghost walls are plain rectangles (no mitred corners); 3D pictures use simple
  lights, no sun shadows or furniture lights; floors that were added or
  deleted since the version are ignored; the structural pin is not tappable in
  Furnish mode; notes can only be selected in Trace mode.
- Roof slopes: planes from one or two walls only (no hips, dormers or off-axis ridge); the seed loft's outline is copied from the second floor and the ridge direction is a guess; no head collision in walk mode (eye height is clamped, and you cannot step under 1.1 m). The seed's chimney pieces overlap the old solid masses in 3D (same colour).
- Materials: schemes do not include single-face wall paint; a window or door
  between two rooms takes the woodwork colour of the room on the wall's left;
  skirting is straight boxes (no mitres at corners); the face-click path has
  unit tests but no end-to-end click test; paint colours are chosen by eye.
- Wall-hung items follow their wall (`src/model/mounted.ts`), but one on a wall removed by merging corners is detached, and a wide one can overhang the end of a short wall.
- Fire escape rule (`src/rules/escape.ts`) is guidance only: it checks routes through the kitchen and a kitchen that opens onto the stair or hall on the bedrooms' way out (door = info, cased opening = warning), not distances or door ratings. The seed does not warn after opening the kitchen into the reception (its bedrooms leave by the stair, not through the kitchen).
- The building floats in 3D because only the entrance hall is modelled at
  ground level.
- Seed stairs are rough.
- A painted item's white parts (pillows) take its finish.
- Not tested on a real MacBook or iPad.
- UX review leftovers (mode keys 1 to 5, 3D panel as a bottom sheet, other P3 polish): `UX_REVIEW.md`. The tool hint strip needs `:has()` (Safari 15.4+).
- Ask Claude (advice and describe-a-piece) was tested only with a mock; the structured-output reply and URL image blocks have not met the real API. A tinted item has one colour for all its body materials.
- Scan import has not been tried on a real RoomPlan export. Scans line up
  only by their top-left corner. The site-measure checklist is long (192
  steps on the seed) and its progress is saved per browser.

## 7. Brief template for a new agent

Copy this and fill it in. Keep it self-contained, because the agent has no
other context.

```
Read HANDOVER.md, then only these files: <list>.
Goal: <one sentence, user-facing outcome>.
Build: <numbered, concrete behaviour; data-model extensions allowed: <list>>.
Do not touch: <files/areas another agent owns>.
Done when: <tests to add>; `npx tsc -b`, `npx vitest run`, `npx playwright test --trace off` pass.
Update README (usage) and DECISIONS.md (assumptions). Commit with the attribution lines; do not push.
Report in under 300 words: commit hash, what works, model/store changes, known gaps.
```

## 8. Log (newest first, one line each)

- 2026-11-27 · refactor · No behaviour change. Split the big files: rules registry into `rules/groups/*`, Inspector into `ui/inspector/*`, ItemPanel into `ui/itempanel/*`, PlanCanvas into hooks and parts in `editor2d/canvas/*`, PrintPack into `print/pages/*` plus `usePackState.ts`, TopBar into `ui/topbar/*`, Budget tabs into `ui/budget/*`, catalogue data into `catalogue/data/*`, persistence into `savedProject`/`autosave`/`projectFile`, versions into `versionImages`/`versionJobs`, seed builders into `seedBuild`. Removed unused functions. Version jobs (`runJob`, `autoSnapshot`...) now import from `model/versionJobs`. Map: `docs/architecture.md`.
- 2026-11-27 · ux-context · Floating toolbar by the selection (`editor2d/SelectionToolbar.tsx`, `selectionAnchor.ts`), "Removed x · Undo" toast for every Remove/Delete step (`store.ts` `deletedWording`, `Toast.action`), mode-aware empty floor with a Draw walls button (`EmptyPlan.tsx`), one-line hint that follows the tool and selection (`toolHint.ts`, `ToolHint.tsx`), two-row top bar up to 1600 px. Findings: `docs/ux-review.md`; tests `selectionAnchor.test.ts`, `toolHint.test.ts`, `e2e/contextual-ui.spec.ts`.
- 2026-11-27 · render · 3D look: environment-map lighting, textured PBR materials, sky haze, Fast/Beautiful quality (`quality.ts`; Beautiful adds GTAO ambient occlusion in `postfx.tsx`, 4096 soft shadows, rounded furniture), *Save a photo* (`Photo.tsx`, `QualityPanel.tsx`). Review and screenshots in `docs/render-review.md`.
- 2026-11-26 · ipad-ux · Details panel on selection under 1000 px, window focus trap and Esc fix, typeable note length and image rotation, two-row top chrome with a More menu at 1100 px and under; `e2e/ipad-ux.spec.ts`.
- 2026-11-26 · loft · Sloped ceilings (`Room.slopes`, `geometry/roof.ts`, `RoofLayer`, room panel *Sloped ceiling*,
  3D ceiling planes and cut walls in `sceneBuild.ts`, walk eye clamp in `walkPhysics.ts`/`WalkRig.tsx`,
  `loft-headroom` reads the real height), seed Loft with walls and estimated slopes, Chimney breast item
  (`measureNote`, `PlacedItem.estimated`) placed on the seed, fire-escape note for a kitchen opening onto the
  stairs (`kitchensOntoRoute`). Tests `roof.test.ts`, `chimney.test.ts`, `escape.test.ts`, `e2e/loft.spec.ts`.

- 2026-11-26 · safety · Copy reminder, single editor tab (BroadcastChannel hand-over, flush before release, reload from
  storage), Recovered backups in Settings, `nodePos` made safe; tests `copyReminder`, `tabOwnership`, `backups`,
  `wallGraph`, `e2e/safety.spec.ts`. See DECISIONS.
- 2026-11-26 · fire-escape · Rule `fire-escape` (room graph through doors, openings and stairs; `escape.ts`, `escape.test.ts`), `Opening.isEntrance` ("Front door of the flat"), `on` switch in Settings; wall-hung items follow wall/node moves, thickness and splits (`model/mounted.ts`, `mounted.test.ts`).
- 2026-11-20 · report · Report a problem by email: `src/report` (address priority, console ring buffer
  installed first in `main.tsx`, details, `buildMailto` capped at 1800 characters), `ReportDialog`,
  Settings → Problem reports go to, `Project.reportTo` from the `REPORT_EMAIL` secret via
  `encrypt-seed.mjs`, version injected by Vite `define`, `report.test.ts`, `noAddress.test.ts`,
  `e2e/report.spec.ts`.
- 2026-11-20 · ux-review · UX pass over every mode and window at 1440, 1024 and
  768 wide: top bar wraps, File menu closes on a tap outside, Esc closes every
  window (`ui/useDialogEsc.ts`), 44 px everywhere, about 80 tooltips, one word
  per thing (item, plan image, colour scheme: see DECISIONS), focus ring,
  `e2e/ux-audit.spec.ts`. Remaining issues in `UX_REVIEW.md`.
- 2026-11-20 · review · Stability and performance review (`CODE_REVIEW.md`): `model/repair.ts`
  repairs damaged plans on load, start-up never replaces a plan it could not read, autosave saves
  after drags and retries, error boundaries (`ui/ErrorBoundary.tsx`), memoised plan layers, lazy
  panels, `.github/workflows/test.yml`, `scripts/perf-browser.mjs` (dev server) and `src/perf.ts`
  render counters.
- 2026-11-11 · pack-2 · Compare with a version in the print view
  (`print/compare.ts`, `compare.test.ts`, `state.ts` remembers the choice),
  removed walls on cover and structural page, ghost walls in `renderLevel.tsx`,
  per-floor and before/after 3D from `view3d/Offscreen3D.tsx` (the old
  `SnapshotRig` is removed), e2e in `printpack.spec.ts`.
- 2026-11-11 · ui-b · Multi-select and groups (`Selection` kind `items`,
  `Level.groups`, `model/groups.ts`, `selectionActions.ts`, `MultiPanel`),
  align and space evenly, Ctrl/⌘ K search (`searchIndex.ts`, `CommandPalette`),
  `groups.test.ts`, `searchIndex.test.ts`, `e2e/groups.spec.ts`.
- 2026-11-11 · ui-a · Collapsible panels, plan context menu (right-click and
  500 ms long press), undo history list, room views (frame, walk in here),
  `e2e/uibatch.spec.ts`; closed a missing `}` in `styles.css`.
- 2026-11-11 · costs · Budget and shopping list: `PlacedItem.price/supplier/link/status`,
  `Project.costSettings`, `CatalogueItem.price`, `src/model/costs.ts` (paint,
  flooring, totals, CSV, text), Budget panel, Cost section in the item panel,
  Budget page in the print pack, `e2e/budget.spec.ts`. Defaults are rough UK
  figures.
- 2026-11-11 · sun · Real sun for N19 (`sun.ts` NOAA maths, London time via
  Intl, `PLAN_UP_BEARING`), Daylight panel with dates, time slider and play,
  dusk and night, shadow camera fitted to the floors in view, sun hours per
  room (`sunHours.ts`, raycasts in time slices) and floor heatmap, `sun.test.ts`,
  `sunHours.test.ts`, `e2e/sun.spec.ts`.
- 2026-11-10 · describe · Add a piece by description or image link
  (structured outputs, `describeModel.ts` pure half, `DescribeItemBox`,
  `tint` and `source` on `CatalogueItem`, "Your items" group, `e2e/describe.spec.ts`
  with the API mocked).
- 2026-11-10 · materials · Palette (`src/model/palette.ts`), `Wall.faces`,
  `Room.ceilingFinish/woodworkColor`, `Project.schemes`, skirting and door
  frames in `sceneBuild.ts`, tabs and schemes in `FinishPanel.tsx`, 2D
  "Paint" in the wall panel, `e2e/materials.spec.ts`. Fixed a missing `}` in
  `styles.css` that left everything after `.check-row input` unstyled.
- 2026-11-10 · versions · Named and automatic versions in IndexedDB (own keys,
  images stored once by hash), Versions panel (clock button, File menu),
  `diffProjects`, restore with a "Before restoring" copy, history in saved
  copies. Side-by-side compare is still parked.
- 2026-11-10 · pack · Notes on the plan (`Level.notes`), print pack
  (`src/print`, `renderLevelImage`, `captureBridge`), structural pin,
  `e2e/printpack.spec.ts`.
- 2026-11-10 · a07d248 · Live at https://david89it.github.io/3dtool/. The repo
  is public (owner's choice). The build job runs in the `github-pages`
  environment; `seed.enc` is encrypted from the `SEED_PASSWORD` repository
  secret.
- 2026-11-10 · hosting · Public build flag `VITE_PUBLIC_BUILD`, empty first run,
  `scripts/encrypt-seed.mjs` (AES-GCM, PBKDF2) + "Open our flat" unlock,
  `.github/workflows/pages.yml`, `e2e/pages.spec.ts`.
- 2026-11-10 · merge `sitemeasure` (0d0a4f5) · Site measure checklist,
  LiDAR guide, USDZ/DXF import.
- 2026-11-10 · aae34b5 · Bookcase surround (parametric builder,
  `params.gapW/gapH`, Fit to opening), `PlacedItem.finish`, `obstacleRects`,
  `bath-japanese`.
- 2026-11-10 · b1e64ac · Opening placement explains full walls and fits
  narrower openings (`placeOnWall`, `OPENING_MIN_WIDTH`).
- 2026-11-09 · c17c73b · Phase 6: tour, shortcuts, options (schemes), touch,
  3D cut-away.
- 2026-11-09 · 3d0ca0e · Phase 5: 3D and walk (merged from a worktree).
- 2026-11-09 · 060227c · Phase 4 UI: Advice mode, settings, Ask Claude.
- 2026-11-09 · 9a6c942 · Phase 3: furniture. The rules engine was merged
  from a worktree.
- To publish the preview: build, copy `dist/assets`, inline the CSS into the
  page (including the View3D CSS), add a `vite:preloadError` guard, and
  escape `\x00-\x1f` and U+FFFD in JS (the pdf worker and the SDK chunk).
