// Bathroom: WC and basin clearances.
import type { Rule } from '../types';
import { has, frontMeasure } from '../helpers';

export const bathroomRules: Rule[] = [
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
];
