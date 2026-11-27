// Which tool handles the pointer in which mode.
import { useStore, type Mode, type Tool } from '../../model/store';
import { selectTool } from '../tools/selectTool';
import { traceTool } from '../tools/traceTool';
import { calibrateTool } from '../tools/calibrateTool';
import { moveImageTool } from '../tools/moveImageTool';
import { openingSelectTool, placeOpeningTool } from '../tools/openingTools';
import { placeArrowTool, placeMeasureTool, placeNoteTool } from '../tools/noteTools';
import { furnishSelectTool, placeItemTool } from '../tools/itemTools';
import type { ToolHandler } from '../tools/types';

const TOOLS: Record<string, ToolHandler> = {
  select: selectTool,
  draw: traceTool,
  calibrate: calibrateTool,
  moveImage: moveImageTool,
  placeOpening: placeOpeningTool,
  placeItem: placeItemTool,
  placeNote: placeNoteTool,
  placeMeasure: placeMeasureTool,
  placeArrow: placeArrowTool,
};

/** Tools where a click places something: on touch, a drag pans instead. */
export const TAP_TOOLS = new Set<Tool>(['draw', 'calibrate', 'placeOpening', 'placeItem', 'placeNote', 'placeMeasure', 'placeArrow']);

/** Press and hold this long, without moving, to open the menu on touch and pen. */
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_SLOP_PX = 8;

export const ALL_TOOLS = [...Object.values(TOOLS), openingSelectTool, furnishSelectTool];

/** Each mode has its own "select" behaviour; other tools are shared. */
export function toolFor(mode: Mode, tool: Tool): ToolHandler {
  if (mode === 'openings' && tool === 'select') return openingSelectTool;
  if (mode === 'furnish' && tool === 'select') return furnishSelectTool;
  return TOOLS[tool] ?? selectTool;
}

export function currentTool(): ToolHandler {
  const s = useStore.getState();
  return toolFor(s.mode, s.tool);
}
