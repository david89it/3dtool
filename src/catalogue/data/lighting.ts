// Catalogue items: lighting.
import type { CatalogueItem } from '../../model/types';
import { cyl, slab } from '../parts';

export const LIGHTING_ITEMS: CatalogueItem[] = [
  {
    id: 'lamp-floor',
    name: 'Floor lamp',
    aliases: ['standard lamp', 'reading lamp', 'uplighter', 'lamp'],
    category: 'lighting',
    defaultDims: { w: 400, d: 400, h: 1600 },
    resizable: {},
    mount: 'floor',
    geometry: [cyl(0, 15, 0, 300, 30, 'dark'), cyl(0, 750, 0, 30, 1400, 'metal'), cyl(0, 1450, 0, 400, 300, 'shade')],
    clearance: [],
    rules: [],
  },
  {
    id: 'lamp-arc',
    name: 'Arc floor lamp',
    aliases: ['arc lamp', 'arco lamp', 'overreaching lamp'],
    category: 'lighting',
    defaultDims: { w: 400, d: 1600, h: 2000 },
    resizable: {},
    mount: 'floor',
    geometry: [slab(0, 0, -600, 350, 150, 350, 'stone'), slab(0, 150, -600, 30, 1800, 30, 'metal'), slab(0, 1950, -200, 30, 30, 800, 'metal'), cyl(0, 1800, 400, 400, 250, 'metal')],
    clearance: [],
    rules: [],
  },
  {
    id: 'pendant',
    name: 'Pendant light',
    aliases: ['ceiling light', 'chandelier', 'light shade', 'hanging light'],
    category: 'lighting',
    defaultDims: { w: 450, d: 450, h: 2700 },
    resizable: {},
    mount: 'ceiling',
    geometry: [cyl(0, 2050, 0, 450, 250, 'shade'), cyl(0, 2400, 0, 10, 600, 'dark')],
    clearance: [],
    rules: [],
  },
];
