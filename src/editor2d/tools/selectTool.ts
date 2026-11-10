// Select & edit: click to select; drag a wall to move it (connected walls
// follow), drag a corner to reshape, double-click a wall to split it, click
// a dimension to type a length. Dragging empty floor pans the view.

import type { Id, Level, Vec2 } from '../../model/types';
import { useStore } from '../../model/store';
import { dist, dot, perpL, norm, sub } from '../../geometry/vec';
import { nodePos, settleNode, splitWall, wallsAt } from '../../geometry/wallGraph';
import { snapPoint } from '../../geometry/snapping';
import { hitDimLabel, hitMarker, hitNode, hitRoom, hitWall } from '../hitTest';
import { hitNote, hitStructuralPin } from '../pins';
import { findNote, moveNote, type NotePart } from '../../model/notes';
import type { PlanNote } from '../../model/types';
import { DRAG_START_PX, type ToolHandler } from './types';
import type { WallDimension } from '../../geometry/dimensions';

type Pending =
  | { kind: 'label'; d: WallDimension }
  | { kind: 'node'; id: Id; base: Level }
  | { kind: 'wall'; id: Id; base: Level; a: Vec2; b: Vec2 }
  | { kind: 'marker'; id: Id; start: Vec2 }
  | { kind: 'note'; id: Id; part: NotePart; base: PlanNote }
  | { kind: 'pin'; wallId: Id }
  | { kind: 'room'; id: Id }
  | { kind: 'empty' };

let pending: Pending | null = null;
let startScreen: Vec2 = { x: 0, y: 0 };
let lastScreen: Vec2 = { x: 0, y: 0 };
let startWorld: Vec2 = { x: 0, y: 0 };
let dragging = false;

const round10 = (x: number) => Math.round(x / 10) * 10;

function selectedWallNodes(level: Level): Set<Id> | undefined {
  const sel = useStore.getState().selection;
  if (sel?.kind !== 'wall') return undefined;
  const w = level.walls.find((x) => x.id === sel.id);
  return w ? new Set([w.a, w.b]) : undefined;
}

