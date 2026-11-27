// Bedroom: beds, wardrobes and drawers.
import { makePlaced } from '../context';
import { convexOverlap, strip } from '../poly';
import type { Finding, Rule } from '../types';
import { has, name, ids, deployState, baseState, inBedState, frontMeasure } from '../helpers';

/** Width of one hinged door leaf for a cupboard of width w. */
function leafWidth(w: number): number {
  if (w <= 700) return w;
  if (w <= 1300) return w / 2;
  return w / Math.max(2, Math.round(w / 500));
}

export const bedroomRules: Rule[] = [
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
];
