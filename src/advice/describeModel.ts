// The pure half of "Describe a piece": the JSON schema, checking what Claude
// sends back, and building the catalogue item. No network and no SDK, so the
// Furnish panel can load it up front; the call itself is in describeItem.ts.

import type { CatalogueItem } from '../model/types';
import { uid } from '../model/ids';
import { CATALOGUE, CATEGORY_LABEL, customGeometry } from '../catalogue/items';

type Cat = CatalogueItem['category'];
type Mount = CatalogueItem['mount'];
type Dims = { w: number; d: number; h: number };

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as Cat[];
export const SIZE_CONFIDENCE = ['stated', 'typical', 'guess'] as const;
export type SizeConfidence = (typeof SIZE_CONFIDENCE)[number];

/** Sanity bounds for a size when the base shape gives no range (mm). */
export const MIN_DIM = 100;
export const MAX_DIM = 4000;

/** What Claude returns, after our own checks. */
export interface ItemDescription {
  name: string;
  aliases: string[];
  category: Cat;
  baseItemId: string;
  dims: Dims;
  mount: Mount;
  colorHex?: string;
  material: string;
  sizeConfidence: SizeConfidence;
  notes: string;
}

export interface DescribeInput {
  text: string;
  imageUrl?: string;
}

const catalogueIds = () => CATALOGUE.map((c) => c.id);

/** JSON schema for structured outputs. The base shapes come from the catalogue at runtime. */
export function describeSchema(ids: string[] = catalogueIds()): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short product-style name, e.g. "Tan leather lounge chair".' },
      aliases: { type: 'array', items: { type: 'string' }, description: 'Up to 5 other words someone might search for.' },
      category: { type: 'string', enum: CATEGORIES },
      baseItemId: { type: 'string', enum: ids, description: 'The existing catalogue item with the closest shape.' },
      dims: {
        type: 'object',
        properties: {
          w: { type: 'integer', description: 'Width in mm, left to right as seen from the front (100 to 4000).' },
          d: { type: 'integer', description: 'Depth in mm, front to back (100 to 4000).' },
          h: { type: 'integer', description: 'Height in mm (100 to 4000).' },
        },
        required: ['w', 'd', 'h'],
        additionalProperties: false,
      },
      mount: { type: 'string', enum: ['floor', 'wall', 'ceiling'] },
      colorHex: { type: 'string', pattern: '^#[0-9a-f]{6}$', description: 'Main colour as lowercase hex, e.g. "#b5793f".' },
      material: { type: 'string', description: 'Main material, e.g. "tan leather, walnut legs".' },
      sizeConfidence: { type: 'string', enum: [...SIZE_CONFIDENCE], description: '"stated" if the size was given, "typical" for a usual retail size, "guess" otherwise.' },
      notes: { type: 'string', description: 'One short sentence on anything uncertain.' },
    },
    required: ['name', 'aliases', 'category', 'baseItemId', 'dims', 'mount', 'colorHex', 'material', 'sizeConfidence', 'notes'],
    additionalProperties: false,
  };
}

/** Pull a pasted web address out of the text, so one box can hold both. */
export function splitUrl(text: string): { text: string; url?: string } {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return { text: text.trim() };
  return { text: text.replace(m[0], ' ').replace(/\s+/g, ' ').trim(), url: m[0].replace(/[.,;)]+$/, '') };
}