export const selectTool: ToolHandler = {
  reset() {
    pending = null;
    dragging = false;
  },

  down(ctx, p) {
    const { level, view, derived } = ctx;
    startScreen = p.screen;
    lastScreen = p.screen;
    startWorld = p.world;
    dragging = false;
    const store = useStore.getState();

    const label = hitDimLabel(view, derived.dims, p.screen);
    if (label) {
      pending = { kind: 'label', d: label };
      return;
    }
    // Notes sit on top of everything she drew, so they are hit first.
    const selId = store.selection?.kind === 'note' ? store.selection.id : undefined;
    const noteHit = hitNote(level, view, p.screen, selId);
    if (noteHit) {
      store.select({ kind: 'note', id: noteHit.id });
      pending = { kind: 'note', id: noteHit.id, part: noteHit.part, base: structuredClone(findNote(level, noteHit.id)!) };
      return;
    }
    // The amber structural pin: a tap selects its wall (the full warning is in the wall panel).
    const pinWall = hitStructuralPin(level, derived.dims, view, p.screen);
    if (pinWall) {
      pending = { kind: 'pin', wallId: pinWall };
      return;
    }
    const markerId = store.showMarkers ? hitMarker(level, view, p.screen) : undefined;
    if (markerId) {
      const m = level.markers!.find((x) => x.id === markerId)!;
      store.select({ kind: 'marker', id: markerId });
      pending = { kind: 'marker', id: markerId, start: m.pos };
      return;
    }
    // Corners: the selected wall's ends are always grabbable; any other
    // corner only when the pointer is right on it.
    const nodeId = hitNode(level, view, p.screen, selectedWallNodes(level)) ?? hitNode(level, view, p.screen);
    if (nodeId) {
      pending = { kind: 'node', id: nodeId, base: level };
      return;
    }
    const wallId = hitWall(level, derived.joints, view, p.world);
    if (wallId) {
      const w = level.walls.find((x) => x.id === wallId)!;
      store.select({ kind: 'wall', id: wallId });
      pending = { kind: 'wall', id: wallId, base: level, a: nodePos(level, w.a), b: nodePos(level, w.b) };
      return;
    }
    const room = hitRoom(derived.rooms, p.world);
    if (room) {
      const stored = level.rooms.find((r) => r.boundary.join('|') === room.nodeIds.join('|'));
      pending = stored ? { kind: 'room', id: stored.id } : { kind: 'empty' };
      return;
    }
    pending = { kind: 'empty' };
  },

  move(ctx, p) {
    const { level, view, derived } = ctx;
    const store = useStore.getState();
    if (!pending) {
      // Hover feedback only.
      const hoverNode = hitNode(level, view, p.screen, selectedWallNodes(level)) ?? hitNode(level, view, p.screen);
      const hoverWall = hoverNode ? undefined : hitWall(level, derived.joints, view, p.world);
      const hoverMarker = store.showMarkers ? hitMarker(level, view, p.screen) : undefined;
      const hoverNote = hitNote(level, view, p.screen)?.id;
      const hoverPin = hitStructuralPin(level, derived.dims, view, p.screen);
      ctx.setOverlay({ hoverNode, hoverWall, hoverMarker, hoverNote, hoverPin });
      return;
    }
    if (!dragging && dist(p.screen, startScreen) < DRAG_START_PX) return;
    const pend = pending;
    if (!dragging) {
      dragging = true;
      if (pend.kind === 'node' || pend.kind === 'wall' || pend.kind === 'marker' || pend.kind === 'note') store.beginGesture();
    }

    if (pend.kind === 'empty' || pend.kind === 'room' || pend.kind === 'label' || pend.kind === 'pin') {
      ctx.panBy(p.screen.x - lastScreen.x, p.screen.y - lastScreen.y);
      lastScreen = p.screen;
      return;
    }
    lastScreen = p.screen;

    if (pend.kind === 'wall') {
      let delta = sub(p.world, startWorld);
      if (!p.alt) {
        // Walls slide square to themselves; Alt frees them.
        const n = perpL(norm(sub(pend.b, pend.a)));
        const along = round10(dot(delta, n));
        delta = { x: n.x * along, y: n.y * along };
      }
      const w = pend.base.walls.find((x) => x.id === pend.id)!;
      store.updateGesture((L) => {
        const A = L.nodes.find((x) => x.id === w.a)!;
        const B = L.nodes.find((x) => x.id === w.b)!;
        A.pos = { x: pend.a.x + delta.x, y: pend.a.y + delta.y };
        B.pos = { x: pend.b.x + delta.x, y: pend.b.y + delta.y };
        const lw = L.walls.find((x) => x.id === pend.id);
        if (lw) lw.estimated = false;
      });
      ctx.setOverlay({ dragging: true, hoverWall: pend.id });
      return;
    }

    if (pend.kind === 'node') {
      const tol = 12 / view.scale;
      const snap = snapPoint(pend.base, p.world, { tol, excludeNode: pend.id, disabled: p.alt });
      let pt = snap.point;
      if (!p.alt && (snap.kind === 'grid' || snap.kind === 'none')) {
        for (const w of wallsAt(pend.base, pend.id)) {
          const other = nodePos(pend.base, w.a === pend.id ? w.b : w.a);
          if (Math.abs(pt.x - other.x) < tol) pt = { ...pt, x: other.x };
          if (Math.abs(pt.y - other.y) < tol) pt = { ...pt, y: other.y };
        }
      }
      store.updateGesture((L) => {
        const n = L.nodes.find((x) => x.id === pend.id);
        if (n) n.pos = { x: pt.x, y: pt.y };
        for (const w of L.walls) if (w.a === pend.id || w.b === pend.id) w.estimated = false;
      });
      ctx.setOverlay({ dragging: true, snap, hoverNode: pend.id });
      return;
    }

    if (pend.kind === 'note') {
      // Always measured from where the drag started, so a drag is one undo step.
      let d = sub(p.world, startWorld);
      if (!p.alt) d = { x: Math.round(d.x / 10) * 10, y: Math.round(d.y / 10) * 10 };
      store.updateGesture((L) => moveNote(L as Level, pend.id, pend.base, d, pend.part));
      ctx.setOverlay({ dragging: true, hoverNote: pend.id });
      return;
    }

    if (pend.kind === 'marker') {
      const d = sub(p.world, startWorld);
      store.updateGesture((L) => {
        const m = (L.markers ?? []).find((x) => x.id === pend.id);
        if (m) m.pos = { x: pend.start.x + d.x, y: pend.start.y + d.y };
      });
    }
  },

  up(ctx, p) {
    const store = useStore.getState();
    const pend = pending;
    pending = null;
    if (!pend) return;
    if (dragging) {
      dragging = false;
      if (pend.kind === 'node') {
        const tol = 12 / ctx.view.scale;
        store.endGesture('Move corner', p.alt ? undefined : (L) => settleNode(L as Level, pend.id, tol));
      } else if (pend.kind === 'wall') store.endGesture('Move wall');
      else if (pend.kind === 'marker') store.endGesture('Move pin');
      else if (pend.kind === 'note') store.endGesture('Move note');
      ctx.setOverlay({});
      return;
    }
    if (pend.kind === 'pin') store.select({ kind: 'wall', id: pend.wallId });
    else if (pend.kind === 'label') {
      store.select({ kind: 'wall', id: pend.d.wallId });
      ctx.openLabelEditor(pend.d);
    } else if (pend.kind === 'room') store.select({ kind: 'room', id: pend.id });
    else if (pend.kind === 'node') {
      const w = ctx.level.walls.find((x) => x.a === pend.id || x.b === pend.id);
      if (w) store.select({ kind: 'wall', id: w.id });
    } else if (pend.kind === 'empty') store.select(null);
  },

  dbl(ctx, p) {
    const wallId = hitWall(ctx.level, ctx.derived.joints, ctx.view, p.world);
    if (!wallId) return;
    const store = useStore.getState();
    store.editLevel('Split wall', (L) => {
      splitWall(L as Level, wallId, p.world);
    });
    store.select({ kind: 'wall', id: wallId });
    store.toast('Wall split in two. Drag the new corner to change its shape.');
  },

  escape() {
    if (dragging) useStore.getState().cancelGesture();
    pending = null;
    dragging = false;
    useStore.getState().select(null);
  },
};
