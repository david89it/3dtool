// Openings mode.
// - select: click a door, window or opening to select it; drag it along its
//   wall or onto another wall; click its measurements to type them.
// - placeOpening: after clicking a palette item, move over a wall to see
//   where it would go and click to place it.

import type { Level, Vec2 } from '../../model/types';
import { useStore } from '../../model/store';
import { computeJoints } from '../../geometry/joints';
import { findOpening, fitOpening, hitOpening, isStructural, nearestWall, usableRange } from '../../geometry/openings';
import { addOpening, moveOpening } from '../../geometry/openingEdits';
import { dist } from '../../geometry/vec';
import { hitRoom, hitWall } from '../hitTest';
import { hitOpeningLabel, openingLabels, type OpeningLabel } from '../openingLabels';
import { DRAG_START_PX, type ToolCtx, type ToolHandler } from './types';
import { OPENING_DEFAULTS } from '../../geometry/openings';

const PLACE_TOL_PX = 40;

/** Where a new opening of the armed type would go for a pointer at `world`. */
export function computeGhost(level: Level, world: Vec2, scale: number) {
  const s = useStore.getState();
  const type = s.placeType;
  const J = computeJoints(level);
  const near = nearestWall(level, J, world, PLACE_TOL_PX / scale);
  if (!near) return { ok: false as const, type, at: world, reason: 'Move onto a wall' };
  const range = usableRange(J, near.wall.id);
  const width = OPENING_DEFAULTS[type].width;
  const off = range ? fitOpening(near.wall, range, near.along, width) : null;
  if (off === null) return { ok: false as const, type, at: world, reason: 'No room on this wall' };
  return { ok: true as const, type, wallId: near.wall.id, offset: off, width };
}

/** Place the armed opening where the ghost is. Returns true if placed. */
export function placeFromGhost(): boolean {
  const s = useStore.getState();
  const g = s.ghost;
  if (!g || !g.ok) return false;
  let newId: string | null = null;
  s.editLevel(`Add ${g.type === 'opening' ? 'opening' : g.type === 'bayWindow' ? 'bay window' : g.type}`, (L) => {
    const r = addOpening(L as Level, g.wallId, g.type, g.offset + g.width / 2, g.width);
    if ('id' in r) newId = r.id;
  });
  s.setGhost(null);
  s.setTool('select');
  if (newId) {
    s.select({ kind: 'opening', id: newId });
    const lvl = useStore.getState().project.levels.find((l) => l.id === s.levelId);
    const w = lvl?.walls.find((x) => x.id === g.wallId);
    if (w && isStructural(w)) {
      s.toast('This wall may hold the building up. See the amber note on the plan.');
    }
  }
  return !!newId;
}

export const placeOpeningTool: ToolHandler = {
  down() {},
  move(ctx, p) {
    useStore.getState().setGhost(computeGhost(ctx.level, p.world, ctx.view.scale));
  },
  up(ctx, p) {
    if (p.button !== 0) return;
    useStore.getState().setGhost(computeGhost(ctx.level, p.world, ctx.view.scale));
    if (!placeFromGhost()) {
      const g = useStore.getState().ghost;
      if (g && !g.ok) useStore.getState().toast(`${g.reason}.`);
    }
  },
  escape() {
    useStore.getState().setGhost(null);
    useStore.getState().setTool('select');
  },
  reset() {
    useStore.getState().setGhost(null);
  },
};

type Pending =
  | { kind: 'label'; label: OpeningLabel; openingId: string }
  | { kind: 'opening'; id: string; grabOffset: number; base: Level }
  | { kind: 'wall'; id: string }
  | { kind: 'room'; id: string }
  | { kind: 'empty' };

let pending: Pending | null = null;
let dragging = false;
let startScreen: Vec2 = { x: 0, y: 0 };
let lastScreen: Vec2 = { x: 0, y: 0 };

function selectedOpeningLabels(ctx: ToolCtx): { labels: OpeningLabel[]; id: string } | null {
  const sel = useStore.getState().selection;
  if (sel?.kind !== 'opening') return null;
  return { id: sel.id, labels: openingLabels(ctx.level, ctx.derived.joints, ctx.derived.dims, ctx.view, sel.id) };
}

