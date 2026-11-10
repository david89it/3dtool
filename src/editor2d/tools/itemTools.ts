// Furnish mode tools.
// - placeItem: after clicking an item in the catalogue, move over the plan
//   (it backs up to a nearby wall by itself) and click to place it.
// - select: click to select; drag to move (slides flush along walls); drag
//   the edge handles to resize, the round handle to turn (90° steps, Alt
//   for free). Locked items stay put.

import type { CatalogueItem, Level, PlacedItem, Vec2 } from '../../model/types';
import { useStore, type ItemGhost } from '../../model/store';
import { computeJoints } from '../../geometry/joints';
import { dist, dot, sub } from '../../geometry/vec';
import { effectiveDims, findCatalogueItem, footprintCentre, itemAxes, newPlacedItem } from '../../catalogue/catalogue';
import { ceilingAt, fitSurround, resizeFromEdge, round10, snapToOpening, snapToWall, wallFaces, type Edge } from '../itemOps';
import { surroundLayout } from '../../catalogue/builders';
import { detectRooms } from '../../geometry/rooms';
import { hitItem, hitItemHandle, itemHandles } from '../itemHit';
import { DRAG_START_PX, type ToolCtx, type ToolHandler } from './types';

function project() {
  return useStore.getState().project;
}

/** Where an armed catalogue item would land for a pointer at `world`. */
export function computeItemGhost(level: Level, catalogueId: string, world: Vec2, scale: number, alt: boolean): ItemGhost | null {
  const cat = findCatalogueItem(project(), catalogueId);
  if (!cat) return null;
  const dims = newPlacedItem(cat, world).dims;
  // Things you walk all round (tables, islands) don't jump to walls.
  const freeStanding = cat.clearance.some((c) => c.side === 'all') && cat.mount !== 'wall';
  if (alt || freeStanding) return { catalogueId, pos: round10(world), rotationDeg: 0, ok: true };
  if (cat.builder === 'opening-surround') {
    const J = computeJoints(level);
    const base = newPlacedItem(cat, world);
    const side = surroundLayout(base, base.dims).side;
    const snap = snapToOpening(level, J, world, base.dims.d, side, Math.max(600, 40 / scale));
    if (snap) {
      const fitted = fitSurround(base, snap, side, ceilingAt(level, detectRooms(level, J), snap.pos));
      return { catalogueId, pos: fitted.pos, rotationDeg: fitted.rotationDeg, mountedTo: fitted.mountedTo, dims: fitted.dims, params: fitted.params, ok: true };
    }
  }
  const faces = wallFaces(level, computeJoints(level));
  const tol = cat.mount === 'wall' ? Math.max(1500, 120 / scale) : Math.max(600, 40 / scale);
  // Measure from the pointer as if it were the item's back edge, so it slides up to the wall naturally.
  const snap = snapToWall(faces, world, 0, dims, { tol: tol + dims.d / 2, autoRotate: true });
  if (snap) return { catalogueId, pos: snap.pos, rotationDeg: snap.rotationDeg, mountedTo: cat.mount === 'wall' ? snap.mountedTo : undefined, ok: true };
  if (cat.mount === 'wall') return { catalogueId, pos: round10(world), rotationDeg: 0, ok: false, reason: 'Move it onto a wall' };
  return { catalogueId, pos: round10(world), rotationDeg: 0, ok: true };
}

export function placeItemFromGhost(): boolean {
  const s = useStore.getState();
  const g = s.itemGhost;
  if (!g || !g.ok) return false;
  const cat = findCatalogueItem(s.project, g.catalogueId);
  if (!cat) return false;
  const item = newPlacedItem(cat, g.pos, g.rotationDeg);
  if (g.mountedTo) item.mountedTo = g.mountedTo;
  if (g.dims) item.dims = { ...g.dims };
  if (g.params) item.params = { ...g.params };
  s.editLevel(`Add ${cat.name.toLowerCase()}`, (L) => {
    L.items.push(item);
  });
  s.setItemGhost(null);
  s.setTool('select');
  s.select({ kind: 'item', id: item.id });
  return true;
}

export const placeItemTool: ToolHandler = {
  down() {},
  move(ctx, p) {
    const s = useStore.getState();
    s.setItemGhost(computeItemGhost(ctx.level, s.placeItemId, p.world, ctx.view.scale, p.alt));
  },
  up(ctx, p) {
    if (p.button !== 0) return;
    const s = useStore.getState();
    s.setItemGhost(computeItemGhost(ctx.level, s.placeItemId, p.world, ctx.view.scale, p.alt));
    if (!placeItemFromGhost()) {
      const g = useStore.getState().itemGhost;
      if (g && !g.ok && g.reason) useStore.getState().toast(`${g.reason}.`);
    }
  },
  escape() {
    useStore.getState().setItemGhost(null);
    useStore.getState().setTool('select');
  },
  reset() {
    useStore.getState().setItemGhost(null);
  },
};

type Pending =
  | { kind: 'move'; item: PlacedItem; cat: CatalogueItem; grab: Vec2 }
  | { kind: 'resize'; item: PlacedItem; cat: CatalogueItem; edge: Edge }
  | { kind: 'rotate'; item: PlacedItem; cat: CatalogueItem }
  | { kind: 'select'; id: string }
  | { kind: 'empty' };

let pending: Pending | null = null;
let dragging = false;
let startScreen: Vec2 = { x: 0, y: 0 };
let lastScreen: Vec2 = { x: 0, y: 0 };
let warnedLocked = false;

