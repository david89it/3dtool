// The furniture catalogue. Every item is plain data; see README "How to add
// a catalogue item". Sizes are typical UK sizes in millimetres.

import type { CatalogueItem } from '../model/types';
import { box, slab } from './parts';
import { SLEEP_ITEMS } from './data/sleep';
import { SIT_ITEMS } from './data/sit';
import { TABLE_ITEMS } from './data/table';
import { STORAGE_ITEMS } from './data/storage';
import { UTILITY_ITEMS } from './data/utility';
import { KITCHEN_ITEMS } from './data/kitchen';
import { BATH_ITEMS } from './data/bath';
import { LIGHTING_ITEMS } from './data/lighting';
import { DECOR_ITEMS } from './data/decor';
import { STRUCTURE_ITEMS } from './data/structure';

export const CATALOGUE: CatalogueItem[] = [
  ...SLEEP_ITEMS,
  ...SIT_ITEMS,
  ...TABLE_ITEMS,
  ...STORAGE_ITEMS,
  ...UTILITY_ITEMS,
  ...KITCHEN_ITEMS,
  ...BATH_ITEMS,
  ...LIGHTING_ITEMS,
  ...DECOR_ITEMS,
  ...STRUCTURE_ITEMS,
];


export const CATEGORY_LABEL: Record<CatalogueItem['category'], string> = {
  sleep: 'Beds',
  sit: 'Seating',
  table: 'Tables',
  storage: 'Storage',
  kitchen: 'Kitchen',
  bath: 'Bathroom',
  utility: 'Utility',
  lighting: 'Lights',
  decor: 'Decor',
  structure: 'Fixtures',
};

/** Default size for a box, used by custom items. */
export function customGeometry(w: number, d: number, h: number, mount: CatalogueItem['mount']) {
  return mount === 'wall' && h > 1400 ? [slab(0, h - 700, 0, w, 700, d, 'custom')] : [box(0, h / 2, 0, w, h, d, 'custom')];
}
