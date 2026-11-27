import type { CatalogueItem, PlacedItem } from '../../model/types';
import { useStore } from '../../model/store';
import { cyl, roundTable } from '../../catalogue/parts';

export type Change = (label: string, fn: (i: PlacedItem) => PlacedItem) => void;

export const isMine = (c: CatalogueItem) => c.id.startsWith('custom-') || c.id.startsWith('ai-');

/**
 * Make one of her own items round: a round top (tables) or a drum, as wide as
 * it was wide or deep, and every placed copy resized to match. One undo step.
 */
export function makeRound(cat: CatalogueItem, item: PlacedItem) {
  const dia = Math.max(item.dims.w, item.dims.d);
  const h = item.dims.h;
  const lo = Math.max(100, Math.round(dia / 2));
  const hi = Math.max(dia * 2, lo + 100);
  useStore.getState().commit(`Make “${cat.name}” round`, (draft) => {
    const c = draft.catalogueOverrides.find((x) => x.id === cat.id);
    if (!c) return;
    c.round = true;
    c.defaultDims = { w: dia, d: dia, h };
    c.resizable = { ...c.resizable, w: [lo, hi], d: [lo, hi] };
    const token = c.geometry[0]?.colorToken ?? 'custom';
    c.geometry = c.category === 'table' ? roundTable(dia, h, token === 'custom' ? 'wood' : token) : [cyl(0, h / 2, 0, dia, h, token)];
    for (const L of draft.levels) {
      for (const it of L.items) if (it.catalogueId === cat.id) it.dims = { ...it.dims, w: dia, d: dia };
    }
  });
}
