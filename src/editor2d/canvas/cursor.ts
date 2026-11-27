import type { Tool } from '../../model/store';
import type { Overlay } from '../tools/types';

/** The mouse cursor for the current tool and whatever the pointer is over. */
export function cursorFor(tool: Tool, overlay: Overlay, itemGhostOk: boolean | undefined, ghostOk: boolean | undefined): string {
  if (tool === 'draw' || tool === 'calibrate' || tool === 'placeNote' || tool === 'placeMeasure' || tool === 'placeArrow') return 'crosshair';
  if (tool === 'placeItem') return itemGhostOk === false ? 'not-allowed' : 'copy';
  if (tool === 'placeOpening') return ghostOk ? 'copy' : 'not-allowed';
  if (tool === 'moveImage') return 'move';
  if (overlay.hoverNode || overlay.hoverOpening || overlay.hoverItem || overlay.hoverNote) return 'grab';
  if (overlay.hoverWall || overlay.hoverPin) return 'pointer';
  return 'default';
}
