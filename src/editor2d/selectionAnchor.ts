// Where the floating mini-toolbar sits: a box in plan millimetres round whatever is selected.
// Pure, so it can be tested without a canvas.

import type { Level, Project, Vec2 } from '../model/types';
import type { Selection } from '../model/store';
import { findCatalogueItem, footprint } from '../catalogue/catalogue';
import { findWallEnds } from '../geometry/wallGraph';
import { selectionIds } from '../model/groups';

export interface Box {
  min: Vec2;
  max: Vec2;
}

function boxOf(pts: Vec2[]): Box | null {
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}

/** The plan box round the selection, or null when it has no place on the plan (rooms, corners, a missing id). */
export function selectionBox(level: Level, project: Project, sel: Selection): Box | null {
  if (!sel) return null;
  if (sel.kind === 'item' || sel.kind === 'items') {
    const pts: Vec2[] = [];
    for (const id of selectionIds(sel)) {
      const it = level.items.find((i) => i.id === id);
      const cat = it && findCatalogueItem(project, it.catalogueId);
      if (it && cat) pts.push(...footprint(it, cat));
    }
    return boxOf(pts);
  }
  if (sel.kind === 'wall') {
    const w = level.walls.find((x) => x.id === sel.id);
    const ends = w && findWallEnds(level, w);
    return ends ? boxOf([...ends]) : null;
  }
  if (sel.kind === 'opening') {
    for (const w of level.walls) {
      const o = w.openings.find((x) => x.id === sel.id);
      const ends = o && findWallEnds(level, w);
      if (!o || !ends) continue;
      const [a, b] = ends;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const t = (o.offset + o.width / 2) / len;
      return boxOf([{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }]);
    }
    return null;
  }
  if (sel.kind === 'note') {
    const n = (level.notes ?? []).find((x) => x.id === sel.id);
    return n ? boxOf(n.to ? [n.pos, n.to] : [n.pos]) : null;
  }
  return null;
}
