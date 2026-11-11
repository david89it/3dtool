// What the search palette (Ctrl/⌘ K) can find: rooms on every floor, pieces already placed,
// catalogue items to add, and commands. Pure, so it is tested without a browser.

import Fuse from 'fuse.js';
import type { Id, Level, Project, Vec2 } from '../model/types';
import { activeLevels } from '../model/schemes';
import { allCatalogue, findCatalogueItem } from '../catalogue/catalogue';
import { CATEGORY_LABEL } from '../catalogue/items';
import { pointInPolygon, signedArea } from '../geometry/vec';

export type SearchKind = 'room' | 'item' | 'catalogue' | 'command';

export interface SearchEntry {
  /** Stable id, used to remember recent picks. */
  id: string;
  kind: SearchKind;
  /** What she sees: "Bedroom 2: Second floor", "Murphy bed: Bedroom 1", "Add: Bath". */
  label: string;
  /** A second, quieter line (the floor, for a placed piece). */
  detail?: string;
  /** Other words that find it. */
  keywords: string[];
  levelId?: Id;
  roomId?: Id;
  itemId?: Id;
  catalogueId?: string;
  commandId?: string;
}

export interface CommandInfo {
  id: string;
  label: string;
  keywords: string[];
}

/** The room of a floor that a point is in (the smallest if rooms nest), by its wall centrelines. */
function roomAt(level: Level, p: Vec2): string | undefined {
  const pos = new Map(level.nodes.map((n) => [n.id, n.pos]));
  let best: { name: string; area: number } | undefined;
  for (const r of level.rooms) {
    const poly = r.boundary.map((id) => pos.get(id)).filter((v): v is Vec2 => !!v);
    if (poly.length < 3 || !r.name.trim() || !pointInPolygon(p, poly)) continue;
    const area = Math.abs(signedArea(poly));
    if (!best || area < best.area) best = { name: r.name, area };
  }
  return best?.name;
}

export function buildIndex(project: Project, commands: CommandInfo[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const level of activeLevels(project)) {
    for (const r of level.rooms) {
      if (!r.name.trim()) continue;
      out.push({ id: `room:${level.id}:${r.id}`, kind: 'room', label: `${r.name}: ${level.name}`, keywords: [r.name, level.name], levelId: level.id, roomId: r.id });
    }
    for (const it of level.items) {
      const cat = findCatalogueItem(project, it.catalogueId);
      if (!cat) continue;
      const room = roomAt(level, it.pos);
      out.push({
        id: `item:${it.id}`,
        kind: 'item',
        label: `${cat.name}: ${room ?? level.name}`,
        detail: room ? level.name : undefined,
        keywords: [...cat.aliases, CATEGORY_LABEL[cat.category]],
        levelId: level.id,
        itemId: it.id,
      });
    }
  }
  for (const c of allCatalogue(project)) {
    out.push({ id: `cat:${c.id}`, kind: 'catalogue', label: `Add: ${c.name}`, keywords: [...c.aliases, CATEGORY_LABEL[c.category]], catalogueId: c.id });
  }
  for (const c of commands) out.push({ id: c.id, kind: 'command', label: c.label, keywords: c.keywords, commandId: c.id });
  return out;
}

// On a tie, rooms come before commands, placed pieces and catalogue items.
const KIND_BIAS: Record<SearchKind, number> = { room: 0, command: 0.001, item: 0.002, catalogue: 0.003 };
const RECENT_BONUS = 0.05;
export const MAX_RESULTS = 40;

/**
 * A search over the index. With nothing typed it lists recent picks, then the commands.
 * With a word typed it ranks by fuzzy match, and recent picks move up.
 */
export function makeSearcher(index: SearchEntry[]) {
  const fuse = new Fuse(index, {
    keys: [
      { name: 'label', weight: 3 },
      { name: 'keywords', weight: 1.5 },
      { name: 'detail', weight: 0.5 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    includeScore: true,
  });
  return (query: string, recent: string[] = []): SearchEntry[] => {
    const q = query.trim();
    if (!q) {
      const byId = new Map(index.map((e) => [e.id, e]));
      const top = recent.map((id) => byId.get(id)).filter((e): e is SearchEntry => !!e);
      const seen = new Set(top.map((e) => e.id));
      return [...top, ...index.filter((e) => e.kind === 'command' && !seen.has(e.id))].slice(0, MAX_RESULTS);
    }
    const rank = (id: string) => {
      const i = recent.indexOf(id);
      return i < 0 ? 0 : RECENT_BONUS * (1 - i / Math.max(recent.length, 1));
    };
    return fuse
      .search(q)
      .map((r) => ({ e: r.item, score: (r.score ?? 1) + KIND_BIAS[r.item.kind] - rank(r.item.id) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.e);
  };
}
