// Bridges between the plan UI and the 3D code, so the UI never imports three.
//
// 1. Pictures for the print pack. `renderOverview3D` asks the offscreen 3D
//    renderer (src/view3d/Offscreen3D.tsx, which the print pack mounts while
//    it is open) for a PNG of one floor, from above at an angle with cut-away
//    walls, for any project: the plan as it is now, or an earlier version.
//    It does not depend on the 3D view being open.
// 2. Room views (below).

import type { Project } from '../model/types';

export interface OverviewRequest {
  project: Project;
  levelId: string;
  width?: number;
  height?: number;
}

export const view3dBridge: {
  /** Set by Offscreen3D while it is mounted; renders one picture at a time. Null if it fails. */
  renderer: ((req: OverviewRequest) => Promise<string | null>) | null;
} = { renderer: null };

/** How long to wait for the renderer to appear (three.js is loaded on demand), and for one picture. */
export const RENDERER_WAIT_MS = 25_000;

/**
 * A PNG data URL of one floor of `project`, seen from above at an angle with the walls cut away
 * to 1.2 m. Resolves to null on any failure (no WebGL, timeout, nothing to draw): never throws.
 */
export async function renderOverview3D(req: OverviewRequest): Promise<string | null> {
  try {
    const t0 = Date.now();
    while (!view3dBridge.renderer) {
      if (Date.now() - t0 > RENDERER_WAIT_MS) return null;
      await new Promise((r) => setTimeout(r, 50));
    }
    return await view3dBridge.renderer(req);
  } catch {
    return null;
  }
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