function selectedItem(ctx: ToolCtx): PlacedItem | undefined {
  const sel = useStore.getState().selection;
  return sel?.kind === 'item' ? ctx.level.items.find((i) => i.id === sel.id) : undefined;
}

export const furnishSelectTool: ToolHandler = {
  reset() {
    pending = null;
    dragging = false;
  },

  down(ctx, p) {
    startScreen = p.screen;
    lastScreen = p.screen;
    dragging = false;
    warnedLocked = false;
    const store = useStore.getState();
    const sel = selectedItem(ctx);
    if (sel) {
      const cat = findCatalogueItem(store.project, sel.catalogueId);
      const h = cat ? hitItemHandle(itemHandles(sel, store.project, ctx.view), p.screen) : undefined;
      if (h && cat) {
        pending = h.kind === 'rotate' ? { kind: 'rotate', item: sel, cat } : { kind: 'resize', item: sel, cat, edge: h.edge };
        return;
      }
    }
    const hit = hitItem(ctx.level, store.project, p.world);
    if (hit) {
      store.select({ kind: 'item', id: hit.id });
      const cat = findCatalogueItem(store.project, hit.catalogueId);
      pending = hit.locked || !cat ? { kind: 'select', id: hit.id } : { kind: 'move', item: hit, cat, grab: sub(p.world, hit.pos) };
      return;
    }
    pending = { kind: 'empty' };
  },

  move(ctx, p) {
    const store = useStore.getState();
    if (!pending) {
      const hit = hitItem(ctx.level, store.project, p.world);
      ctx.setOverlay({ hoverItem: hit?.id });
      return;
    }
    if (!dragging && dist(p.screen, startScreen) < DRAG_START_PX) return;
    const pend = pending;
    if (!dragging) {
      dragging = true;
      if (pend.kind === 'move' || pend.kind === 'resize' || pend.kind === 'rotate') store.beginGesture();
    }
    if (pend.kind === 'empty') {
      ctx.panBy(p.screen.x - lastScreen.x, p.screen.y - lastScreen.y);
      lastScreen = p.screen;
      return;
    }
    if (pend.kind === 'select') {
      if (!warnedLocked) {
        warnedLocked = true;
        store.toast('This item is locked. Unlock it in the panel to move it.');
      }
      return;
    }
    let next: PlacedItem = pend.item;
    if (pend.kind === 'move') {
      const want = sub(p.world, pend.grab);
      next = { ...pend.item, pos: round10(want), mountedTo: undefined };
      if (!p.alt) {
        const faces = wallFaces(ctx.level, computeJoints(ctx.level));
        const tol = Math.max(150, 20 / ctx.view.scale);
        const snap = snapToWall(faces, want, pend.item.rotationDeg, pend.item.dims, {
          tol: pend.cat.mount === 'wall' ? 1000 : tol,
          autoRotate: pend.cat.mount === 'wall',
        });
        if (snap) next = { ...next, pos: snap.pos, rotationDeg: snap.rotationDeg, mountedTo: pend.cat.mount === 'wall' ? snap.mountedTo : undefined };
        if (pend.cat.builder === 'opening-surround') {
          const J = computeJoints(ctx.level);
          const side = surroundLayout(pend.item, pend.item.dims).side;
          const os = snapToOpening(ctx.level, J, want, pend.item.dims.d, side, Math.max(300, 30 / ctx.view.scale));
          if (os) next = fitSurround(next, os, side, ceilingAt(ctx.level, detectRooms(ctx.level, J), os.pos));
        }
      }
    } else if (pend.kind === 'resize') {
      const c = footprintCentre(pend.item, pend.cat);
      const { front, xAxis } = itemAxes(pend.item);
      const eff = effectiveDims(pend.item, pend.cat);
      const rel = sub(p.world, c);
      const along = pend.edge === 'left' || pend.edge === 'right' ? dot(rel, xAxis) : dot(rel, front);
      const half = pend.edge === 'left' || pend.edge === 'right' ? eff.w / 2 : eff.d / 2;
      const sign = pend.edge === 'right' || pend.edge === 'front' ? 1 : -1;
      next = resizeFromEdge(pend.item, pend.cat, pend.edge, sign * along + half);
    } else if (pend.kind === 'rotate') {
      const c = pend.item.pos;
      const v = sub(p.world, c);
      let deg = (Math.atan2(-v.x, v.y) * 180) / Math.PI;
      deg = p.alt ? Math.round(deg) : Math.round(deg / 90) * 90;
      next = { ...pend.item, rotationDeg: ((deg % 360) + 360) % 360, mountedTo: undefined };
    }
    const id = pend.item.id;
    store.updateGesture((L) => {
      const i = L.items.findIndex((x) => x.id === id);
      if (i >= 0) L.items[i] = next;
    });
    ctx.setOverlay({ dragging: true, hoverItem: id });
  },

  up(ctx) {
    const store = useStore.getState();
    const pend = pending;
    pending = null;
    if (!pend) return;
    if (dragging) {
      dragging = false;
      if (pend.kind === 'move') store.endGesture(`Move ${pend.cat.name.toLowerCase()}`);
      else if (pend.kind === 'resize') store.endGesture(`Resize ${pend.cat.name.toLowerCase()}`);
      else if (pend.kind === 'rotate') store.endGesture(`Turn ${pend.cat.name.toLowerCase()}`);
      ctx.setOverlay({});
      return;
    }
    if (pend.kind === 'empty') store.select(null);
  },

  escape() {
    if (dragging) useStore.getState().cancelGesture();
    pending = null;
    dragging = false;
    useStore.getState().select(null);
  },
};
