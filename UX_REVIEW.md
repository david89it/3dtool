# UX review

Review of the whole app for a designer who works mostly on a MacBook and an
iPad. Done in a real browser (Playwright with the preinstalled Chromium) at
1440 x 900, iPad landscape 1024 x 768 and iPad portrait 768 x 1024 (with touch).
Not tried on a real iPad or MacBook.

## What was checked

- **Every mode** (Trace, Openings, Furnish, Advice, 3D), with nothing selected
  and with a wall, an opening, a note, one item and several items selected.
- **Every window and menu:** Settings, Versions (empty, saving, saved), Budget
  (three tabs), Print or save as PDF, Measure on site, Import a scan, the scan
  guide, Shortcuts, Search (Ctrl/⌘ K), the File menu, the Options menu, the undo
  list, the right-click menu, the tour, the Add your own item window.
- **Hit sizes:** a script measured every visible button, input, select and
  role=button/menuitem/radio/tab in each of those states and listed the ones
  under 44 px.
- **Names:** every `<button` in `src/ui`, `src/view3d`, `src/print`,
  `src/sitemeasure`, `src/import` and `src/editor2d` was listed with and without
  `title` and `aria-label` (179 buttons), and the same check ran on the live
  page.
- **Words:** about 1,800 user-visible strings were extracted and searched for
  jargon (node, edge, vertex, mesh, underlay, polygon, JSON...) and for two
  names for one thing.
- **Contrast:** the computed text colour against the real background for every
  visible text node in 13 screens (WCAG AA: 4.5 for normal text, 3 for large).
  Everything passed except the amber "?" pin glyph (2.9), now fixed.
- **Layout:** horizontal overflow and anything outside the window at each
  size, dialogs fitting and scrolling at 768 wide.
- **Console:** no errors in any screen. Only warnings from the libraries:
  `THREE.Clock` is deprecated, and a WebGL "GPU stall due to ReadPixels"
  message.
- **Keyboard:** Esc and click outside for every window and menu.

The new test `e2e/ux-audit.spec.ts` repeats the size, name, tooltip, Esc and
overflow checks at all three sizes (9 tests).

## What was fixed

### Bugs

- **Top bar ran off the screen** under about 1500 px: at 1440 the last floor tab
  was cut off ("Lc"), at 1024 floor tabs shrank to "Groun", and at 768 the
  Settings and File buttons were outside the window and the whole app shifted
  sideways in 3D. It now wraps (floors and Options on a second row) and shows
  only arrows on Undo and Redo at 900 px and under. `ui/styles.css`,
  `ui/TopBar.tsx`, `ui/UndoHistory.tsx`.
- **File menu never closed on an iPad** (it closed when the mouse left, which a
  finger never does) and had no Esc. It now closes on a tap outside or Esc.
  `ui/TopBar.tsx`, `ui/useDialogEsc.ts` (new, `useDismiss`).
- **Esc did not close** Settings, Measure on site, Import a scan, the scan guide,
  Open our flat or Add saved versions unless the focus happened to be inside
  them. All now close on Esc, topmost first. `ui/useDialogEsc.ts` (new),
  `SettingsDialog.tsx`, `sitemeasure/SiteMeasure.tsx`, `sitemeasure/ScanGuide.tsx`,
  `import/ScanImport.tsx`, `ui/UnlockDialog.tsx`, `ui/VersionsPanel.tsx`.
- **Options menu** opened off the right edge at 768 wide: it now opens leftwards
  from its button and closes on Esc. `ui/OptionSwitcher.tsx`, `ui/styles.css`.
- **Advice mode** showed the Trace hint ("Click a wall to edit it..."). It now
  explains the problem list. `editor2d/PlanCanvas.tsx`.

### Hit targets (all now 44 px or more)

`ui/styles.css`: mode buttons (40), small buttons (36), Furnish category chips
(36, and "All" was 37 wide), remove-custom (36), plan image opacity and rotation
sliders (32), the dismiss cross on messages (36), `view3d/view3d.css`: date and
daylight chips (40), the date, time and sun sliders (32). New rule: ranges, date
and time fields and select lists are 44 px. Undo and Redo keep 44 px wide when
only their arrows show.

### Names and tooltips

About 80 tooltips added, each saying what happens and the shortcut when there is
one (for example "Undo (Ctrl/⌘ Z)" was already there; now "Turn 90° right (R)",
"Make a copy of this item (Ctrl/⌘ D)", "Close the budget (Esc)"). Files:
`TopBar` (floor tabs, m and ft with plain aria-labels, Settings, File), `ModeBar`
(all five modes, with the shortcut for 3D), `ItemPanel`, `MultiPanel`,
`OpeningPanel`, `Inspector`, `LeftPanel`, `FurnishPanel`, `AdvicePanel`,
`BudgetPanel`, `SettingsDialog`, `VersionsPanel`, `Shortcuts`, `Toasts`, `Tour`,
`UnlockDialog`, `CustomItemDialog`, `DescribeItemBox`, `PaintGrid`, `FinishPanel`,
`SunPanel`, `View3D`, `PrintPack`, `ScanGuide`, `ScanImport`, `SiteMeasure`,
`PlanCanvas`. The two "Turn 90°" buttons looked identical (two arrows); they now
read "↺ 90° left" and "↻ 90° right".

