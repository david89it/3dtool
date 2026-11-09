// Draw walls: click to place corners. Snaps to 0/45/90 degrees, existing
// corners, wall midpoints and walls (Alt turns snapping off). The chain ends
// on double-click, Esc, Enter, or when it reaches an existing corner or wall.

import type { Level, Vec2 } from '../../model/types';
import { useStore } from '../../model/store';
import { snapPoint, type SnapResult } from '../../geometry/snapping';
import { addWall, DEFAULT_THICKNESS } from '../../geometry/wallGraph';
import { dist } from '../../geometry/vec';
import type { PointerInfo, ToolCtx, ToolHandler } from './types';

let chain: Vec2 | null = null;
let segments = 0;

function snapFor(ctx: ToolCtx, p: PointerInfo): SnapResult {
  return snapPoint(ctx.level, p.world, {
    from: chain ?? undefined,
    tol: 12 / ctx.view.scale,
    disabled: p.alt,
  });
}

function end(ctx: ToolCtx) {
  chain = null;
  segments = 0;
  ctx.setOverlay({});
}

export const traceTool: ToolHandler = {
  reset() {
    chain = null;
    segments = 0;
  },

  down() {},

  move(ctx, p) {
    const snap = snapFor(ctx, p);
    ctx.setOverlay({ snap, draw: chain ? { from: chain, to: snap.point } : undefined });
  },

  up(ctx, p) {
    if (p.button !== 0) return;
    const snap = snapFor(ctx, p);
    const pt = snap.point;
    if (!chain) {
      chain = pt;
      segments = 0;
      ctx.setOverlay({ snap, draw: { from: pt, to: pt } });
      return;
    }
    if (dist(chain, pt) < 5) return; // second click of a double-click
    const from = chain;
    const store = useStore.getState();
    const kind = store.drawKind;
    store.editLevel('Draw wall', (L) => {
      addWall(L as Level, from, pt, { kind, thickness: DEFAULT_THICKNESS[kind], structural: 'unknown' }, 1);
    });
    segments += 1;
    const closes = snap.kind === 'node' || snap.kind === 'wall' || snap.kind === 'midpoint';
    if (closes) {
      end(ctx);
      return;
    }
    chain = pt;
    ctx.setOverlay({ snap, draw: { from: pt, to: pt } });
  },

  dbl(ctx) {
    end(ctx);
  },

  escape(ctx) {
    end(ctx);
  },
};

export function isTracing(): boolean {
  return chain !== null;
}

export function finishTrace(ctx: ToolCtx): void {
  end(ctx);
}

export function traceSegments(): number {
  return segments;
}
