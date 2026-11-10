// Finding furniture under the pointer, and where its handles are.

import type { Id, Level, PlacedItem, Project, Vec2 } from '../model/types';
import { effectiveDims, findCatalogueItem, footprint, itemAxes, localToPlan, obstacleRects } from '../catalogue/catalogue';
import { dist, pointInPolygon, signedArea } from '../geometry/vec';
import { toScreen, type View } from './view';
import type { Edge } from './itemOps';
import { canResize } from './itemOps';

export function hitItem(level: Level, project: Project, p: Vec2): PlacedItem | undefined {
  const hits: { item: PlacedItem; area: number }[] = [];
  for (const item of level.items) {
    const cat = findCatalogueItem(project, item.catalogueId);
    if (!cat) continue;
    const fp = footprint(item, cat);
    // Parametric pieces (a bookcase surround) are hollow: only their solid
    // parts count, so a click in the opening reaches what's behind.
    const zones = cat.builder ? obstacleRects(item, cat) : [fp];
    if (zones.some((z) => pointInPolygon(p, z))) hits.push({ item, area: Math.abs(signedArea(fp)) });
  }
  // Smaller things sit on top (a lamp on a rug, a chair at a table).
  hits.sort((a, b) => a.area - b.area);
  return hits[0]?.item;
}

export type ItemHandle = { kind: 'edge'; edge: Edge; screen: Vec2 } | { kind: 'rotate'; screen: Vec2 };

export function itemHandles(item: PlacedItem, project: Project, view: View): ItemHandle[] {
  const cat = findCatalogueItem(project, item.catalogueId);
  if (!cat || item.locked) return [];
  const { w, d } = effectiveDims(item, cat);
  const s = (x: number, z: number) => toScreen(view, localToPlan(item, cat, x, z));
  const out: ItemHandle[] = [];
  if (canResize(cat, 'w')) {
    out.push({ kind: 'edge', edge: 'left', screen: s(-w / 2, 0) }, { kind: 'edge', edge: 'right', screen: s(w / 2, 0) });
  }
  if (canResize(cat, 'd')) {
    out.push({ kind: 'edge', edge: 'front', screen: s(0, d / 2) }, { kind: 'edge', edge: 'back', screen: s(0, -d / 2) });
  }
  const f = itemAxes(item).front;
  const fm = s(0, d / 2);
  out.push({ kind: 'rotate', screen: { x: fm.x + f.x * 34, y: fm.y + f.y * 34 } });
  return out;
}

export function hitItemHandle(handles: ItemHandle[], screen: Vec2): ItemHandle | undefined {
  let best: ItemHandle | undefined;
  let bestD = 18;
  for (const h of handles) {
    const d = dist(h.screen, screen);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

export function itemById(level: Level, id: Id): PlacedItem | undefined {
  return level.items.find((i) => i.id === id);
}
