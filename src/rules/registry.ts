// The rules registry (brief §5). One file, data-driven, easy to extend: see
// README "How to add a rule".
//
// An item rule applies to a placed item when the catalogue item lists the
// rule id in its `rules` array (and any extra condition in `applies`).
// A level rule looks at the whole floor (door swings, walkways, structure).
//
// Rules return Findings. A finding with a `severity` is always reported
// with that severity ("flag" rules). Otherwise it is a measurement: below
// `required` it is reported at the rule's severity, between `required` and
// `ideal` it is a tip, at or above `ideal` it is fine and dropped.

import type { Id } from '../model/types';
import { itemParts } from '../catalogue/catalogue';
import { needsStructuralBadge, STRUCTURAL_BADGE_TEXT } from '../geometry/openings';
import { dist, dot, sub } from '../geometry/vec';
import { makePlaced, type Placed, type RuleContext, type Hit } from './context';
import { convexOverlap, pointPolyDistance, polyDistance, strip } from './poly';

export type Severity = 'error' | 'warning' | 'tip';
export type Params = Record<string, number>;

export interface Finding {
  itemIds: Id[];
  wallIds?: Id[];
  measured: number;
  required: number;
  ideal?: number;
  /** Set for "flag" findings; omitted for measurements compared with required/ideal. */
  severity?: Severity;
  /** Full message for flags. */
  message?: string;
  /** For measurements: "Double bed to wardrobe" ... */
  subject?: string;
  /** ... and "to get into bed". */
  need?: string;
  /** The item whose room the issue is listed under (defaults to the first item). */
  roomItem?: Placed;
  /** Room name for issues not tied to an item (structural). */
  roomName?: string;
  roomId?: Id;
  /** Distinguishes several findings of one rule on the same items. */
  key?: string;
}

interface RuleBase {
  id: string;
  title: string;
  severity: Severity;
  params: Params;
  /** Plain-language names for the params, shown in settings. */
  paramLabels: Record<string, string>;
  /** Can the fixer try nudging or turning the named items? */
  fixable: boolean;
}

export interface ItemRule extends RuleBase {
  scope: 'item';
  applies: (p: Placed, ctx: RuleContext) => boolean;
  measure: (p: Placed, ctx: RuleContext, params: Params) => Finding[];
}

export interface LevelRule extends RuleBase {
  scope: 'level';
  measureLevel: (ctx: RuleContext, params: Params) => Finding[];
}

export type Rule = ItemRule | LevelRule;

// ---- helpers ---------------------------------------------------------------

const has = (p: Placed, ruleId: string) => (p.cat.rules ?? []).includes(ruleId);
const name = (p: Placed) => p.cat.name;
const lname = (p: Placed) => p.cat.name.toLowerCase();
const ids = (p: Placed, h?: Hit) => (h?.item ? [p.item.id, h.item.item.id] : [p.item.id]);

const CHAIRS = new Set(['chair-dining', 'bar-stool', 'chair-desk', 'bench-seat', 'footstool']);
const ignoreChairs = (q: Placed) => CHAIRS.has(q.cat.id);

const HOBS = new Set(['kitchen-hob', 'kitchen-oven']);
const SINKS = new Set(['kitchen-sink']);
const FRIDGES = new Set(['fridge-freezer', 'fridge-american']);

/** The state with the deepest footprint (Murphy bed "deployed", sofa "bed"...). */
function deployState(p: Placed): string | undefined {
  const st = p.cat.states;
  if (!st) return undefined;
  return Object.entries(st).sort((a, b) => b[1].dims.d - a[1].dims.d)[0][0];
}

function baseState(p: Placed): string | undefined {
  return p.cat.states ? Object.keys(p.cat.states)[0] : undefined;
}

/** Is a bed currently usable as a bed (not folded away)? */
function inBedState(p: Placed): boolean {
  if (!p.cat.states) return true;
  return (p.item.state ?? baseState(p)) === deployState(p);
}

function sameRoom(ctx: RuleContext, a: Placed, b: Placed): boolean {
  const ra = ctx.roomOf(a).detected;
  const rb = ctx.roomOf(b).detected;
  return !!ra && ra === rb;
}

/** A front clearance measured against whatever is in front. */
function frontMeasure(p: Placed, ctx: RuleContext, min: number, ideal: number | undefined, need: string, ignore?: (q: Placed) => boolean): Finding[] {
  const h = ctx.clearDepth(p, 'front', { ignore });
  return [{ itemIds: ids(p, h), measured: h.dist, required: min, ideal, subject: `${name(p)} to ${ctx.hitName(h)}`, need, roomItem: p }];
}

