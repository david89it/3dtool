import { describe, expect, it } from 'vitest';
import { buildSeedProject, LEVEL_IDS } from '../model/seed';
import { newPlacedItem, findCatalogueItem } from '../catalogue/catalogue';
import { paletteCommands } from './paletteCommands';
import { buildIndex, makeSearcher } from './searchIndex';
import { duplicateAsOption } from '../model/schemes';
import type { Project } from '../model/types';

function project(): Project {
  const p = buildSeedProject();
  const second = p.levels.find((l) => l.id === LEVEL_IDS.second)!;
  const bed = findCatalogueItem(p, 'bed-murphy')!;
  // Put a Murphy bed in the middle of Bedroom 1 (it is on the second floor in the seed).
  const room = second.rooms.find((r) => r.name === 'Bedroom 1')!;
  const pts = room.boundary.map((id) => second.nodes.find((n) => n.id === id)!.pos);
  const c = { x: pts.reduce((t, q) => t + q.x, 0) / pts.length, y: pts.reduce((t, q) => t + q.y, 0) / pts.length };
  second.items.push(newPlacedItem(bed, c));
  return p;
}

const commands = () => paletteCommands().map(({ id, label, keywords }) => ({ id, label, keywords }));

describe('search index', () => {
  const p = project();
  const index = buildIndex(p, commands());
  const labels = index.map((e) => e.label);

  it('holds rooms on every floor, named with their floor', () => {
    expect(labels).toContain('Bedroom 2: Second floor');
    expect(labels).toContain('Bedroom 1: Second floor');
    const room = index.find((e) => e.label === 'Bedroom 2: Second floor')!;
    expect(room.kind).toBe('room');
    expect(room.levelId).toBe(LEVEL_IDS.second);
    expect(room.roomId).toBeTruthy();
  });

  it('holds placed pieces by catalogue name and the room they are in', () => {
    const it = index.find((e) => e.kind === 'item')!;
    expect(it.label).toBe('Murphy bed: Bedroom 1');
    expect(it.detail).toBe('Second floor');
    expect(it.itemId).toBeTruthy();
  });

  it('holds every catalogue item as "Add: ..."', () => {
    expect(labels).toContain('Add: Japanese soaking bath (square)');
    const cat = index.find((e) => e.label.startsWith('Add: Japanese'))!;
    expect(cat.kind).toBe('catalogue');
    expect(cat.catalogueId).toBe('bath-japanese');
  });

  it('holds the commands she asked for', () => {
    for (const l of ['Undo', 'Redo', 'Versions', 'Budget and shopping list', 'Print or save as PDF', 'Measure on site', 'Import a scan', 'Settings', 'Show shortcuts', 'Toggle 3D', 'Go to Trace', 'Go to Openings', 'Go to Furnish', 'Go to Advice', 'Go to 3D']) {
      expect(labels).toContain(l);
    }
  });

  it('only lists the showing option of a floor', () => {
    const q = project();
    duplicateAsOption(q, LEVEL_IDS.second);
    const idx = buildIndex(q, []);
    expect(idx.filter((e) => e.label === 'Bedroom 2: Second floor')).toHaveLength(1);
  });
});

describe('searching', () => {
  const p = project();
  const search = makeSearcher(buildIndex(p, commands()));

  it('finds a catalogue item by a loose word', () => {
    expect(search('soaking').map((e) => e.label)).toContain('Add: Japanese soaking bath (square)');
    const bath = search('bath');
    expect(bath.length).toBeGreaterThan(1);
    expect(bath.map((e) => e.label)).toContain('Add: Japanese soaking bath (square)');
  });

  it('finds a room, and puts it before the pieces inside it', () => {
    const r = search('Bedroom 2');
    expect(r[0].label).toBe('Bedroom 2: Second floor');
  });

  it('finds a placed piece and a command', () => {
    expect(search('murphy').map((e) => e.label)).toContain('Murphy bed: Bedroom 1');
    expect(search('undo')[0].label).toBe('Undo');
    expect(search('pdf')[0].label).toBe('Print or save as PDF');
  });

  it('with nothing typed lists recent picks first, then commands', () => {
    const r = search('', ['cmd:settings', 'gone']);
    expect(r[0].label).toBe('Settings');
    expect(r.slice(1).every((e) => e.kind === 'command')).toBe(true);
    expect(r.filter((e) => e.label === 'Settings')).toHaveLength(1);
  });

  it('moves a recent pick up when it ties with others', () => {
    const plain = search('go to').map((e) => e.id);
    const recent = search('go to', [plain[plain.length - 1]]).map((e) => e.id);
    expect(recent[0]).toBe(plain[plain.length - 1]);
  });

  it('says nothing found for nonsense', () => {
    expect(search('qzxwv')).toEqual([]);
  });
});
