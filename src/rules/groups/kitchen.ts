// Kitchen: worktops, sink and hob, aisle and work triangle.
import { dist, dot, sub } from '../../geometry/vec';
import type { Placed, RuleContext } from '../context';
import type { Finding, Rule } from '../types';
import { has, lname, HOBS, SINKS, FRIDGES } from '../helpers';

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

export const kitchenRules: Rule[] = [
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
];
