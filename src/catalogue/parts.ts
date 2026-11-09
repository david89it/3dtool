// Building blocks for catalogue items.
//
// Item frame (millimetres): x across the width (-w/2..w/2), y up from the
// floor, z through the depth with the BACK at -d/2 (against the wall) and
// the FRONT at +d/2 (where you stand to use it). A part's `pos` is its
// centre; `size` is [x, y, z]. Cylinders use size [diameter, height, diameter].
//
// Clearance sides: 'left' is local -x and 'right' is local +x (as drawn in
// the item frame). In plan at rotation 0, the front (+z) faces down the
// screen; rotation turns clockwise.

import type { PrimitivePart } from '../model/types';

export const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string): PrimitivePart => ({
  shape: 'box',
  pos: [x, y, z],
  size: [sx, sy, sz],
  colorToken: c,
});

export const cyl = (x: number, y: number, z: number, dia: number, h: number, c: string): PrimitivePart => ({
  shape: 'cylinder',
  pos: [x, y, z],
  size: [dia, h, dia],
  colorToken: c,
});

/** A box standing on the floor: give its bottom height instead of its centre. */
export const slab = (x: number, bottom: number, z: number, sx: number, sy: number, sz: number, c: string) =>
  box(x, bottom + sy / 2, z, sx, sy, sz, c);

export function bed(w: number, d: number, opts: { head?: number; frame?: string; linen?: string } = {}): PrimitivePart[] {
  const head = opts.head ?? 1000;
  return [
    slab(0, 0, 40, w, 300, d - 80, opts.frame ?? 'wood'),
    slab(0, 300, 40, w - 60, 250, d - 140, opts.linen ?? 'linen'),
    slab(0, 550, -d / 2 + 380, w - 300, 120, 400, 'white'), // pillows
    slab(0, 0, -d / 2 + 40, w, head, 80, opts.frame ?? 'wood'),
  ];
}

export function sofa(w: number, d: number, c = 'fabric'): PrimitivePart[] {
  const arm = 180;
  return [
    slab(0, 0, 0, w, 420, d, c),
    slab(0, 420, 60, w - 2 * arm, 120, d - 260, c),
    slab(0, 420, -d / 2 + 110, w, 430, 220, c),
    slab(-w / 2 + arm / 2, 420, 0, arm, 220, d, c),
    slab(w / 2 - arm / 2, 420, 0, arm, 220, d, c),
  ];
}

export function table(w: number, d: number, h: number, top = 'wood', leg = 'wood'): PrimitivePart[] {
  const t = 40;
  const lx = w / 2 - 60;
  const lz = d / 2 - 60;
  return [
    slab(0, h - t, 0, w, t, d, top),
    ...[
      [-lx, -lz],
      [lx, -lz],
      [-lx, lz],
      [lx, lz],
    ].map(([x, z]) => slab(x, 0, z, 50, h - t, 50, leg)),
  ];
}

export function roundTable(dia: number, h: number, top = 'wood'): PrimitivePart[] {
  return [cyl(0, h - 20, 0, dia, 40, top), cyl(0, (h - 40) / 2, 0, 90, h - 40, 'metal'), cyl(0, 15, 0, dia * 0.5, 30, 'metal')];
}

export function cabinet(w: number, d: number, h: number, c = 'white', plinth = 100): PrimitivePart[] {
  return [slab(0, 0, -10, w - 20, plinth, d - 60, 'dark'), slab(0, plinth, 0, w, h - plinth, d, c)];
}

export function kitchenBase(w: number, extra: PrimitivePart[] = []): PrimitivePart[] {
  return [
    slab(0, 0, -20, w, 150, 520, 'dark'),
    slab(0, 150, -10, w, 720, 560, 'cabinet'),
    slab(0, 870, 0, w, 40, 600, 'worktop'),
    ...extra,
  ];
}

export function chair(w: number, d: number, h: number, c = 'wood'): PrimitivePart[] {
  const lx = w / 2 - 30;
  const lz = d / 2 - 30;
  return [
    slab(0, 430, 20, w, 40, d - 40, c),
    slab(0, 470, -d / 2 + 20, w, h - 470, 30, c),
    ...[
      [-lx, -lz],
      [lx, -lz],
      [-lx, lz],
      [lx, lz],
    ].map(([x, z]) => slab(x, 0, z, 35, 430, 35, c)),
  ];
}