/** Width of one hinged door leaf for a cupboard of width w. */
export function leafWidth(w: number): number {
  if (w <= 700) return w;
  if (w <= 1300) return w / 2;
  return w / Math.max(2, Math.round(w / 500));
}

/** Contiguous worktop-height kitchen units in line with `p` (including p), as intervals along p's x axis. */
function kitchenRun(p: Placed, ctx: RuleContext): { q: Placed; s: number; e: number }[] {
  const units = ctx.placed.filter(
    (q) =>
      q.cat.category === 'kitchen' &&
      q.cat.mount === 'floor' &&
      q.dims.h <= 1000 &&
      Math.abs((((q.item.rotationDeg - p.item.rotationDeg) % 360) + 360) % 360) < 1 &&
      Math.abs(dot(sub(q.centre, p.centre), p.front)) < 60,
  );
  const iv = units
    .map((q) => {
      const t = dot(sub(q.centre, p.centre), p.xAxis);
      return { q, s: t - q.dims.w / 2, e: t + q.dims.w / 2 };
    })
    .sort((a, b) => a.s - b.s);
  // Keep only the chain that touches p.
  const i = iv.findIndex((x) => x.q === p);
  let lo = i;
  let hi = i;
  while (lo > 0 && iv[lo - 1].e >= iv[lo].s - 20) lo--;
  while (hi < iv.length - 1 && iv[hi + 1].s <= iv[hi].e + 20) hi++;
  return iv.slice(lo, hi + 1);
}

// ---- the rules -------------------------------------------------------------

