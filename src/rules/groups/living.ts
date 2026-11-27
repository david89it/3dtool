// Living areas: dining, TV distance and desks.
import type { Rule } from '../types';
import { itemParts } from '../../catalogue/catalogue';
import { dist, dot, sub } from '../../geometry/vec';
import type { Hit } from '../context';
import { has, name, ids, ignoreChairs, inBedState, sameRoom, frontMeasure } from '../helpers';

export const livingRules: Rule[] = [
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
];
