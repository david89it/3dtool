import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../catalogue/items';
import { effectiveDims, itemParts, newPlacedItem } from '../catalogue/catalogue';
import { overrideColor, partColor } from '../catalogue/colors';
import { buildAiItem, cleanUrl, describeSchema, splitUrl, validateDescription } from './describeModel';

const good = {
  name: 'Tan leather lounge chair',
  aliases: ['Lounge chair', 'leather chair', 'lounge chair', 'a', 'b', 'c', 'd'],
  category: 'sit',
  baseItemId: 'armchair',
  dims: { w: 850, d: 880, h: 800 },
  mount: 'floor',
  colorHex: '#b5793f',
  material: 'tan leather',
  sizeConfidence: 'typical',
  notes: 'Typical lounge chair size.',
};

describe('describeSchema', () => {
  const s = describeSchema() as any;
  it('lists every catalogue id as the base shape', () => {
    expect(s.properties.baseItemId.enum).toEqual(CATALOGUE.map((c) => c.id));
    expect(s.properties.baseItemId.enum).toContain('armchair');
  });
  it('has the required fields and categories', () => {
    expect(s.required).toEqual(expect.arrayContaining(['name', 'aliases', 'category', 'baseItemId', 'dims', 'mount', 'colorHex', 'material', 'sizeConfidence', 'notes']));
    expect(s.properties.category.enum).toContain('sleep');
    expect(s.properties.colorHex.pattern).toBe('^#[0-9a-f]{6}$');
    expect(s.properties.sizeConfidence.enum).toEqual(['stated', 'typical', 'guess']);
    expect(s.additionalProperties).toBe(false);
  });
  it('can be built from a given id list', () => {
    expect((describeSchema(['a', 'b']) as any).properties.baseItemId.enum).toEqual(['a', 'b']);
  });
});

describe('validateDescription', () => {
  it('accepts a good answer and trims the aliases to 5 unique lowercase', () => {
    const d = validateDescription(good);
    expect(d.name).toBe('Tan leather lounge chair');
    expect(d.aliases.length).toBe(5);
    expect(d.aliases).toContain('lounge chair');
    expect(new Set(d.aliases).size).toBe(d.aliases.length);
    expect(d.colorHex).toBe('#b5793f');
    expect(d.sizeConfidence).toBe('typical');
  });
  it('clamps estimated sizes to the base range', () => {
    const d = validateDescription({ ...good, dims: { w: 3000, d: 100, h: 800 } });
    const r = CATALOGUE.find((c) => c.id === 'armchair')!.resizable;
    expect(d.dims.w).toBe(r.w![1]);
    expect(d.dims.d).toBe(r.d![0]);
  });
  it('keeps a stated size beyond the base range, within 100–4000', () => {
    const d = validateDescription({ ...good, baseItemId: 'sideboard', dims: { w: 2400, d: 450, h: 750 }, sizeConfidence: 'stated' });
    expect(d.dims.w).toBe(2400);
    expect(validateDescription({ ...good, sizeConfidence: 'stated', dims: { w: 9000, d: 5, h: 800 } }).dims).toMatchObject({ w: 4000, d: 100 });
  });
  it('uses 100–4000 when the base is unknown, and falls back to the custom box', () => {
    const d = validateDescription({ ...good, baseItemId: 'nonsense', dims: { w: 99999, d: 20, h: 1000.6 } });
    expect(d.baseItemId).toBe('custom');
    expect(d.dims).toEqual({ w: 4000, d: 100, h: 1001 });
  });
  it('drops a bad colour and defaults unknown enums', () => {
    const d = validateDescription({ ...good, colorHex: 'tan', category: 'weird', mount: 'sky', sizeConfidence: 'sure' });
    expect(d.colorHex).toBeUndefined();
    expect(d.category).toBe('sit');
    expect(d.mount).toBe('floor');
    expect(d.sizeConfidence).toBe('guess');
    expect(validateDescription({ ...good, colorHex: '#B5793F' }).colorHex).toBe('#b5793f');
  });
  it('marks sizes it had to fill in as a guess', () => {
    const d = validateDescription({ ...good, dims: { w: 850 } });
    expect(d.sizeConfidence).toBe('guess');
    expect(d.dims.d).toBe(900); // the armchair default
  });
  it('refuses junk and nameless answers', () => {
    expect(() => validateDescription(null)).toThrow();
    expect(() => validateDescription('x')).toThrow();
    expect(() => validateDescription({ ...good, name: '  ' })).toThrow(/name/);
  });
});

