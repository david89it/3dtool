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
