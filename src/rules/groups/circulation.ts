// Circulation: walkways, door swings, windows and radiators.
import { dot, sub } from '../../geometry/vec';
import { solidDistance, solidsOverlap } from '../context';
import { pointPolyDistance, polyDistance, strip } from '../poly';
import type { Finding, Rule } from '../types';
import { has, name, lname, sameRoom } from '../helpers';

export const circulationRules: Rule[] = [
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
          const gap = solidDistance(a, b);
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
          if (!solidsOverlap(p, d.sector, 1)) continue;
          const inside = Math.max(0, d.radius - Math.min(...p.solids.map((sp) => pointPolyDistance(d.hinge, sp))));
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
        if (w.faces.some((f) => solidsOverlap(p, strip(f.base[0], f.base[1], f.normal, 0, zone), 1))) {
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
];
