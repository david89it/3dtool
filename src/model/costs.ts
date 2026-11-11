// Costs: a running budget and shopping list for furnishing and decorating,
// in pounds. No React here, so it is easy to test.
//
// The default prices are rough UK figures to get a first total. Every one of
// them can be changed in the Budget panel (they are saved in
// Project.costSettings), so nothing here is a quote.

import type { CostSettings, Id, ItemStatus, Level, Opening, Project } from './types';
import { activeLevels } from './schemes';
import { computeJoints } from '../geometry/joints';
import { detectRooms, type DetectedRoom } from '../geometry/rooms';
import { dist } from '../geometry/vec';
import { findCatalogueItem } from '../catalogue/catalogue';
import { defaultFloorId, FLOOR_FINISHES } from '../view3d/finishes';
import { formatLength, type UnitSystem } from './units';

export const STATUSES: ItemStatus[] = ['idea', 'shortlisted', 'bought'];
export const STATUS_LABEL: Record<ItemStatus, string> = { idea: 'Idea', shortlisted: 'Shortlisted', bought: 'Bought' };

/** Rough UK prices per square metre, laid. Editable in the Budget panel. */
export const DEFAULT_FLOOR_PRICES: Record<string, number> = {
  'floor-oak': 60,
  'floor-pale-oak': 60,
  'floor-walnut': 85,
  'floor-carpet-grey': 25,
  'floor-carpet-oatmeal': 25,
  'floor-tile-white': 45,
  'floor-tile-grey': 45,
  'floor-cork': 35,
  'floor-concrete': 15,
  'floor-herringbone': 90,
  'floor-chevron': 95,
  'floor-encaustic': 75,
  'floor-sisal': 30,
  'floor-rubber': 50,
};

export const DEFAULT_COST_SETTINGS: CostSettings = {
  paintPerLitre: 12,
  coverage: 12,
  coats: 2,
  flooringWastagePct: 10,
  contingencyPct: 10,
  floorPerM2: DEFAULT_FLOOR_PRICES,
};

