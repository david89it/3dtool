// Parametric shape builders for catalogue items that must not simply
// stretch when resized. A catalogue item names one in `builder`; itemParts()
// calls it with the item's current size and its `params`.
//
// Frame and conventions are the same as parts.ts: x across (-w/2..w/2),
// y up from the floor, z through the depth with the back at -d/2.

import type { PlacedItem, PrimitivePart } from '../model/types';
import { slab } from './parts';

export type Dims = { w: number; d: number; h: number };
export type Builder = (item: Pick<PlacedItem, 'params'>, dims: Dims) => PrimitivePart[];

/** Opening surround defaults (mm). */
export const SURROUND = { side: 600, gapW: 1200, gapH: 2100, minSide: 250, minGap: 500, board: 25 };

/**
 * The surround's three numbers as they are now. The gap is the opening it
 * frames and keeps its size; the towers take whatever width is left.
 */
export function surroundLayout(item: Pick<PlacedItem, 'params'>, dims: Dims): { side: number; gapW: number; gapH: number } {
  const gapW0 = item.params?.gapW ?? SURROUND.gapW;
  const gapW = Math.max(SURROUND.minGap, Math.min(gapW0, dims.w - 2 * SURROUND.minSide));
  const side = (dims.w - gapW) / 2;
  const gapH = Math.max(1200, Math.min(item.params?.gapH ?? SURROUND.gapH, dims.h - 250));
  return { side, gapW, gapH };
}

/** Shelves (and their spacing) in a box from y0 to y1. */
function shelves(x: number, w: number, d: number, y0: number, y1: number, pitch = 330): PrimitivePart[] {
  const out: PrimitivePart[] = [];
  const n = Math.max(0, Math.floor((y1 - y0) / pitch));
  const step = n > 0 ? (y1 - y0) / (n + 1) : 0;
  for (let i = 1; i <= n; i++) out.push(slab(x, y0 + i * step - SURROUND.board / 2, 0, w, SURROUND.board, d, 'joinery'));
  return out;
}

/**
 * Bookcase surround: a shelving tower each side of an opening and a bridge
 * of shelves over it, up to the cornice. The left tower has a glazed
 * cabinet in the middle. Everything is painted joinery.
 */
export const buildSurround: Builder = (item, dims) => {
  const { w, d, h } = dims;
  const { side, gapW, gapH } = surroundLayout(item, dims);
  const t = SURROUND.board;
  const plinth = 100;
  const parts: PrimitivePart[] = [];
  const back = 12;

  const tower = (cx: number, glazed: boolean) => {
    const x0 = cx - side / 2;
    const x1 = cx + side / 2;
    parts.push(slab(x0 + t / 2, 0, 0, t, h, d, 'joinery')); // outer upright
    parts.push(slab(x1 - t / 2, 0, 0, t, h, d, 'joinery')); // inner upright
    parts.push(slab(cx, 0, -d / 2 + back / 2, side - 2 * t, h, back, 'joinery')); // back panel
    parts.push(slab(cx, 0, -20, side - 2 * t, plinth, d - 40, 'joinery')); // plinth
    parts.push(slab(cx, plinth, 0, side - 2 * t, t, d, 'joinery')); // bottom shelf
    if (glazed) {
      const c0 = 900;
      const c1 = Math.min(1900, gapH - 100);
      parts.push(...shelves(cx, side - 2 * t, d - 30, plinth + t, c0));
      parts.push(slab(cx, c0, 0, side - 2 * t, t, d, 'joinery'));
      parts.push(...shelves(cx, side - 2 * t, d - 40, c0 + t, c1, 300));
      parts.push(slab(cx, c1, 0, side - 2 * t, t, d, 'joinery'));
      parts.push(slab(cx, c0 + t, d / 2 - 10, side - 2 * t - 30, c1 - c0 - t, 10, 'glass')); // glazed door
      parts.push(...shelves(cx, side - 2 * t, d - 30, c1 + t, h - t));
    } else {
      parts.push(...shelves(cx, side - 2 * t, d - 30, plinth + t, h - t));
    }
    parts.push(slab(cx, h - t, 0, side - 2 * t, t, d, 'joinery')); // top
  };

  tower(-w / 2 + side / 2, true);
  tower(w / 2 - side / 2, false);

  // Bridge over the opening.
  const head = 60; // the head board (lintel line) under the bridge
  parts.push(slab(0, gapH, 0, gapW, head, d, 'joinery'));
  parts.push(slab(0, gapH + head, -d / 2 + back / 2, gapW, Math.max(0, h - gapH - head), back, 'joinery'));
  parts.push(...shelves(0, gapW, d - 30, gapH + head, h - t, 300));
  parts.push(slab(0, h - t, 0, gapW, t, d, 'joinery'));
  // Cornice-style capping across the whole run.
  parts.push(slab(0, h - 2, 10, w, 40, d + 20, 'joinery'));
  return parts;
};

