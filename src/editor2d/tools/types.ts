import type { Id, Level, Vec2 } from '../../model/types';
import type { JointData } from '../../geometry/joints';
import type { DetectedRoom } from '../../geometry/rooms';
import type { WallDimension } from '../../geometry/dimensions';
import type { SnapResult } from '../../geometry/snapping';
import type { View } from '../view';
import type { OpeningLabel } from '../openingLabels';

export interface PointerInfo {
  screen: Vec2;
  world: Vec2;
  alt: boolean;
  shift: boolean;
  button: number;
}

export interface Derived {
  joints: JointData;
  rooms: DetectedRoom[];
  dims: WallDimension[];
}

export interface Overlay {
  hoverWall?: Id;
  hoverNode?: Id;
  hoverMarker?: Id;
  hoverOpening?: Id;
  snap?: SnapResult;
  draw?: { from: Vec2; to: Vec2 };
  calib?: { p1?: Vec2; cursor?: Vec2 };
  dragging?: boolean;
}

export interface ToolCtx {
  level: Level;
  view: View;
  derived: Derived;
  setOverlay: (o: Overlay) => void;
  panBy: (dx: number, dy: number) => void;
  openLabelEditor: (d: WallDimension) => void;
  openCalibration: (p1: Vec2, p2: Vec2) => void;
  openOpeningEditor: (openingId: Id, label: OpeningLabel) => void;
}

export interface ToolHandler {
  down: (ctx: ToolCtx, p: PointerInfo) => void;
  move: (ctx: ToolCtx, p: PointerInfo) => void;
  up: (ctx: ToolCtx, p: PointerInfo) => void;
  dbl?: (ctx: ToolCtx, p: PointerInfo) => void;
  escape?: (ctx: ToolCtx) => void;
  reset?: () => void;
}

/** Pointer travel (px) before a press becomes a drag. */
export const DRAG_START_PX = 4;