/** Her settings with the defaults filled in for anything she has not changed. */
export function costSettings(project: Pick<Project, 'costSettings'>): CostSettings {
  const s: Partial<CostSettings> = project.costSettings ?? {};
  return {
    paintPerLitre: s.paintPerLitre ?? DEFAULT_COST_SETTINGS.paintPerLitre,
    coverage: s.coverage && s.coverage > 0 ? s.coverage : DEFAULT_COST_SETTINGS.coverage,
    coats: s.coats && s.coats > 0 ? s.coats : DEFAULT_COST_SETTINGS.coats,
    flooringWastagePct: s.flooringWastagePct ?? DEFAULT_COST_SETTINGS.flooringWastagePct,
    contingencyPct: s.contingencyPct ?? DEFAULT_COST_SETTINGS.contingencyPct,
    floorPerM2: { ...DEFAULT_FLOOR_PRICES, ...(s.floorPerM2 ?? {}) },
  };
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const M2 = 1e6; // mm² in a m²

// ---- pure quantities -------------------------------------------------------

/** Area of one wall face in m²: its length times its height, minus the openings in it. */
export function wallFaceM2(faceLengthMm: number, heightMm: number, openings: { width: number; height: number }[]): number {
  const gross = (faceLengthMm * heightMm) / M2;
  const holes = openings.reduce((sum, o) => sum + (o.width * o.height) / M2, 0);
  return Math.max(0, gross - holes);
}

/** Litres of paint for an area, for all the coats. */
export function paintLitres(areaM2: number, s: Pick<CostSettings, 'coverage' | 'coats'>): number {
  return (areaM2 * s.coats) / s.coverage;
}

/** Floor area to buy: the room's area plus wastage. */
export function flooringBuyM2(areaM2: number, wastagePct: number): number {
  return areaM2 * (1 + wastagePct / 100);
}

// ---- the budget ---------------------------------------------------------------

export interface FurnitureRow {
  itemId: Id;
  levelId: Id;
  name: string;
  /** Width, depth and height in mm, as placed. */
  dims: { w: number; d: number; h: number };
  status: ItemStatus;
  /** Pounds, or undefined while she has not entered one. */
  price?: number;
  supplier?: string;
  link?: string;
}

export interface FurnitureRoomGroup {
  room: string;
  rows: FurnitureRow[];
  total: number;
}

export interface FurnitureFloorGroup {
  levelId: Id;
  floor: string;
  rooms: FurnitureRoomGroup[];
  total: number;
}

export interface DecoratingRow {
  levelId: Id;
  floor: string;
  room: string;
  wallM2: number;
  wallLitres: number;
  wallCost: number;
  ceilingM2: number;
  ceilingLitres: number;
  ceilingCost: number;
  floorFinishId: string;
  floorFinishName: string;
  floorM2: number;
  floorBuyM2: number;
  floorPricePerM2: number;
  floorCost: number;
  total: number;
}

export interface BudgetSummary {
  byStatus: Record<ItemStatus, { count: number; total: number }>;
  furnitureTotal: number;
  /** Items still without a price. */
  unpriced: number;
  wallPaint: number;
  ceilingPaint: number;
  flooring: number;
  decoratingTotal: number;
  contingencyPct: number;
  contingency: number;
  grandTotal: number;
}

export interface Budget {
  settings: CostSettings;
  furniture: FurnitureFloorGroup[];
  decorating: DecoratingRow[];
  summary: BudgetSummary;
}

const ELSEWHERE = 'Not in a room';

function pointIn(poly: { x: number; y: number }[], p: { x: number; y: number }): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function storedRoom(level: Level, d: DetectedRoom) {
  return level.rooms.find((r) => r.boundary.join('|') === d.nodeIds.join('|'));
}

/** Inside-face length of each wall around a detected room, in mm (centreline length when a corner is missing). */
function faceLengths(level: Level, d: DetectedRoom, J: ReturnType<typeof computeJoints>): { wallId: Id; length: number }[] {
  return d.edges.map((e) => {
    const a = J.leftCorner.get(`${e.wallId}|${e.from}`);
    const b = J.rightCorner.get(`${e.wallId}|${e.to}`);
    if (a && b) return { wallId: e.wallId, length: dist(a, b) };
    const pa = level.nodes.find((n) => n.id === e.from)?.pos;
    const pb = level.nodes.find((n) => n.id === e.to)?.pos;
    return { wallId: e.wallId, length: pa && pb ? dist(pa, pb) : 0 };
  });
}

const holes = (list: Opening[]) => list.map((o) => ({ width: o.width, height: o.height }));

const floorName = (level: Level) => level.name + (level.scheme ? ` (${level.scheme.name})` : '');

/** Decorating quantities for every room of one floor. */
export function decoratingForLevel(level: Level, s: CostSettings): DecoratingRow[] {
  const J = computeJoints(level);
  const rows: DecoratingRow[] = [];
  for (const d of detectRooms(level, J)) {
    if (d.solid) continue;
    const room = storedRoom(level, d);
    const ceiling = room?.ceilingHeight ?? level.ceilingHeight;
    let wallM2 = 0;
    for (const f of faceLengths(level, d, J)) {
      const wall = level.walls.find((w) => w.id === f.wallId);
      if (!wall) continue;
      wallM2 += wallFaceM2(f.length, wall.height ?? ceiling, holes(wall.openings));
    }
    const name = room?.name ?? 'Room';
    const finishId = room?.floorFinish ?? defaultFloorId(name);
    const floorM2 = d.area / M2;
    const buy = flooringBuyM2(floorM2, s.flooringWastagePct);
    const pricePer = s.floorPerM2[finishId] ?? 0;
    const wallLitres = paintLitres(wallM2, s);
    const ceilingLitres = paintLitres(floorM2, s);
    const wallCost = round2(wallLitres * s.paintPerLitre);
    const ceilingCost = round2(ceilingLitres * s.paintPerLitre);
    const floorCost = round2(buy * pricePer);
    rows.push({
      levelId: level.id,
      floor: floorName(level),
      room: name,
      wallM2,
      wallLitres,
      wallCost,
      ceilingM2: floorM2,
      ceilingLitres,
      ceilingCost,
      floorFinishId: finishId,
      floorFinishName: FLOOR_FINISHES.find((f) => f.id === finishId)?.name ?? finishId,
      floorM2,
      floorBuyM2: buy,
      floorPricePerM2: pricePer,
      floorCost,
      total: round2(wallCost + ceilingCost + floorCost),
    });
  }
  return rows;
}

function furnitureForLevel(project: Project, level: Level): FurnitureFloorGroup {
  const detected = detectRooms(level).filter((d) => !d.solid);
  const groups = new Map<string, FurnitureRow[]>();
  const order: string[] = [];
  const ensure = (name: string) => {
    if (!groups.has(name)) {
      groups.set(name, []);
      order.push(name);
    }
  };
  for (const d of detected) ensure(storedRoom(level, d)?.name ?? 'Room');
  for (const item of level.items) {
    const cat = findCatalogueItem(project, item.catalogueId);
    const home = detected.find((d) => pointIn(d.inner, item.pos));
    const room = home ? (storedRoom(level, home)?.name ?? 'Room') : ELSEWHERE;
    ensure(room);
    groups.get(room)!.push({
      itemId: item.id,
      levelId: level.id,
      name: cat?.name ?? 'Item',
      dims: item.dims,
      status: item.status ?? 'idea',
      ...(item.price !== undefined ? { price: item.price } : {}),
      ...(item.supplier ? { supplier: item.supplier } : {}),
      ...(item.link ? { link: item.link } : {}),
    });
  }
  const rooms = order
    .map((room) => {
      const rows = groups.get(room)!;
      return { room, rows, total: round2(rows.reduce((t, r) => t + (r.price ?? 0), 0)) };
    })
    .filter((g) => g.rows.length > 0);
  return { levelId: level.id, floor: floorName(level), rooms, total: round2(rooms.reduce((t, r) => t + r.total, 0)) };
}

/** Totals by status, decorating and contingency from the rows. */
export function summarise(furniture: FurnitureFloorGroup[], decorating: DecoratingRow[], s: CostSettings): BudgetSummary {
  const byStatus: BudgetSummary['byStatus'] = {
    idea: { count: 0, total: 0 },
    shortlisted: { count: 0, total: 0 },
    bought: { count: 0, total: 0 },
  };
  let unpriced = 0;
  for (const f of furniture) {
    for (const g of f.rooms) {
      for (const r of g.rows) {
        byStatus[r.status].count++;
        byStatus[r.status].total += r.price ?? 0;
        if (r.price === undefined) unpriced++;
      }
    }
  }
  for (const k of STATUSES) byStatus[k].total = round2(byStatus[k].total);
  const furnitureTotal = round2(STATUSES.reduce((t, k) => t + byStatus[k].total, 0));
  const wallPaint = round2(decorating.reduce((t, r) => t + r.wallCost, 0));
  const ceilingPaint = round2(decorating.reduce((t, r) => t + r.ceilingCost, 0));
  const flooring = round2(decorating.reduce((t, r) => t + r.floorCost, 0));
  const decoratingTotal = round2(wallPaint + ceilingPaint + flooring);
  const contingency = round2(((furnitureTotal + decoratingTotal) * s.contingencyPct) / 100);
  return {
    byStatus,
    furnitureTotal,
    unpriced,
    wallPaint,
    ceilingPaint,
    flooring,
    decoratingTotal,
    contingencyPct: s.contingencyPct,
    contingency,
    grandTotal: round2(furnitureTotal + decoratingTotal + contingency),
  };
}

export function buildBudget(project: Project): Budget {
  const settings = costSettings(project);
  const levels = activeLevels(project);
  const furniture = levels.map((l) => furnitureForLevel(project, l)).filter((f) => f.rooms.length > 0);
  const decorating = levels.flatMap((l) => decoratingForLevel(l, settings));
  return { settings, furniture, decorating, summary: summarise(furniture, decorating, settings) };
}

// ---- text, CSV and money -----------------------------------------------------------

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const GBP_WHOLE = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

/** "£1,250" for whole pounds, "£12.50" otherwise. */
export function formatGBP(n: number): string {
  const v = round2(n);
  return (Number.isInteger(v) ? GBP_WHOLE : GBP).format(v);
}

export function sizeText(d: { w: number; d: number; h: number }, units: UnitSystem): string {
  return `${formatLength(d.w, units, 'small')} × ${formatLength(d.d, units, 'small')} × ${formatLength(d.h, units, 'small')}`;
}

/** Make a typed web address openable: "www.x.com" becomes "https://www.x.com". Anything else is kept as typed. */
export function normaliseLink(text: string): string {
  const t = text.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return `https://${t}`;
  return t;
}

export const isWebLink = (t: string | undefined): t is string => !!t && /^https?:\/\/\S+$/i.test(t);

/** Read a price the way she types it: "1,250", "£80", "12.5". Undefined when it is not a number. */
export function parsePrice(text: string): number | undefined {
  const t = text.replace(/[£,\s]/g, '');
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** One CSV cell: quoted when it holds a comma, quote or line break; a leading = + - @ is defused so a spreadsheet does not run it. */
export function csvCell(v: string | number | undefined): string {
  if (v === undefined) return '';
  let s = typeof v === 'number' ? String(v) : v;
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(cells: (string | number | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

export const formatLitres = (n: number): string => `${(Math.round(n * 10) / 10).toFixed(1)} L`;
export const formatM2 = (n: number): string => `${(Math.round(n * 10) / 10).toFixed(1)} m²`;

/** The furniture and decorating as one table for a spreadsheet. */
export function budgetCsv(b: Budget, units: UnitSystem = 'metric'): string {
  const lines = [csvRow(['Section', 'Floor', 'Room', 'Item', 'Size', 'Status', 'Supplier', 'Link', 'Quantity', 'Price (GBP)'])];
  for (const f of b.furniture) {
    for (const g of f.rooms) {
      for (const r of g.rows) {
        lines.push(csvRow(['Furniture', f.floor, g.room, r.name, sizeText(r.dims, units), STATUS_LABEL[r.status], r.supplier, r.link, '', r.price]));
      }
    }
  }
  for (const d of b.decorating) {
    lines.push(csvRow(['Decorating', d.floor, d.room, 'Wall paint', '', '', '', '', `${formatM2(d.wallM2)}, ${formatLitres(d.wallLitres)}`, d.wallCost]));
    lines.push(csvRow(['Decorating', d.floor, d.room, 'Ceiling paint', '', '', '', '', `${formatM2(d.ceilingM2)}, ${formatLitres(d.ceilingLitres)}`, d.ceilingCost]));
    lines.push(csvRow(['Decorating', d.floor, d.room, `Flooring: ${d.floorFinishName}`, '', '', '', '', `${formatM2(d.floorBuyM2)} to buy`, d.floorCost]));
  }
  const s = b.summary;
  lines.push(csvRow(['Total', '', '', `Contingency (${s.contingencyPct}%)`, '', '', '', '', '', s.contingency]));
  lines.push(csvRow(['Total', '', '', 'Grand total', '', '', '', '', '', s.grandTotal]));
  return lines.join('\r\n') + '\r\n';
}

/** A tidy plain-text list to paste into a message or a note. */
export function budgetText(b: Budget, projectName: string, units: UnitSystem = 'metric'): string {
  const out: string[] = [`Budget and shopping list: ${projectName}`, '', 'FURNITURE'];
  if (b.furniture.length === 0) out.push('Nothing placed yet.');
  for (const f of b.furniture) {
    out.push('', `${f.floor} (${formatGBP(f.total)})`);
    for (const g of f.rooms) {
      out.push(`  ${g.room} (${formatGBP(g.total)})`);
      for (const r of g.rows) {
        const bits = [`${r.name}, ${sizeText(r.dims, units)}`, STATUS_LABEL[r.status], r.price !== undefined ? formatGBP(r.price) : 'no price yet'];
        if (r.supplier) bits.push(r.supplier);
        if (r.link) bits.push(r.link);
        out.push(`    - ${bits.join(' · ')}`);
      }
    }
  }
  out.push('', 'DECORATING');
  if (b.decorating.length === 0) out.push('No rooms yet.');
  for (const d of b.decorating) {
    out.push(
      `  ${d.floor}, ${d.room} (${formatGBP(d.total)})`,
      `    - Wall paint: ${formatM2(d.wallM2)}, ${formatLitres(d.wallLitres)}, ${formatGBP(d.wallCost)}`,
      `    - Ceiling paint: ${formatM2(d.ceilingM2)}, ${formatLitres(d.ceilingLitres)}, ${formatGBP(d.ceilingCost)}`,
      `    - Flooring, ${d.floorFinishName}: ${formatM2(d.floorBuyM2)} to buy, ${formatGBP(d.floorCost)}`,
    );
  }
  const s = b.summary;
  out.push(
    '',
    'SUMMARY',
    `  Ideas: ${formatGBP(s.byStatus.idea.total)} (${s.byStatus.idea.count})`,
    `  Shortlisted: ${formatGBP(s.byStatus.shortlisted.total)} (${s.byStatus.shortlisted.count})`,
    `  Bought: ${formatGBP(s.byStatus.bought.total)} (${s.byStatus.bought.count})`,
    `  Furniture: ${formatGBP(s.furnitureTotal)}`,
    `  Decorating: ${formatGBP(s.decoratingTotal)}`,
    `  Contingency (${s.contingencyPct}%): ${formatGBP(s.contingency)}`,
    `  Grand total: ${formatGBP(s.grandTotal)}`,
  );
  return out.join('\n') + '\n';
}
