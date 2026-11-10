// A curated paint palette: 32 colours in six groups, with plain descriptive
// names (no paint-brand names). A finish value stored in the project is a
// paint id from this list, a finish id from src/view3d/finishes.ts, or a
// free hex colour such as "#5a2a3a".

export interface Paint {
  id: string;
  name: string;
  hex: string;
  group: PaintGroup;
}

export type PaintGroup = 'Whites & off-whites' | 'Warm neutrals' | 'Greens' | 'Blues' | 'Pinks & reds' | 'Darks';

export const PAINT_GROUPS: PaintGroup[] = ['Whites & off-whites', 'Warm neutrals', 'Greens', 'Blues', 'Pinks & reds', 'Darks'];

function p(group: PaintGroup, name: string, hex: string): Paint {
  return { id: `paint-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, hex, group };
}

export const PAINTS: Paint[] = [
  p('Whites & off-whites', 'Chalk white', '#f4f3ef'),
  p('Whites & off-whites', 'Warm white', '#efe7d8'),
  p('Whites & off-whites', 'Soft cream', '#f1e8cf'),
  p('Whites & off-whites', 'Pale stone', '#e4dfd4'),
  p('Whites & off-whites', 'Cool white', '#eef1f3'),
  p('Whites & off-whites', 'Oat', '#e6dcc8'),

  p('Warm neutrals', 'Biscuit', '#d8c3a5'),
  p('Warm neutrals', 'Putty', '#c9bfae'),
  p('Warm neutrals', 'Mushroom', '#b9a99a'),
  p('Warm neutrals', 'Clay', '#b98f77'),
  p('Warm neutrals', 'Taupe', '#8f8274'),
  p('Warm neutrals', 'Ochre', '#c8963e'),

  p('Greens', 'Pale mint', '#cfdcd0'),
  p('Greens', 'Sage', '#b7c2a7'),
  p('Greens', 'Eucalyptus', '#8fa593'),
  p('Greens', 'Olive', '#7d7f4e'),
  p('Greens', 'Forest', '#2f4a3a'),

  p('Blues', 'Powder blue', '#bcd0e0'),
  p('Blues', 'Duck egg', '#b9d0cf'),
  p('Blues', 'Blue-grey', '#a9b4bd'),
  p('Blues', 'Slate blue', '#5b6f86'),
  p('Blues', 'Inky blue', '#24324a'),

  p('Pinks & reds', 'Blush', '#ebd0cc'),
  p('Pinks & reds', 'Plaster pink', '#e2c1b3'),
  p('Pinks & reds', 'Dusty rose', '#c58f8f'),
  p('Pinks & reds', 'Terracotta', '#b5593f'),
  p('Pinks & reds', 'Brick red', '#8b3a32'),

  p('Darks', 'Aubergine', '#5a2a3a'),
  p('Darks', 'Deep teal', '#1f4a4d'),
  p('Darks', 'Chocolate', '#4a3428'),
  p('Darks', 'Charcoal', '#3a3d42'),
  p('Darks', 'Off-black', '#2b2a29'),
];

export const WHITE_PAINT_ID = 'paint-chalk-white';

/** Older projects stored these wall finish ids; they now point at the same colours in the palette. */
export const LEGACY_PAINT_IDS: Record<string, string> = {
  'wall-white': 'paint-chalk-white',
  'wall-warm-white': 'paint-warm-white',
  'wall-sage': 'paint-sage',
  'wall-blue-grey': 'paint-blue-grey',
  'wall-plaster-pink': 'paint-plaster-pink',
};

export const HEX_RE = /^#[0-9a-f]{6}$/i;

export function isHex(v: string | undefined): v is string {
  return !!v && HEX_RE.test(v);
}

/** Accepts "5a2a3a", "#5A2A3A" or "#5a3" and returns "#5a2a3a", or null. */
export function normaliseHex(input: string): string | null {
  let t = input.trim().toLowerCase();
  if (t.startsWith('#')) t = t.slice(1);
  if (/^[0-9a-f]{3}$/.test(t)) t = t.replace(/./g, (c) => c + c);
  return /^[0-9a-f]{6}$/.test(t) ? `#${t}` : null;
}

export function findPaint(id: string | undefined): Paint | undefined {
  if (!id) return undefined;
  return PAINTS.find((x) => x.id === (LEGACY_PAINT_IDS[id] ?? id));
}

/** Hex colour of a paint id or a hex value; undefined for anything else. */
export function paintHex(id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (isHex(id)) return id.toLowerCase();
  return findPaint(id)?.hex;
}

/** Plain name for a paint id or hex ("Sage", "Custom colour #5a2a3a"). */
export function paintName(id: string | undefined): string {
  if (!id) return '';
  const hit = findPaint(id);
  if (hit) return hit.name;
  return isHex(id) ? `Custom colour ${id.toLowerCase()}` : id;
}

/** True when two finish values mean the same colour (a legacy id and its palette id match). */
export function sameFinish(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const norm = (v: string) => (isHex(v) ? v.toLowerCase() : (LEGACY_PAINT_IDS[v] ?? v));
  return norm(a) === norm(b);
}
