// Shared helpers for placed furniture. Used by the 2D editor, the 3D view
// and the rules engine, so everything agrees on sizes and footprints.
//
// Conventions (see also parts.ts):
// - PlacedItem.pos is the centre of the item's footprint in its BASE state
//   (the catalogue's default/first state). rotationDeg turns clockwise on
//   screen; at 0 the item's front (+z) faces plan +y (down the screen).
// - PlacedItem.dims is her chosen size in the base state. Other states
//   (Murphy bed "deployed", table "extended"...) scale their catalogue dims
//   by the same ratios, and keep the BACK edge where it is: a deployed
//   Murphy bed grows forward from the wall.

import type { CatalogueItem, PlacedItem, PrimitivePart, Project, Vec2 } from '../model/types';
import { uid } from '../model/ids';
import { CATALOGUE } from './items';
import { BUILDERS } from './builders';

export type Dims = { w: number; d: number; h: number };

export function allCatalogue(project: Pick<Project, 'catalogueOverrides'>): CatalogueItem[] {
  return [...CATALOGUE, ...project.catalogueOverrides];
}

export function findCatalogueItem(project: Pick<Project, 'catalogueOverrides'>, id: string): CatalogueItem | undefined {
  return project.catalogueOverrides.find((c) => c.id === id) ?? CATALOGUE.find((c) => c.id === id);
}

export function stateNames(cat: CatalogueItem): string[] {
  return cat.states ? Object.keys(cat.states) : [];
}

/** The state an item is in (the first state if unset), or undefined for stateless items. */
export function currentState(item: PlacedItem, cat: CatalogueItem): string | undefined {
  const names = stateNames(cat);
  if (names.length === 0) return undefined;
  return item.state && names.includes(item.state) ? item.state : names[0];
}

function baseDims(cat: CatalogueItem): Dims {
  const names = stateNames(cat);
  return names.length ? cat.states![names[0]].dims : cat.defaultDims;
}

/** Size of the item as it is now (its state applied to her chosen size). */
export function effectiveDims(item: PlacedItem, cat: CatalogueItem): Dims {
  const st = currentState(item, cat);
  if (!st) return item.dims;
  const base = baseDims(cat);
  const sd = cat.states![st].dims;
  return {
    w: (sd.w * item.dims.w) / base.w,
    d: (sd.d * item.dims.d) / base.d,
    h: (sd.h * item.dims.h) / base.h,
  };
}