export const openingSelectTool: ToolHandler = {
  reset() {
    pending = null;
    dragging = false;
  },

  down(ctx, p) {
    startScreen = p.screen;
    lastScreen = p.screen;
    dragging = false;
    const sel = selectedOpeningLabels(ctx);
    const label = sel ? hitOpeningLabel(sel.labels, p.screen) : undefined;
    if (sel && label) {
      pending = { kind: 'label', label, openingId: sel.id };
      return;
    }
    const tol = 8 / ctx.view.scale;
    const hit = hitOpening(ctx.level, ctx.derived.joints, p.world, tol);
    if (hit) {
      useStore.getState().select({ kind: 'opening', id: hit.opening.id });
      const o = ctx.derived.joints.outlines.get(hit.wall.id)!;
      const along = (p.world.x - o.a.x) * o.dir.x + (p.world.y - o.a.y) * o.dir.y;
      pending = {
        kind: 'opening',
        id: hit.opening.id,
        grabOffset: along - (hit.opening.offset + hit.opening.width / 2),
        base: ctx.level,
      };
      return;
    }
    const wallId = hitWall(ctx.level, ctx.derived.joints, ctx.view, p.world);
    if (wallId) {
      pending = { kind: 'wall', id: wallId };
      return;
    }
    const room = hitRoom(ctx.derived.rooms, p.world);
    const stored = room && ctx.level.rooms.find((r) => r.boundary.join('|') === room.nodeIds.join('|'));
    pending = stored ? { kind: 'room', id: stored.id } : { kind: 'empty' };
  },

  move(ctx, p) {
    if (!pending) {
      const hit = hitOpening(ctx.level, ctx.derived.joints, p.world, 8 / ctx.view.scale);
      const hoverWall = hit ? undefined : hitWall(ctx.level, ctx.derived.joints, ctx.view, p.world);
      ctx.setOverlay({ hoverOpening: hit?.opening.id, hoverWall });
      return;
    }
    if (!dragging && dist(p.screen, startScreen) < DRAG_START_PX) return;
    const pend = pending;
    const store = useStore.getState();
    if (!dragging) {
      dragging = true;
      if (pend.kind === 'opening') store.beginGesture();
    }
    if (pend.kind !== 'opening') {
      ctx.panBy(p.screen.x - lastScreen.x, p.screen.y - lastScreen.y);
      lastScreen = p.screen;
      return;
    }
    // Stay on the current wall unless the pointer is clearly over another one.
    const J = computeJoints(pend.base);
    const from = findOpening(pend.base, pend.id);
    if (!from) return;
    const near = nearestWall(pend.base, J, p.world, 30 / ctx.view.scale);
    const targetId = near && near.wall.id !== from.wall.id && near.dist < 4 / ctx.view.scale ? near.wall.id : from.wall.id;
    const o = J.outlines.get(targetId)!;
    const along = (p.world.x - o.a.x) * o.dir.x + (p.world.y - o.a.y) * o.dir.y;
    const centre = targetId === from.wall.id ? along - pend.grabOffset : along;
    const rounded = p.alt ? centre : Math.round(centre / 10) * 10;
    store.updateGesture((L) => {
      moveOpening(L as Level, pend.id, targetId, rounded);
    });
    ctx.setOverlay({ dragging: true, hoverOpening: pend.id });
  },

  up(ctx) {
    const store = useStore.getState();
    const pend = pending;
    pending = null;
    if (!pend) return;
    if (dragging) {
      dragging = false;
      if (pend.kind === 'opening') store.endGesture('Move opening');
      ctx.setOverlay({});
      return;
    }
    if (pend.kind === 'label') ctx.openOpeningEditor(pend.openingId, pend.label);
    else if (pend.kind === 'wall') store.select({ kind: 'wall', id: pend.id });
    else if (pend.kind === 'room') store.select({ kind: 'room', id: pend.id });
    else if (pend.kind === 'empty') store.select(null);
  },

  escape() {
    if (dragging) useStore.getState().cancelGesture();
    pending = null;
    dragging = false;
    useStore.getState().select(null);
  },
};

