# UX review: contextual UI pass

Walked as the designer would, at 1440x900, 1180x820 and 820x1180 (iPad, touch): open our flat, add a sofa,
move and turn it, select a wall, draw a wall, blank floor, Furnish and Openings with nothing drawn.
Earlier, wider review: `UX_REVIEW.md` (sizes, names, jargon, contrast).

## Findings, most important first

**P1 (done)**
1. Nothing floated next to a selection. Turning, copying and deleting meant looking away to the side panel
   (or knowing R and Ctrl/Cmd D). Now a small toolbar sits by the selected piece, wall, opening or note and
   shows only what applies (`SelectionToolbar.tsx`).
2. Deleting gave no feedback. Now "Removed 3-seat sofa" with an Undo button for 8 seconds (every Remove or
   Delete step, in `store.ts`).
3. An empty floor said the same thing in every mode ("Import a plan image... choose Draw walls") with no
   button. Now it names the next step for the mode, with a Draw walls button and "Use a floorplan picture"
   (`EmptyPlan.tsx`). In Openings and Furnish it explains walls come first and takes her there.

**P2 (done)**
4. The hint under the plan was one long, static paragraph, and on a desktop it overprinted the plan labels.
   It is now one line that follows what she is doing: before the first corner, after it, a piece selected,
   a wall selected, touch wording (tap, not click), and a pill background (`toolHint.ts`).
5. The "Turned" box ran out of the details panel, and the four turn buttons wrapped 3 + 1. Fixed (one row).
6. At 1440 wide the last floor tab (Loft) was cut off as "Lc". The top bar now uses two rows up to 1600 px.

**P3 (not done)**
- The Furnish panel's "Add your Claude key in Settings..." note shows to everyone and is cut off mid-sentence.
- Undo after a delete does not bring the selection back.
- The toolbar may cover the item's name tag on small pieces; no "Add a door here" on a wall yet.
- The details panel is long for a sofa (cost fields before checks). Could fold the Cost section.
- A first-run guide on an empty project beyond the existing tour.
- Not tried on a real iPad.
