// Shapes for the "space needed" overlays around an item, in plan space.

import type { CatalogueItem, PlacedItem, Vec2 } from '../model/types';
import { currentState, effectiveDims, footprint, localToPlan, stateNames } from '../catalogue/catalogue';

export type ClearanceShape =
  | { kind: 'area'; strength: 'min' | 'ideal'; poly: Vec2[]; reason: string }
  | { kind: 'swing'; poly: Vec2[]; reason: string }
  | { kind: 'outline'; poly: Vec2[]; reason: string };

export function leafCount(w: number): number {
  return w <= 700 ? 1 : w <= 1300 ? 2 : 3;
}

function rect(item: PlacedItem, cat: CatalogueItem, x0: number, z0: number, x1: number, z1: number): Vec2[] {
  return [
    localToPlan(item, cat, x0, z0),
    localToPlan(item, cat, x1, z0),
    localToPlan(item, cat, x1, z1),
    localToPlan(item, cat, x0, z1),
  ];
}

export function clearanceShapes(item: PlacedItem, cat: CatalogueItem): ClearanceShape[] {
  const { w, d } = effectiveDims(item, cat);
  const out: ClearanceShape[] = [];
  for (const c of cat.clearance) {
    if (c.dynamic === 'doorSwing' && c.side === 'front') {
      const n = leafCount(w);
      const lw = w / n;
      for (let i = 0; i < n; i++) {
        const x0 = -w / 2 + i * lw;
        const x1 = x0 + lw;
        const hingeLeft = x0 + lw / 2 <= 0 || (n === 1);
        const hx = hingeLeft ? x0 : x1;
        const pts: Vec2[] = [localToPlan(item, cat, hx, d / 2)];
        for (let k = 0; k <= 16; k++) {
          const a = (k / 16) * (Math.PI / 2);
          const x = hingeLeft ? hx + Math.cos(a) * lw : hx - Math.cos(a) * lw;
          const z = d / 2 + Math.sin(a) * lw;
          pts.push(localToPlan(item, cat, x, z));
        }
        out.push({ kind: 'swing', poly: pts, reason: c.reason });
      }
      continue;
    }
    if (c.dynamic === 'drawerPull' && c.side === 'front') {
      out.push({ kind: 'outline', poly: rect(item, cat, -w / 2, d / 2, w / 2, d / 2 + c.min), reason: c.reason });
      continue;
    }
    if (c.dynamic === 'deploy') {
      const names = stateNames(cat);
      const now = currentState(item, cat);
      const other = names.find((s) => s !== names[0]);
      if (other && now === names[0]) {
        out.push({ kind: 'outline', poly: footprint({ ...item, state: other }, cat), reason: c.reason });
      } else if (!other) {
        out.push({ kind: 'outline', poly: rect(item, cat, -w / 2, d / 2, w / 2, d / 2 + c.min), reason: c.reason });
      }
      continue;
    }
    for (const strength of ['ideal', 'min'] as const) {
      const v = c[strength];
      if (v <= 0) continue;
      let poly: Vec2[];
      if (c.side === 'front') poly = rect(item, cat, -w / 2, d / 2, w / 2, d / 2 + v);
      else if (c.side === 'back') poly = rect(item, cat, -w / 2, -d / 2 - v, w / 2, -d / 2);
      else if (c.side === 'left') poly = rect(item, cat, -w / 2 - v, -d / 2, -w / 2, d / 2);
      else if (c.side === 'right') poly = rect(item, cat, w / 2, -d / 2, w / 2 + v, d / 2);
      else poly = rect(item, cat, -w / 2 - v, -d / 2 - v, w / 2 + v, d / 2 + v);
      out.push({ kind: 'area', strength, poly, reason: c.reason });
    }
  }
  return out;
}