export const RULES: Rule[] = [
  {
    id: 'bed-side-access',
    title: 'Getting into bed',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { min: 600, ideal: 700 },
    paramLabels: { min: 'Minimum beside a double bed', ideal: 'Comfortable' },
    applies: (p) => has(p, 'bed-side-access') && p.dims.w >= 1300 && inBedState(p),
    measure: (p, ctx, { min, ideal }) => {
      const sides = (['left', 'right'] as const).map((s) => ({ s, h: ctx.clearDepth(p, s, { how: 'median' }) }));
      const open = sides.filter((x) => x.h.dist >= 150);
      if (open.length === 0) {
        const best = sides.sort((a, b) => b.h.dist - a.h.dist)[0];
        return [
          {
            itemIds: ids(p, best.h),
            measured: best.h.dist,
            required: min,
            ideal,
            subject: `${name(p)} sides`,
            need: 'on at least one side to get into bed',
            roomItem: p,
          },
        ];
      }
      return open.map(({ s, h }) => ({
        itemIds: ids(p, h),
        measured: h.dist,
        required: min,
        ideal,
        subject: `${name(p)} side to ${ctx.hitName(h)}`,
        need: 'to get into bed',
        roomItem: p,
        key: s,
      }));
    },
  },
  {
    id: 'bed-foot',
    title: 'Space at the foot of the bed',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { min: 600, ideal: 800 },
    paramLabels: { min: 'Minimum', ideal: 'Comfortable' },
    applies: (p) => has(p, 'bed-foot') && inBedState(p),
    measure: (p, ctx, { min, ideal }) => {
      const h = ctx.clearDepth(p, 'front');
      return [{ itemIds: ids(p, h), measured: h.dist, required: min, ideal, subject: `${name(p)} foot to ${ctx.hitName(h)}`, need: 'to walk past the end of the bed', roomItem: p }];
    },
  },
  {
    id: 'bed-not-under-window-sill',
    title: 'Headboard against a window',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { reach: 250 },
    paramLabels: { reach: 'How close the window counts as behind the bed' },
    applies: (p) => has(p, 'bed-not-under-window-sill') && inBedState(p),
    measure: (p, ctx, { reach }) => {
      const [bl, br] = p.poly;
      const back = strip(bl, br, { x: -p.front.x, y: -p.front.y }, 0, reach);
      const out: Finding[] = [];
      for (const w of ctx.geo.windows) {
        for (const f of w.faces) {
          const zone = strip(f.base[0], f.base[1], f.normal, -5, reach);
          if (!convexOverlap(back, zone, 1)) continue;
          if (p.top <= w.sill) continue;
          out.push({
            itemIds: [p.item.id],
            wallIds: [w.wallId],
            measured: p.top,
            required: w.sill,
            severity: 'warning',
            message: `${name(p)} headboard (${ctx.fmt(p.top)}) is higher than the window sill behind it (${ctx.fmt(w.sill)}). It will cover part of the window.`,
            roomItem: p,
            key: w.openingId,
          });
        }
      }
      return out;
    },
  },
  {
    id: 'murphy-deploy',
    title: 'Room to fold down',
    scope: 'item',
    severity: 'error',
    fixable: true,
    params: { margin: 100 },
    paramLabels: { margin: 'Extra space beyond the unfolded size' },
    applies: (p) => has(p, 'murphy-deploy') && !!p.cat.states,
    measure: (p, ctx, { margin }) => {
      const base = makePlaced({ ...p.item, state: baseState(p) }, p.cat);
      const deployed = makePlaced({ ...p.item, state: deployState(p) }, p.cat);
      const required = deployed.dims.d - base.dims.d + margin;
      const h = ctx.clearDepth(base, 'front', { ignore: (q) => q.item.id === p.item.id });
      return [
        {
          itemIds: ids(p, h),
          measured: h.dist,
          required,
          subject: `${name(p)} unfolded to ${ctx.hitName(h)}`,
          need: 'to fold it down with a little room to spare',
          roomItem: p,
        },
      ];
    },
  },
  {
    id: 'wardrobe-hinged-front',
    title: 'Opening hinged doors',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { extra: 200 },
    paramLabels: { extra: 'Comfortable extra beyond the door width' },
    applies: (p) => has(p, 'wardrobe-hinged-front'),
    measure: (p, ctx, { extra }) => {
      const leaf = Math.round(leafWidth(p.dims.w));
      return frontMeasure(p, ctx, leaf, leaf + extra, 'to open the doors');
    },
  },
  {
    id: 'wardrobe-sliding-front',
    title: 'In front of sliding doors',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { min: 600, ideal: 750 },
    paramLabels: { min: 'Minimum', ideal: 'Comfortable' },
    applies: (p) => has(p, 'wardrobe-sliding-front'),
    measure: (p, ctx, prm) => frontMeasure(p, ctx, prm.min, prm.ideal, 'to stand in front and reach in'),
  },
  {
    id: 'drawer-pull',
    title: 'Pulling drawers out',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { extra: 300 },
    paramLabels: { extra: 'Space to stand, beyond the drawer depth' },
    applies: (p) => has(p, 'drawer-pull'),
    measure: (p, ctx, { extra }) => {
      const base = p.cat.states ? makePlaced({ ...p.item, state: baseState(p) }, p.cat) : p;
      const drawer = Math.max(200, base.dims.d - 50);
      const h = ctx.clearDepth(base, 'front', { ignore: (q) => q.item.id === p.item.id });
      return [{ itemIds: ids(p, h), measured: h.dist, required: drawer + extra, subject: `${name(p)} to ${ctx.hitName(h)}`, need: 'to pull the drawers out and stand', roomItem: p }];
    },
  },
  {
    id: 'walkway',
    title: 'Walkways',
    scope: 'level',
    severity: 'warning',
    fixable: true,
    params: { min: 750, ideal: 900, ignoreBelow: 300 },
    paramLabels: { min: 'Minimum walkway', ideal: 'Comfortable walkway', ignoreBelow: 'Gaps narrower than this are not walkways' },
    measureLevel: (ctx, { min, ideal, ignoreBelow }) => {
      const out: Finding[] = [];
      const items = ctx.placed.filter((p) => p.obstacle && p.top >= 500);
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          if (!has(a, 'walkway') && !has(b, 'walkway')) continue;
          if (!sameRoom(ctx, a, b)) continue;
          const gap = polyDistance(a.poly, b.poly);
          if (gap < ignoreBelow || gap >= ideal) continue;
          out.push({ itemIds: [a.item.id, b.item.id], measured: gap, required: min, ideal, subject: `${name(a)} to ${lname(b)}`, need: 'to walk between them', roomItem: a });
        }
      }
      return out;
    },
  },
  {
    id: 'door-swing',
    title: 'Door swings',
    scope: 'level',
    severity: 'error',
    fixable: true,
    params: {},
    paramLabels: {},
    measureLevel: (ctx) => {
      const out: Finding[] = [];
      for (const d of ctx.geo.doors) {
        for (const p of ctx.placed) {
          if (!p.obstacle || !has(p, 'door-swing')) continue;
          if (!convexOverlap(d.sector, p.poly, 1)) continue;
          const inside = Math.max(0, d.radius - pointPolyDistance(d.hinge, p.poly));
          out.push({
            itemIds: [p.item.id],
            wallIds: [d.wallId],
            measured: inside,
            required: 0,
            severity: 'error',
            message: `A door hits the ${lname(p)}: it is ${ctx.fmt(inside)} inside the door's swing, so the door won't open fully.`,
            roomItem: p,
            key: d.openingId,
          });
        }
      }
      return out;
    },
  },
  {
    id: 'window-obstruction',
    title: 'Tall furniture in front of windows',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { height: 1000, zone: 300 },
    paramLabels: { height: 'Taller than this blocks a window', zone: 'How close counts as in front' },
    applies: (p) => has(p, 'window-obstruction') && p.cat.mount !== 'ceiling',
    measure: (p, ctx, { height, zone }) => {
      if (p.top <= height) return [];
      const out: Finding[] = [];
      for (const w of ctx.geo.windows) {
        if (w.faces.some((f) => convexOverlap(strip(f.base[0], f.base[1], f.normal, 0, zone), p.poly, 1))) {
          out.push({
            itemIds: [p.item.id],
            wallIds: [w.wallId],
            measured: p.top,
            required: height,
            severity: 'warning',
            message: `${name(p)} (${ctx.fmt(p.top)} tall) stands in front of a window and will block the light.`,
            roomItem: p,
            key: w.openingId,
          });
        }
      }
      return out;
    },
  },
  {
    id: 'radiator-blocked',
    title: 'Radiators',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { gap: 150 },
    paramLabels: { gap: 'Gap to leave in front of a radiator' },
    applies: (p) => has(p, 'radiator-blocked'),
    measure: (p, ctx, { gap }) => {
      const out: Finding[] = [];
      for (const r of ctx.placed) {
        if (r.cat.id !== 'radiator') continue;
        if (dot(sub(r.centre, p.centre), p.front) >= 0) continue; // only behind the item
        const d = polyDistance(p.poly, r.poly);
        if (d >= gap) continue;
        out.push({
          itemIds: [p.item.id, r.item.id],
          measured: d,
          required: gap,
          severity: 'warning',
          message: `${name(p)} is ${ctx.fmt(d)} from a radiator. Leave ${ctx.fmt(gap)} so the heat gets into the room.`,
          roomItem: p,
          key: r.item.id,
        });
      }
      return out;
    },
  },
  {
    id: 'kitchen-worktop-landing',
    title: 'Worktop beside the hob',
    scope: 'item',
    severity: 'warning',
    fixable: false,
    params: { min: 300, ideal: 400 },
    paramLabels: { min: 'Minimum each side', ideal: 'Comfortable each side' },
    applies: (p) => has(p, 'kitchen-worktop-landing') && HOBS.has(p.cat.id),
    measure: (p, ctx, prm) => {
      const run = kitchenRun(p, ctx);
      const me = run.find((x) => x.q === p)!;
      const left = me.s - run[0].s;
      const right = run[run.length - 1].e - me.e;
      const m = Math.min(left, right);
      return [{ itemIds: [p.item.id], measured: m, required: prm.min, ideal: prm.ideal, subject: `Worktop on the ${left <= right ? 'one' : 'other'} side of the ${lname(p)}`, need: 'to put pans down', roomItem: p }];
    },
  },
  {
    id: 'kitchen-sink-hob',
    title: 'Worktop between sink and hob',
    scope: 'item',
    severity: 'warning',
    fixable: false,
    params: { min: 400, ideal: 600 },
    paramLabels: { min: 'Minimum', ideal: 'Comfortable' },
    applies: (p) => has(p, 'kitchen-sink-hob') && SINKS.has(p.cat.id),
    measure: (p, ctx, prm) => {
      const run = kitchenRun(p, ctx);
      const me = run.find((x) => x.q === p)!;
      const out: Finding[] = [];
      for (const h of run) {
        if (!HOBS.has(h.q.cat.id)) continue;
        const gap = h.s >= me.e ? h.s - me.e : me.s - h.e;
        out.push({ itemIds: [p.item.id, h.q.item.id], measured: Math.max(0, gap), required: prm.min, ideal: prm.ideal, subject: `Worktop between sink and ${lname(h.q)}`, need: 'to work safely between them', roomItem: p, key: h.q.item.id });
      }
      return out;
    },
  },
  {
    id: 'kitchen-aisle',
    title: 'Kitchen aisle',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { min: 900, ideal: 1200 },
    paramLabels: { min: 'Minimum between facing units', ideal: 'Comfortable' },
    applies: (p) => has(p, 'kitchen-aisle') && p.cat.category === 'kitchen',
    measure: (p, ctx, prm) => {
      const h = ctx.clearDepth(p, 'front');
      if (!h.item || !has(h.item, 'kitchen-aisle')) return [];
      const pair = [p.item.id, h.item.item.id].sort();
      return [{ itemIds: [p.item.id, h.item.item.id], measured: h.dist, required: prm.min, ideal: prm.ideal, subject: `Aisle between ${lname(p)} and ${lname(h.item)}`, need: 'to work and open doors', roomItem: p, key: pair.join('+') }];
    },
  },
  {
    id: 'kitchen-triangle',
    title: 'Kitchen work triangle',
    scope: 'level',
    severity: 'warning',
    fixable: false,
    params: { legMin: 1200, legMax: 2700, totalMax: 7900 },
    paramLabels: { legMin: 'Shortest side', legMax: 'Longest side', totalMax: 'Longest total' },
    measureLevel: (ctx, { legMin, legMax, totalMax }) => {
      const out: Finding[] = [];
      const byRoom = new Map<string, Placed[]>();
      for (const p of ctx.placed) {
        const r = ctx.roomOf(p).detected;
        if (!r) continue;
        const k = r.key;
        byRoom.set(k, [...(byRoom.get(k) ?? []), p]);
      }
      for (const items of byRoom.values()) {
        const sink = items.find((p) => SINKS.has(p.cat.id) && has(p, 'kitchen-triangle'));
        const hob = items.find((p) => HOBS.has(p.cat.id) && has(p, 'kitchen-triangle'));
        const fridge = items.find((p) => FRIDGES.has(p.cat.id) && has(p, 'kitchen-triangle'));
        if (!sink || !hob || !fridge) continue;
        const legs: [Placed, Placed, string][] = [
          [sink, hob, 'sink to hob'],
          [hob, fridge, 'hob to fridge'],
          [fridge, sink, 'fridge to sink'],
        ];
        let total = 0;
        for (const [a, b, label] of legs) {
          const d = dist(a.centre, b.centre);
          total += d;
          if (d < legMin || d > legMax) {
            out.push({
              itemIds: [a.item.id, b.item.id],
              measured: d,
              required: d < legMin ? legMin : legMax,
              severity: 'warning',
              message: `Kitchen triangle: ${label} is ${ctx.fmt(d)}. Each side works best between ${ctx.fmt(legMin)} and ${ctx.fmt(legMax)}.`,
              roomItem: a,
              key: label,
            });
          }
        }
        if (total > totalMax) {
          out.push({
            itemIds: [sink.item.id, hob.item.id, fridge.item.id],
            measured: total,
            required: totalMax,
            severity: 'warning',
            message: `Kitchen triangle: the walk between sink, hob and fridge adds up to ${ctx.fmt(total)}. Under ${ctx.fmt(totalMax)} saves steps.`,
            roomItem: sink,
            key: 'total',
          });
        }
      }
      return out;
    },
  },
  {
    id: 'dining-chair-pullback',
    title: 'Pulling chairs out',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { min: 750, ideal: 900, againstWall: 150 },
    paramLabels: { min: 'Minimum table edge to wall', ideal: 'Comfortable', againstWall: 'Closer than this counts as pushed against the wall' },
    applies: (p) => has(p, 'dining-chair-pullback'),
    measure: (p, ctx, { min, ideal, againstWall }) => {
      let worst: { h: Hit } | null = null;
      for (const s of ['front', 'back', 'left', 'right'] as const) {
        const h = ctx.clearDepth(p, s, { ignore: ignoreChairs });
        if (h.dist < againstWall) continue;
        if (!worst || h.dist < worst.h.dist) worst = { h };
      }
      if (!worst) return [];
      return [{ itemIds: ids(p, worst.h), measured: worst.h.dist, required: min, ideal, subject: `${name(p)} to ${ctx.hitName(worst.h)}`, need: 'to pull a chair out and sit down', roomItem: p }];
    },
  },
  {
    id: 'sofa-tv-distance',
    title: 'Sofa to TV',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { minFactor: 1.5, maxFactor: 2.5 },
    paramLabels: { minFactor: 'Closest, in screen sizes', maxFactor: 'Furthest, in screen sizes' },
    applies: (p) => has(p, 'sofa-tv-distance'),
    measure: (p, ctx, { minFactor, maxFactor }) => {
      const tvs = ctx.placed
        .filter((t) => t.cat.id === 'tv-unit' && sameRoom(ctx, p, t))
        .filter((t) => dot(sub(t.centre, p.centre), p.front) > 0 && dot(sub(p.centre, t.centre), t.front) > 0)
        .sort((a, b) => dist(a.centre, p.centre) - dist(b.centre, p.centre));
      const tv = tvs[0];
      if (!tv) return [];
      const screen = itemParts(tv.item, tv.cat).find((x) => x.colorToken === 'screen');
      const diag = (screen ? screen.size[0] : tv.dims.w * 0.77) / 0.87;
      const d = dist(p.centre, tv.centre);
      const lo = diag * minFactor;
      const hi = diag * maxFactor;
      if (d >= lo && d <= hi) return [];
      return [
        {
          itemIds: [p.item.id, tv.item.id],
          measured: d,
          required: d < lo ? lo : hi,
          severity: 'warning',
          message: `${name(p)} to TV: ${ctx.fmt(d)}. For this screen, ${ctx.fmt(lo)} to ${ctx.fmt(hi)} is comfortable (${minFactor}–${maxFactor} × the screen size).`,
          roomItem: p,
        },
      ];
    },
  },
  {
    id: 'desk-chair',
    title: 'Room for the desk chair',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { min: 750, ideal: 900 },
    paramLabels: { min: 'Minimum behind the desk', ideal: 'Comfortable' },
    applies: (p) => has(p, 'desk-chair') && (p.cat.mount !== 'wall' || inBedState(p)),
    measure: (p, ctx, prm) => frontMeasure(p, ctx, prm.min, prm.ideal, 'for the chair and to stand up', ignoreChairs),
  },
  {
    id: 'wc-front',
    title: 'In front of the WC',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { min: 600, ideal: 750 },
    paramLabels: { min: 'Minimum', ideal: 'Comfortable' },
    applies: (p) => has(p, 'wc-front'),
    measure: (p, ctx, prm) => frontMeasure(p, ctx, prm.min, prm.ideal, 'in front of the toilet'),
  },
  {
    id: 'basin-front',
    title: 'In front of basins, baths and showers',
    scope: 'item',
    severity: 'warning',
    fixable: true,
    params: { min: 700, ideal: 800 },
    paramLabels: { min: 'Minimum', ideal: 'Comfortable' },
    applies: (p) => has(p, 'basin-front'),
    measure: (p, ctx, prm) => frontMeasure(p, ctx, prm.min, prm.ideal, 'to stand and use it'),
  },
  {
    id: 'structural-opening',
    title: 'Structural openings',
    scope: 'level',
    severity: 'warning',
    fixable: false,
    params: {},
    paramLabels: {},
    measureLevel: (ctx) =>
      ctx.level.walls.filter(needsStructuralBadge).map((w) => {
        const rooms = ctx.roomsOfWall(w.id);
        return {
          itemIds: [],
          wallIds: [w.id],
          measured: w.openings.filter((o) => !o.existing).length,
          required: 0,
          severity: 'warning' as const,
          message: STRUCTURAL_BADGE_TEXT,
          roomName: rooms.map((r) => r.name).join(' / ') || 'Walls',
          roomId: rooms[0]?.room?.id,
          key: w.id,
        };
      }),
  },
  {
    id: 'loft-headroom',
    title: 'Headroom',
    scope: 'item',
    severity: 'warning',
    fixable: false,
    params: { margin: 50 },
    paramLabels: { margin: 'Space to leave under the ceiling' },
    applies: (p) => has(p, 'loft-headroom') && p.cat.mount !== 'ceiling',
    measure: (p, ctx, { margin }) => {
      const room = ctx.roomOf(p).room;
      const ceiling = room?.ceilingHeight ?? ctx.level.ceilingHeight;
      if (p.top <= ceiling - margin) return [];
      return [
        {
          itemIds: [p.item.id],
          measured: p.top,
          required: ceiling - margin,
          severity: 'warning',
          message: `${name(p)} is ${ctx.fmt(p.top)} tall and the ceiling here is ${ctx.fmt(ceiling)}. It may not fit, especially where the roof slopes.`,
          roomItem: p,
        },
      ];
    },
  },
];

export const RULES_BY_ID = new Map(RULES.map((r) => [r.id, r]));