/** Only http(s) links are sent to the API or shown as links. */
export function cleanUrl(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const HEX = /^#[0-9a-f]{6}$/;

/** The range a size on one axis is allowed in, for this base shape. */
export function dimRange(base: CatalogueItem | undefined, axis: keyof Dims, confidence: SizeConfidence): [number, number] {
  // A size she stated is kept as stated, within sane bounds; otherwise the
  // estimate stays inside what the base shape is known to stretch to.
  const r = confidence === 'stated' ? undefined : base?.resizable[axis];
  return r ? [Math.min(r[0], r[1]), Math.max(r[0], r[1])] : [MIN_DIM, MAX_DIM];
}

/**
 * Check what Claude sent and make it safe: unknown ids fall back to the
 * 'custom' box, sizes are clamped, colours must be #rrggbb. Throws an Error
 * with a plain message when it is not usable at all.
 */
export function validateDescription(raw: unknown): ItemDescription {
  if (!raw || typeof raw !== 'object') throw new Error('Claude sent back something this tool could not read. Try again.');
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const name = str(r.name, 80);
  if (!name) throw new Error('Claude did not give the piece a name. Try again with a few more words.');

  const baseItemId = typeof r.baseItemId === 'string' && CATALOGUE.some((c) => c.id === r.baseItemId) ? r.baseItemId : 'custom';
  const base = CATALOGUE.find((c) => c.id === baseItemId);
  const sizeConfidence: SizeConfidence = (SIZE_CONFIDENCE as readonly unknown[]).includes(r.sizeConfidence) ? (r.sizeConfidence as SizeConfidence) : 'guess';
  const category: Cat = (CATEGORIES as unknown[]).includes(r.category) ? (r.category as Cat) : (base?.category ?? 'decor');
  const mount: Mount = r.mount === 'wall' || r.mount === 'ceiling' || r.mount === 'floor' ? r.mount : (base?.mount ?? 'floor');

  const rawDims = (r.dims && typeof r.dims === 'object' ? r.dims : {}) as Record<string, unknown>;
  const dims = { w: 0, d: 0, h: 0 };
  let missing = false;
  for (const axis of ['w', 'd', 'h'] as const) {
    const v = Number(rawDims[axis]);
    const fallback = base?.defaultDims[axis] ?? 600;
    if (!Number.isFinite(v) || v <= 0) missing = true;
    const [lo, hi] = dimRange(base, axis, sizeConfidence);
    dims[axis] = Math.round(clamp(Number.isFinite(v) && v > 0 ? v : fallback, lo, hi));
  }

  const hex = typeof r.colorHex === 'string' ? r.colorHex.trim().toLowerCase() : '';
  const aliases = Array.isArray(r.aliases)
    ? [...new Set(r.aliases.filter((a): a is string => typeof a === 'string').map((a) => a.trim().toLowerCase()).filter(Boolean))].slice(0, 5)
    : [];

  return {
    name,
    aliases,
    category,
    baseItemId,
    dims,
    mount,
    colorHex: HEX.test(hex) ? hex : undefined,
    material: str(r.material, 120),
    sizeConfidence: missing ? 'guess' : sizeConfidence,
    notes: str(r.notes, 240),
  };
}

function scaleParts(parts: CatalogueItem['geometry'], from: Dims, to: Dims): CatalogueItem['geometry'] {
  const kx = to.w / from.w;
  const ky = to.h / from.h;
  const kz = to.d / from.d;
  return parts.map((p) => {
    const kr = Math.min(kx, kz);
    return {
      ...p,
      pos: [p.pos[0] * kx, p.pos[1] * ky, p.pos[2] * kz] as [number, number, number],
      size: (p.shape === 'cylinder' ? [p.size[0] * kr, p.size[1] * ky, p.size[2] * kr] : [p.size[0] * kx, p.size[1] * ky, p.size[2] * kz]) as [number, number, number],
    };
  });
}

/** The range an axis may be resized to later: the base's, widened to hold the chosen size. */
function resizeRange(base: CatalogueItem | undefined, axis: keyof Dims, v: number): [number, number] {
  const r = base?.resizable[axis];
  if (r) return [Math.min(r[0], v), Math.max(r[1], v)];
  return [Math.max(50, Math.round(v / 2)), Math.min(6000, Math.round(v * 2))];
}

/**
 * Turn a checked description into a catalogue item for project.catalogueOverrides.
 * Shape and clearances come from the base item, scaled to the sizes.
 */
export function buildAiItem(desc: ItemDescription, source: { text?: string; url?: string }, id: string = `ai-${uid('c')}`): CatalogueItem {
  const base = CATALOGUE.find((c) => c.id === desc.baseItemId);
  const dims = { ...desc.dims };
  const baseNames = base?.states ? Object.keys(base.states) : [];
  const baseDims: Dims = base ? (baseNames.length ? base.states![baseNames[0]].dims : base.defaultDims) : dims;
  // A base used for a different mounting (a floor item asked for on the wall)
  // would float at floor height, so it gets the plain box instead.
  const useBase = !!base && base.mount === desc.mount;

  const geometry = useBase ? scaleParts(baseNames.length ? base!.states![baseNames[0]].geometry : base!.geometry, baseDims, dims) : customGeometry(dims.w, dims.d, dims.h, desc.mount);
  const states: CatalogueItem['states'] =
    useBase && base!.states
      ? Object.fromEntries(
          Object.entries(base!.states).map(([k, st]) => {
            const to = { w: (st.dims.w * dims.w) / baseDims.w, d: (st.dims.d * dims.d) / baseDims.d, h: (st.dims.h * dims.h) / baseDims.h };
            return [k, { dims: to, geometry: scaleParts(st.geometry, st.dims, to) }];
          }),
        )
      : undefined;

  const ownName = desc.name.toLowerCase();
  const aliases = [...new Set([ownName, ...desc.aliases, 'my item'])];
  const kind = source.url ? 'image' : 'description';
  return {
    id,
    name: desc.name,
    aliases,
    category: desc.category,
    defaultDims: dims,
    resizable: { w: resizeRange(base, 'w', dims.w), d: resizeRange(base, 'd', dims.d), h: resizeRange(base, 'h', dims.h) },
    mount: desc.mount,
    geometry,
    ...(states ? { states } : {}),
    clearance: useBase ? base!.clearance.map((c) => ({ ...c })) : [],
    rules: useBase && base!.rules ? [...base!.rules] : ['door-swing', 'loft-headroom'],
    ...(desc.colorHex ? { tint: desc.colorHex } : {}),
    source: {
      kind,
      ...(source.text ? { text: source.text } : {}),
      ...(source.url ? { url: source.url } : {}),
      sizeConfidence: desc.sizeConfidence,
    },
  };
}