describe('buildAiItem', () => {
  const desc = validateDescription(good);
  const item = buildAiItem(desc, { text: 'tan leather lounge chair' }, 'ai-test');

  it('is a catalogue item with the described sizes and tint', () => {
    expect(item.id).toBe('ai-test');
    expect(item.defaultDims).toEqual({ w: 850, d: 880, h: 800 });
    expect(item.tint).toBe('#b5793f');
    expect(item.category).toBe('sit');
    expect(item.mount).toBe('floor');
    expect(item.aliases).toContain('tan leather lounge chair');
    expect(item.source).toEqual({ kind: 'description', text: 'tan leather lounge chair', sizeConfidence: 'typical' });
  });
  it('copies clearances and rules from the base and scales the geometry', () => {
    const base = CATALOGUE.find((c) => c.id === 'armchair')!;
    expect(item.clearance).toEqual(base.clearance);
    expect(item.clearance).not.toBe(base.clearance);
    expect(item.rules).toEqual(base.rules);
    const placed = newPlacedItem(item, { x: 0, y: 0 });
    const parts = itemParts(placed, item);
    const top = Math.max(...parts.map((p) => p.pos[1] + p.size[1] / 2));
    expect(top).toBeCloseTo((800 / 950) * Math.max(...base.geometry.map((p) => p.pos[1] + p.size[1] / 2)), 3);
    expect(effectiveDims(placed, item)).toEqual({ w: 850, d: 880, h: 800 });
  });
  it('allows resizing around the chosen size', () => {
    const wide = buildAiItem(validateDescription({ ...good, baseItemId: 'sideboard', dims: { w: 2400, d: 450, h: 750 }, sizeConfidence: 'stated' }), { text: '2.4 m oak sideboard' });
    expect(wide.resizable.w![1]).toBeGreaterThanOrEqual(2400);
    expect(wide.id.startsWith('ai-')).toBe(true);
  });
  it('records an image source, and uses a plain box for an unknown base', () => {
    const img = buildAiItem(validateDescription({ ...good, baseItemId: 'zzz' }), { url: 'https://example.com/a.jpg' }, 'ai-x');
    expect(img.source).toMatchObject({ kind: 'image', url: 'https://example.com/a.jpg' });
    expect(img.geometry.length).toBe(1);
    expect(img.geometry[0].colorToken).toBe('custom');
    expect(img.clearance).toEqual([]);
  });
  it('swaps to a plain box when the mounting differs from the base', () => {
    const wall = buildAiItem(validateDescription({ ...good, mount: 'wall' }), {}, 'ai-w');
    expect(wall.geometry[0].colorToken).toBe('custom');
  });
  it('scales the states of a base that has them', () => {
    const m = buildAiItem(validateDescription({ ...good, baseItemId: 'bed-murphy', category: 'sleep', dims: { w: 1500, d: 400, h: 2000 }, sizeConfidence: 'stated' }), {}, 'ai-m');
    expect(Object.keys(m.states ?? {}).length).toBeGreaterThan(1);
  });
});

describe('tint', () => {
  it('colours the main materials, not glass, and her finish wins', () => {
    expect(overrideColor('fabric', undefined, '#b5793f')).toBe('#b5793f');
    expect(overrideColor('glass', undefined, '#b5793f')).toBeUndefined();
    expect(overrideColor('wood', '#111111', '#b5793f')).toBe('#111111');
    expect(partColor('fabric', undefined, '#b5793f')).toBe('#b5793f');
    expect(partColor('fabric')).not.toBe('#b5793f');
  });
});

describe('links', () => {
  it('finds a link in the text', () => {
    expect(splitUrl('lounge chair https://example.com/chair.jpg.')).toEqual({ text: 'lounge chair', url: 'https://example.com/chair.jpg' });
    expect(splitUrl('just words')).toEqual({ text: 'just words' });
  });
  it('only accepts http and https', () => {
    expect(cleanUrl('https://i.pinimg.com/x.jpg')).toBe('https://i.pinimg.com/x.jpg');
    expect(cleanUrl('javascript:alert(1)')).toBeUndefined();
    expect(cleanUrl('not a url')).toBeUndefined();
    expect(cleanUrl('  ')).toBeUndefined();
  });
});
