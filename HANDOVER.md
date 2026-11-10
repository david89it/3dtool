# Handover

The one document to read before working on Flat Planner. It is kept short on
purpose: read this, then only the files your task names. Update the
"State" and "Log" sections at the end of every piece of work.

Last updated: 2026-11-10, after the engineer and landlord pack.

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
| `src/model` | Types, store (zustand + immer patches), undo history, units, autosave and file save/open, seed project (private; loaded via `firstRun.ts`), encrypted-seed unlock, schemes ("Options") | `types.ts`, `store.ts` |
| `src/geometry` | Wall graph, mitred joints, room detection, dimensions, snapping, openings rules and edits, calibration | `wallGraph.ts`, `rooms.ts`, `openings.ts` |
| `src/catalogue` | 84 items as data, shape helpers, state sizes, footprints, `obstacleRects`, parametric builders (bookcase surround), colours | `items.ts`, `catalogue.ts` |
| `src/editor2d` | Konva canvas, layers, tools for each mode, hit testing, `canvasApi` bridge (also used by tests) | `PlanCanvas.tsx`, `tools/*` |
| `src/rules` | 22 layout rules (one registry file), engine, fixers | `registry.ts`, `engine.ts` |
| `src/view3d` | 3D scene, wall profiles with holes, walk physics, materials and finishes | `View3D.tsx`, `sceneBuild.ts` |
| `src/advice` | Optional Claude API client (`claude-opus-5-5`, key kept in the browser) | `claudeAdvice.ts` |
| `src/ui` | Panels, mode bar, inspector, dialogs, tour, shortcuts, options | `App.tsx`, `Inspector.tsx` |
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
  publishes with no unlock option.
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
- Clearer opening placement: explains full walls and fits openings into
  leftover space.
- Bookcase surround that frames an opening, a colour for each item,
  Japanese bath, and footprints for each part (aae34b5).
- Site measure (`src/sitemeasure`, its UI state in `state.ts`, not the
  store), the LiDAR app guide, and scan import (`src/import`): RoomPlan
  USDZ/USDA/USDC via three's `USDLoader`, and DXF as `Level.vectorUnderlay`
  with snapping to its line ends.
- GitHub Pages workflow, public build mode and the encrypted seed (see §5).
- Engineer and landlord pack: File → *Print or save as PDF…* (`src/print`),
  notes on the plan (`Level.notes`, `src/model/notes.ts`, Trace panel *Notes*),
  `canvasApi.renderLevelImage`, and the structural badge shrunk to a ⚠ pin
  (`src/editor2d/pins.ts`).

**In flight:** none.

**Blocked:**

- **Pinterest import:** the "home" board is secret, so signed-out access
  gets a 404. Two ways forward: the owner makes it public, or sends images
  in folders per room or the pin links. The scraper is ready in the
  worktree branch `worktree-agent-a5b0b6a35de7f154a`
  (`scripts/pinterest-scrape.mjs`, uncommitted). Never sign in with the
  owner's account.

**Next, in order** (see the plan in the conversation of 2026-11-10):

1. Hosting: the owner adds the `SEED_PASSWORD` secret and turns on Pages,
   then check the live site once (see §5).
2. Versions: named saves, restore, snapshots before big changes; compare
   later.
3. Pack follow-ups: before and after 3D (needs versions), detect removed
   walls (needs a "before" to compare), 3D views per floor.
4. Materials and paint: per wall face, ceiling and woodwork, a palette, more
   floors, saved schemes.
5. Real sun for N19: date and time, sun hours per room.
6. Add an object by description or image link (Claude; needs hosting and a
   key).
7. Costs and shopping list.
8. Sloped loft ceiling and chimney-breast objects (after the site visit).
9. UI batch: collapsible panels, context menu, multi-select and groups,
   ⌘K, room views, undo history list.

**Parked:** path-traced photo render, dark mode, electrics layer,
side-by-side compare, live Pinterest sync, fps meter.

**Known gaps:**

- Print pack: no removed-wall detection (no "before" state); the 3D picture
  is the last overview shown, not one per floor; the structural pin is not
  tappable in Furnish mode; notes can only be selected in Trace mode.

- No roof slope model.
- Wall-hung items don't follow their wall when it moves.
- The building floats in 3D because only the entrance hall is modelled at
  ground level.
- Seed stairs are rough.
- A painted item's white parts (pillows) take its finish.
- Not tested on a real MacBook or iPad.
- Ask Claude was tested only with a mock.
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
