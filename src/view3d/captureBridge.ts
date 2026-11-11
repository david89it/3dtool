// A tiny bridge so the print pack can include a picture of the 3D overview
// without loading three.js. View3D (loaded only when she opens 3D) fills it
// in; this file imports nothing heavy.

export const view3dBridge: {
  /** Refreshes `snapshot` from the live overview. Null while 3D is closed or in the walk view. */
  capture: (() => void) | null;
  /** Latest overview picture, kept after she leaves 3D. */
  snapshot: { dataUrl: string; floor: string } | null;
} = { capture: null, snapshot: null };

/** The best overview picture available: a fresh one if 3D is showing, otherwise the last one taken. */
export function get3dSnapshot(): { dataUrl: string; floor: string } | null {
  try {
    view3dBridge.capture?.();
  } catch {
    // keep the last picture
  }
  return view3dBridge.snapshot;
}

// ---- room views -----------------------------------------------------------
// The plan UI asks the 3D view to look into one room, or to walk in. It goes
// through here so the UI never imports three. When 3D is not open yet the
// request waits and the view takes it when it opens.

export interface RoomView3D {
  kind: 'frame' | 'walk';
  levelId: string;
  /** The room's inside outline, plan mm. */
  polygon: { x: number; y: number }[];
  /** Walk only: where to stand and what to face, plan mm. */
  stand?: { x: number; y: number };
  face?: { x: number; y: number };
}

export const roomViewBridge: {
  handler: ((r: RoomView3D) => void) | null;
  pending: RoomView3D | null;
} = { handler: null, pending: null };

export function requestRoomView(r: RoomView3D): void {
  if (roomViewBridge.handler) roomViewBridge.handler(r);
  else roomViewBridge.pending = r;
}