/** Unit vectors in plan for the item's front (+z) and its local +x. */
export function itemAxes(item: Pick<PlacedItem, 'rotationDeg'>): { front: Vec2; xAxis: Vec2 } {
  const r = (item.rotationDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  // Local +x -> plan (c, s); local +z -> plan (-s, c).
  return { xAxis: { x: c, y: s }, front: { x: -s, y: c } };
}

/** Plan position of the footprint centre in the current state (back edge fixed). */
export function footprintCentre(item: PlacedItem, cat: CatalogueItem): Vec2 {
  const eff = effectiveDims(item, cat);
  const shift = (eff.d - item.dims.d) / 2;
  const { front } = itemAxes(item);
  return { x: item.pos.x + front.x * shift, y: item.pos.y + front.y * shift };
}

/** Map a point in the item's local frame (x, z) to plan, relative to the current footprint centre. */
export function localToPlan(item: PlacedItem, cat: CatalogueItem, x: number, z: number): Vec2 {
  const c = footprintCentre(item, cat);
  const { front, xAxis } = itemAxes(item);
  return { x: c.x + xAxis.x * x + front.x * z, y: c.y + xAxis.y * x + front.y * z };
}

/** Footprint corners in plan: back-left, back-right, front-right, front-left (local -x is "left"). */
export function footprint(item: PlacedItem, cat: CatalogueItem): Vec2[] {
  const { w, d } = effectiveDims(item, cat);
  return [
    localToPlan(item, cat, -w / 2, -d / 2),
    localToPlan(item, cat, w / 2, -d / 2),
    localToPlan(item, cat, w / 2, d / 2),
    localToPlan(item, cat, -w / 2, d / 2),
  ];
}

/**
 * Primitive parts for the item as it is now, scaled from the catalogue's
 * reference size to the effective size. Positions are in the item frame
 * centred on the current footprint (use localToPlan / footprintCentre).
 */
export function itemParts(item: PlacedItem, cat: CatalogueItem): PrimitivePart[] {
  const st = currentState(item, cat);
  const ref = st ? cat.states![st].dims : cat.defaultDims;
  const parts = st ? cat.states![st].geometry : cat.geometry;
  const eff = effectiveDims(item, cat);
  const builder = cat.builder ? BUILDERS[cat.builder] : undefined;
  if (builder) return builder(item, eff);
  const kx = eff.w / ref.w;
  const ky = eff.h / ref.h;
  const kz = eff.d / ref.d;
  return parts.map((p) => {
    const round = p.shape === 'cylinder';
    // Cylinders stay round: scale the diameter by the smaller horizontal factor.
    const kr = Math.min(kx, kz);
    return {
      ...p,
      pos: [p.pos[0] * kx, p.pos[1] * ky, p.pos[2] * kz],
      size: round ? [p.size[0] * kr, p.size[1] * ky, p.size[2] * kr] : [p.size[0] * kx, p.size[1] * ky, p.size[2] * kz],
    };
  });
}

/** Height of the lowest part's underside (wall units and mirrors float). */
export function bottomHeight(item: PlacedItem, cat: CatalogueItem): number {
  const parts = itemParts(item, cat);
  if (parts.length === 0) return 0;
  return Math.min(...parts.map((p) => p.pos[1] - p.size[1] / 2));
}

/** Top of the tallest part. */
export function topHeight(item: PlacedItem, cat: CatalogueItem): number {
  const parts = itemParts(item, cat);
  if (parts.length === 0) return effectiveDims(item, cat).h;
  return Math.max(...parts.map((p) => p.pos[1] + p.size[1] / 2));
}

/**
 * Does this item block floor space you walk through? Rugs, ceiling lights
 * and anything hung above ~0.9 m (wall cupboards, mirrors) do not.
 */
export function isFloorObstacle(item: PlacedItem, cat: CatalogueItem): boolean {
  if (cat.mount === 'ceiling') return false;
  if (topHeight(item, cat) < 40) return false;
  return bottomHeight(item, cat) < 900;
}

export function newPlacedItem(cat: CatalogueItem, pos: Vec2, rotationDeg = 0): PlacedItem {
  const names = stateNames(cat);
  return {
    id: uid('i'),
    catalogueId: cat.id,
    pos: { x: pos.x, y: pos.y },
    rotationDeg,
    dims: { ...(names.length ? cat.states![names[0]].dims : cat.defaultDims) },
    ...(names.length ? { state: names[0] } : {}),
    ...(cat.price !== undefined ? { price: cat.price } : {}),
  };
}

/**
 * Plan rectangles of the parts you could bump into: everything whose
 * underside is below 0.9 m. A bookcase surround gives its two towers, not
 * the opening between them; a corner sofa gives its L. Cylinders give their
 * bounding square. Empty for items that only float above head height.
 */
export function obstacleRects(item: PlacedItem, cat: CatalogueItem): Vec2[][] {
  const out: Vec2[][] = [];
  for (const p of itemParts(item, cat)) {
    if (p.pos[1] - p.size[1] / 2 >= 900) continue;
    if (p.size[1] < 1 && p.pos[1] < 40) continue;
    const [x, , z] = p.pos;
    const hx = p.size[0] / 2;
    const hz = p.size[2] / 2;
    out.push([
      localToPlan(item, cat, x - hx, z - hz),
      localToPlan(item, cat, x + hx, z - hz),
      localToPlan(item, cat, x + hx, z + hz),
      localToPlan(item, cat, x - hx, z + hz),
    ]);
  }
  return out;
}

/** Plain-language names for states. */
export const STATE_LABEL: Record<string, string> = {
  folded: 'Folded away',
  deployed: 'Folded down',
  closed: 'Closed',
  extended: 'Extended',
  open: 'Open',
  sofa: 'As a sofa',
  bed: 'As a bed',
};
