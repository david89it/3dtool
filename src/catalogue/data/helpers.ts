// Clearance helpers and the bed and kitchen item makers the category files share.
import type { CatalogueItem, Clearance } from '../../model/types';
import { bed, kitchenBase } from '../parts';

export const front = (min: number, ideal: number, reason: string, dynamic?: Clearance['dynamic']): Clearance => ({
  side: 'front',
  min,
  ideal,
  reason,
  ...(dynamic ? { dynamic } : {}),
});
export const side = (s: 'left' | 'right' | 'back', min: number, ideal: number, reason: string): Clearance => ({ side: s, min, ideal, reason });
export const around = (min: number, ideal: number, reason: string): Clearance => ({ side: 'all', min, ideal, reason });

export const BED_RULES = ['bed-side-access', 'bed-foot', 'bed-not-under-window-sill', 'radiator-blocked', 'door-swing', 'window-obstruction', 'loft-headroom'];
export const BED_CLEAR = [
  side('left', 600, 700, 'Space to get into bed'),
  side('right', 600, 700, 'Space to get into bed'),
  front(600, 800, 'Space to walk past the foot of the bed'),
];
export const TALL = ['window-obstruction', 'door-swing', 'loft-headroom'];
export const ANY = ['door-swing', 'loft-headroom'];

export function bedItem(id: string, name: string, aliases: string[], w: number, d: number, range: [number, number]): CatalogueItem {
  return {
    id,
    name,
    aliases,
    category: 'sleep',
    defaultDims: { w, d, h: 1000 },
    resizable: { w: range, d: [1900, 2300], h: [600, 1400] },
    mount: 'floor',
    geometry: bed(w, d),
    clearance: BED_CLEAR,
    rules: BED_RULES,
  };
}

export function kitchenItem(
  id: string,
  name: string,
  aliases: string[],
  w: number,
  parts = kitchenBase(w),
  rules: string[] = [],
  clearance: Clearance[] = [front(900, 1200, 'Room to stand at the worktop and open doors', 'doorSwing')],
): CatalogueItem {
  return {
    id,
    name,
    aliases,
    category: 'kitchen',
    defaultDims: { w, d: 600, h: 910 },
    resizable: { w: [150, 1200] },
    mount: 'floor',
    geometry: parts,
    clearance,
    rules: ['kitchen-aisle', 'door-swing', ...rules],
  };
}