/** Modular storage (USM Haller style): one module is 750 wide, 750 high, 370 deep (mm). */
export const MODULE = { w: 750, h: 750, d: 370, tube: 20, foot: 30, maxAcross: 8, maxHigh: 5 };

/** How many modules across and high, from params (at least 1 each). */
export function moduleGrid(item: Pick<PlacedItem, 'params'>): { cols: number; rows: number } {
  const clamp = (v: number | undefined, max: number) => Math.max(1, Math.min(max, Math.round(v ?? 1)));
  return { cols: clamp(item.params?.cols, MODULE.maxAcross), rows: clamp(item.params?.rows, MODULE.maxHigh) };
}

/** Overall size of a module unit for a grid. */
export function moduleDims(cols: number, rows: number): Dims {
  return { w: cols * MODULE.w, d: MODULE.d, h: rows * MODULE.h + MODULE.foot };
}

/**
 * Modular storage: a chrome tube frame on small feet with a panel box in
 * every module (the panels take the piece's colour). Modules stack as rows.
 */
export const buildModules: Builder = (item, dims) => {
  const { cols, rows } = moduleGrid(item);
  const { tube, foot } = MODULE;
  const cw = dims.w / cols;
  const rh = (dims.h - foot) / rows;
  const d = dims.d;
  const parts: PrimitivePart[] = [];
  const x0 = -dims.w / 2;
  // Feet under every corner of the bottom row.
  for (let c = 0; c <= cols; c++) {
    for (const z of [-d / 2 + tube / 2, d / 2 - tube / 2]) parts.push(slab(x0 + c * cw, 0, z, tube, foot, tube, 'metal'));
  }
  // Uprights and rails at the front and back.
  for (const z of [-d / 2 + tube / 2, d / 2 - tube / 2]) {
    for (let c = 0; c <= cols; c++) parts.push(slab(x0 + c * cw, foot, z, tube, dims.h - foot, tube, 'metal'));
    for (let r = 0; r <= rows; r++) parts.push(slab(0, foot + r * rh - (r === rows ? tube : 0), z, dims.w, tube, tube, 'metal'));
  }
  // Side rails (depth) at every row line, both ends.
  for (let r = 0; r <= rows; r++) {
    for (const x of [x0 + tube / 2, -x0 - tube / 2]) parts.push(slab(x, foot + r * rh - (r === rows ? tube : 0), 0, tube, tube, d, 'metal'));
  }
  // A panel box in every module, slightly inset.
  const inset = 12;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      parts.push(slab(x0 + (c + 0.5) * cw, foot + r * rh + inset, 0, cw - 2 * inset, rh - 2 * inset, d - 2 * inset, 'cabinet'));
    }
  }
  return parts;
};

export const BUILDERS: Record<string, Builder> = {
  'opening-surround': buildSurround,
  modules: buildModules,
};
