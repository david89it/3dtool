// Set scale: click two points on the plan image whose real distance you
// know (a printed room width is ideal), then type that distance.

import type { Vec2 } from '../../model/types';
import type { ToolHandler } from './types';

let p1: Vec2 | null = null;

export const calibrateTool: ToolHandler = {
  reset() {
    p1 = null;
  },
  down() {},
  move(ctx, p) {
    ctx.setOverlay({ calib: { p1: p1 ?? undefined, cursor: p.world } });
  },
  up(ctx, p) {
    if (p.button !== 0) return;
    if (!p1) {
      p1 = p.world;
      ctx.setOverlay({ calib: { p1, cursor: p.world } });
      return;
    }
    const a = p1;
    p1 = null;
    ctx.setOverlay({});
    ctx.openCalibration(a, p.world);
  },
  escape(ctx) {
    p1 = null;
    ctx.setOverlay({});
  },
};
