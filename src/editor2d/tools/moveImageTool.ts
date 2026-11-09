// Drag the plan image to line it up with the walls (only when unlocked).

import type { Vec2 } from '../../model/types';
import { useStore } from '../../model/store';
import { sub } from '../../geometry/vec';
import type { ToolHandler } from './types';

let start: { world: Vec2; offset: Vec2 } | null = null;

export const moveImageTool: ToolHandler = {
  reset() {
    start = null;
  },
  down(ctx, p) {
    const u = ctx.level.underlay;
    if (!u || u.locked) return;
    start = { world: p.world, offset: u.offset };
    useStore.getState().beginGesture();
  },
  move(_ctx, p) {
    if (!start) return;
    const s = start;
    const d = sub(p.world, s.world);
    useStore.getState().updateGesture((L) => {
      if (L.underlay) L.underlay.offset = { x: s.offset.x + d.x, y: s.offset.y + d.y };
    });
  },
  up() {
    if (!start) return;
    start = null;
    useStore.getState().endGesture('Move plan image');
  },
  escape() {
    if (start) useStore.getState().cancelGesture();
    start = null;
  },
};
