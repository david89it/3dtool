// The one line under the plan that says what to do next. It follows what she is doing
// right now (which tool, whether a wall is half drawn, what is selected), and on a touch
// screen it talks about tapping and holding, not keys.

import type { Mode, Tool } from '../model/store';

export interface HintState {
  tool: Tool;
  mode: Mode;
  /** `kind` of the current selection, or null. */
  selected: string | null;
  /** A wall is being drawn: the first corner is down. */
  drawing: boolean;
  /** The floor has no walls and no plan image yet. */
  emptyFloor: boolean;
  touch: boolean;
}

export function toolHintText(h: HintState): string {
  const { tool, mode, selected, drawing, touch } = h;
  if (tool === 'placeItem') return touch ? 'Tap the plan to place it. Tap Esc or another tool to cancel.' : 'Click to place it. It turns to back onto a nearby wall. Hold Alt to turn off snapping. Esc cancels.';
  if (tool === 'placeOpening') return touch ? 'Tap a wall to place it.' : 'Move over a wall and click to place it. Esc cancels.';
  if (tool === 'draw') {
    if (drawing) return touch ? 'Tap the next corner. Double-tap the last corner to finish.' : 'Click the next corner. Double-click, Enter or Esc to finish.';
    return touch ? 'Tap to put down the first corner of a wall.' : 'Click to start a wall. Hold Alt to turn off snapping.';
  }
  if (tool === 'calibrate') return 'Click two points on the plan image whose real distance you know.';
  if (tool === 'placeNote') return 'Click where the note should go. Esc cancels.';
  if (tool === 'placeMeasure') return 'Click the start, then the end. Its length shows as you move. Esc cancels.';
  if (tool === 'placeArrow') return 'Click the start of the arrow, then the point it should show. Esc cancels.';
  if (tool === 'moveImage') return 'Drag the plan image to line it up. Lock it when you are done.';
  if (mode === 'advice') return 'Click a problem in the list on the right to see where it is on the plan.';

  if (selected === 'item' || selected === 'items') {
    return touch
      ? 'Drag to move. Use the buttons above it to turn, copy or delete. Tap empty floor when you are done.'
      : 'Drag to move, or use the buttons above it. R turns it 90°. Ctrl/⌘ D copies it. Delete removes it.';
  }
  if (selected === 'wall') return 'Drag the wall to move it, or type a new length on the plan. Double-click to split it.';
  if (selected === 'opening') return 'Drag it along the wall to move it. Click a measurement to type a new one.';
  if (selected === 'note') return 'Drag the note to move it. Use Edit above it to change the words.';

  if (h.emptyFloor && mode !== 'trace') return 'Draw the walls first (Trace). Then come back to add ' + (mode === 'openings' ? 'doors and windows.' : 'furniture.');
  if (mode === 'furnish') return touch ? 'Pick something on the left, then tap the plan. Tap a piece to edit it.' : 'Pick something on the left, then click the plan. Click a piece to edit it; Shift-click picks several.';
  if (mode === 'openings') return touch ? 'Drag a door or window from the left onto a wall. Tap one to edit it.' : 'Drag a door, window or opening from the left onto a wall. Click one to edit it.';
  return touch ? 'Tap a wall to edit it. Draw walls on the left to add new ones.' : 'Click a wall to edit it. Drag to move it. Double-click to split it. Press W to draw new walls.';
}
