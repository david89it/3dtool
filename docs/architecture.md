# Architecture

A short map of the code and the habits that keep it easy to change. Start with
`HANDOVER.md` for the product context; this file is about where things live.

## Folders

| Folder | What lives there |
| --- | --- |
| `src/model` | Types (`types.ts`), the zustand store (`store.ts`), undo history, units, schemes, costs, notes, repair of damaged plans. Storage is split by job: `savedProject.ts` (read the stored plan and settings), `autosave.ts` (write as it changes), `projectFile.ts` (save and open files); `persistence.ts` re-exports all three and decides what the app opens on. Version history: `versions.ts` (logic), `versionImages.ts`, `versionJobs.ts` (IndexedDB jobs). Seed project: `seed.ts` with small builders in `seedBuild.ts`. |
| `src/geometry` | Pure maths on plans: wall graph, joints, rooms, openings, dimensions, snapping, roof slopes. No React. |
| `src/catalogue` | Furniture as data. `data/<category>.ts` hold the items, `data/helpers.ts` the shared clearance helpers, `items.ts` joins them into `CATALOGUE`. `parts.ts` (shape helpers), `builders.ts` (parametric items), `catalogue.ts` (lookup, states, footprints). |
| `src/editor2d` | The Konva plan. `PlanCanvas.tsx` owns the state; `canvas/` holds its hooks and pieces (`usePointerHandlers`, `useViewport`, `useCanvasApi`, `PlanStage`, `LabelEditor`, `CalibrationDialog`, `cursor`, `tools.ts` for tool lookup); `tools/` has one handler per tool; `layers/` draws one layer each. |
| `src/rules` | Layout rules. `groups/<group>.ts` hold the rules, `registry.ts` joins them, `types.ts` and `helpers.ts` are shared, `engine.ts` runs them, `fixers.ts` nudges items. |
| `src/ui` | Panels and dialogs. Big panels are folders of one component per section: `inspector/`, `itempanel/`, `budget/`, `topbar/`. The top-level file (`Inspector.tsx`, `ItemPanel.tsx`, `BudgetPanel.tsx`, `TopBar.tsx`) only chooses and composes. |
| `src/print` | The engineer and landlord pack. `PrintPack.tsx` composes; `usePackState.ts` has the data hooks; `pages/` is one component per page; `pack.ts` and `compare.ts` are pure logic. |
| `src/view3d` | 3D scene, walk physics, finishes. |
| `src/advice`, `src/report`, `src/import`, `src/sitemeasure` | Optional Claude advice, report-a-problem, scan and DXF import, on-site measuring. |
| `e2e` | One Playwright spec per feature. |

## Conventions

- **File size.** Aim for under about 300 lines per file and under about 80
  lines per function or component. Data files (catalogue) are the exception,
  but keep them one category each. When a file grows past that, split it by
  job, not by line count.
- **Small blocks.** A component renders one thing. Logic that is not about
  drawing goes in a hook (`useX.ts`) or a plain function next to it. Pure
  logic (maths, formatting, diffing) belongs in `geometry/`, `model/` or a
  `*.ts` file with a unit test, not in a component.
- **Public import paths stay stable.** When you split a file, either keep the
  old file as the entry that composes or re-exports, or update every import.
  `model/persistence.ts` and `rules/registry.ts` are examples.
- **Tests and test IDs.** Do not rename `data-testid` values or UI text in a
  refactor. `npx tsc -b && npx vitest run` after every step, the full
  Playwright run before finishing.
- **Dead code.** Search with grep (src, e2e, scripts) before removing an
  export. Prefer deleting to commenting out.

## Where new things go

- **A layout rule.** Add an entry to the right file in
  `src/rules/groups/` (or a new group file, then add it to `registry.ts`).
  List its id in the `rules` of the catalogue items it applies to. Add a
  passing and a failing case to `src/rules/rules.test.ts`. See README "How to
  add a rule".
- **A catalogue item.** Add it to the category file in
  `src/catalogue/data/`. Use `bedItem` / `kitchenItem` and the clearance
  helpers from `data/helpers.ts` where they fit. See README "How to add a
  catalogue item".
- **An inspector section.** A new component in `src/ui/inspector/` (walls,
  rooms, notes, markers, the floor panel) or `src/ui/itempanel/` (placed
  items), then render it from the parent file.
- **A page in the print pack.** A component in `src/print/pages/` that takes
  the `PackModel` (`pages/model.ts`), then add it to `PrintPack.tsx`.
- **A canvas behaviour.** A new tool goes in `src/editor2d/tools/` and in the
  table in `canvas/tools.ts`. Pointer, wheel or keyboard handling goes in a
  hook in `src/editor2d/canvas/`, not back into `PlanCanvas.tsx`.
- **A top-bar button.** `src/ui/topbar/`.
- **Layouts (alternatives of a floor).** Pure helpers in `src/model/layouts.ts` (on top of `schemes.ts`); the pill, compare view and their actions in `src/ui/layouts/`.
- **A saved-data change.** Types in `model/types.ts` (mark new fields
  `EXTENSION:`), repair in `model/repair.ts`, and a test.

## Still large

Files or functions still over the guide, kept because they are cohesive:
`model/costs.ts`, `model/store.ts`, `editor2d/guides.ts`,
`editor2d/layers/OverlayLayer.tsx` (each 370 to 425 lines), and a few long
JSX components (`VersionsPanel`, `ReportDialog`, `OpeningPanel`,
`SiteMeasure`, `FurnishPanel`, `topbar/FileMenu`, `usePointerHandlers`). Split
them along the same lines when you next change them.