### Plain language (see DECISIONS.md, "UX review")

- "piece(s)" became "item(s)" (about 20 strings: selection panel, search, shortcuts,
  describe box, toasts, errors, 2D labels) and the matching tests.
- "plan picture" and "floorplan picture" became "plan image" (Versions change
  list, scan import, scan guide, tour, restore toast).
- "scheme" became "colour scheme" in the 3D Colour panel so it cannot be
  confused with an Option.
- "Download CSV" became "Download as spreadsheet (CSV)", "Print / Save as PDF"
  became "Print or save as PDF" (same as the File menu), the Furnish search
  placeholder no longer gets cut off, an aria-label "Item state" became
  "Position" (the visible word).

### Consistency and polish

- A focus ring (2 px blue) for every focusable thing; before, only some had one.
- Amber "?" pin colour darkened to pass contrast.
- Pop-up lists (`select`) have the same border and radius as the other fields,
  including the "Compare with" list in the print view.

## Fixed since (iPad and keyboard pass)

P2 items 1 to 4 and P3 items 1 and 2 below are fixed (`e2e/ipad-ux.spec.ts`): details panel opens on
selection under 1000 px (on pointer-up) and closes on deselect; windows take focus, trap Tab and give
focus back (`useWindowFocus`); Esc on a window leaves the selection; measure-note length and plan image
rotation are click-to-type and one-size items say "one size"; at 1100 px and under the chrome is two
rows with a "More" menu, and the hint sits in its own strip under the plan.

## Remaining issues

### P1: broken

None found. Nothing errors in the console, no control failed to respond, and no
screen overflows sideways at the three sizes.

### P2: confusing

1. **(Fixed) Under 1000 px (iPad upright) selecting something shows nothing.** Both side
   panels start closed, so tapping an item or a wall does not show its details
   until she taps the "Details" rail. `ui/layoutState.ts` and `ui/App.tsx`:
   open the right panel when something is selected on a narrow screen (and
   close it on deselect).
2. **(Fixed) Windows do not take the focus and do not keep it.** Tab can reach the plan
   behind a window. `ui/SettingsDialog.tsx`, `VersionsPanel.tsx`, `BudgetPanel.tsx`
   and others: focus the window when it opens, trap Tab inside it, give the
   focus back to the button that opened it.
3. **(Fixed) Some numbers cannot be clicked and typed.** "Turned 0°" for an item
   (`ui/ItemPanel.tsx`), the length of a measure note (`ui/Inspector.tsx`),
   the plan image "Rotate 0°" (`ui/LeftPanel.tsx`, slider only), and the height of
   items that come in one size (shows plain text, tooltip only). Suggested fix:
   use `EditableLength` (or a small angle field) for the first three and a
   visible note "One size" for the last.
4. **(Fixed) Esc closing a window also deselects what is selected on the plan**,
   because the plan listens for Esc too (`ui/App.tsx`, `useShortcuts`). Ignore
   Esc there while a window is open.
5. **No shortcuts for the modes** except Tab for 3D. Suggested: keys 1 to 5
   (`ui/App.tsx`), shown in the mode tooltips.

### P3: polish

1. **(Fixed) Three rows of top chrome upright on an iPad** (two top bar rows and the
   mode bar, about 165 px). Suggest putting the mode buttons on the floors row
   at 768 px and under (`ui/TopBar.tsx`, `ui/ModeBar.tsx`).
2. **(Fixed) The hint at the bottom left of the plan** runs to three lines at 768 and
   sits on top of the plan labels. Suggest a narrower width with a soft
   background, or a dismissible chip (`.tool-hint` in `ui/styles.css`).
3. **3D panel takes 320 px of 768** upright. Suggest a bottom sheet under 900 px
   (`view3d/view3d.css`).
4. **Disabled buttons use 40 % opacity**, which fails AA contrast (disabled
   controls are exempt, but Undo and Redo are always on screen and look
   faint). Suggest a grey text colour with full opacity (`.btn:disabled`).
5. **Tab semantics:** the Furnish categories, Budget tabs and Colour tabs use
   `role="tab"`; the first two have no panel link (`aria-controls`). Cosmetic for
   screen readers (`FurnishPanel.tsx`, `BudgetPanel.tsx`).
6. **Library warnings in the console:** `THREE.Clock` is deprecated (three and
   drei); update when the libraries do. WebGL "GPU stall" is from the capture of
   the picture for the print pack.
7. **Windows with typed input** (Add your own item, Open our flat, Add saved
   versions) do not close on a tap outside. This is on purpose (nothing lost by
   accident); an "unsaved changes" check would let them close like the others.
8. **Button markup:** some `title` attributes were added in front of the other
   attributes (`<button title="..." className=...>`) rather than after; tidy with
   a formatter when one is added to the project.
9. **Not tested on real hardware:** Apple Pencil, long press and the two-finger
   gestures. Playwright's touch is a close but not exact stand-in.
