// Small helpers shared by the rule groups.
import type { Placed, RuleContext, Hit } from './context';
import type { Finding } from './types';

export const has = (p: Placed, ruleId: string) => (p.cat.rules ?? []).includes(ruleId);
export const name = (p: Placed) => p.cat.name;
export const lname = (p: Placed) => p.cat.name.toLowerCase();
export const ids = (p: Placed, h?: Hit) => (h?.item ? [p.item.id, h.item.item.id] : [p.item.id]);

export const CHAIRS = new Set(['chair-dining', 'bar-stool', 'chair-desk', 'bench-seat', 'footstool']);
export const ignoreChairs = (q: Placed) => CHAIRS.has(q.cat.id);

export const HOBS = new Set(['kitchen-hob', 'kitchen-oven']);
export const SINKS = new Set(['kitchen-sink']);
export const FRIDGES = new Set(['fridge-freezer', 'fridge-american']);

/** The state with the deepest footprint (Murphy bed "deployed", sofa "bed"...). */
export function deployState(p: Placed): string | undefined {
  const st = p.cat.states;
  if (!st) return undefined;
  return Object.entries(st).sort((a, b) => b[1].dims.d - a[1].dims.d)[0][0];
}

export function baseState(p: Placed): string | undefined {
  return p.cat.states ? Object.keys(p.cat.states)[0] : undefined;
}

/** Is a bed currently usable as a bed (not folded away)? */
export function inBedState(p: Placed): boolean {
  if (!p.cat.states) return true;
  return (p.item.state ?? baseState(p)) === deployState(p);
}

export function sameRoom(ctx: RuleContext, a: Placed, b: Placed): boolean {
  const ra = ctx.roomOf(a).detected;
  const rb = ctx.roomOf(b).detected;
  return !!ra && ra === rb;
}

/** A front clearance measured against whatever is in front. */
export function frontMeasure(p: Placed, ctx: RuleContext, min: number, ideal: number | undefined, need: string, ignore?: (q: Placed) => boolean): Finding[] {
  const h = ctx.clearDepth(p, 'front', { ignore });
  return [{ itemIds: ids(p, h), measured: h.dist, required: min, ideal, subject: `${name(p)} to ${ctx.hitName(h)}`, need, roomItem: p }];
}

