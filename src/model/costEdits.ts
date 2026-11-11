// Edits for the cost fields. Each one goes through store.commit, so it is one
// undo step and is saved with the plan.

import type { CostSettings, Id, ItemStatus, PlacedItem } from './types';
import { useStore } from './store';

export type CostFields = { price?: number; supplier?: string; link?: string; status?: ItemStatus };

/** Set (or, with undefined or an empty string, clear) cost fields on one item on any floor. */
export function editItemCost(levelId: Id, itemId: Id, patch: CostFields, label: string): void {
  useStore.getState().commit(label, (draft) => {
    const level = draft.levels.find((l) => l.id === levelId);
    const item = level?.items.find((i) => i.id === itemId) as PlacedItem | undefined;
    if (!item) return;
    for (const key of Object.keys(patch) as (keyof CostFields)[]) {
      const v = patch[key];
      if (v === undefined || v === '') delete item[key];
      else (item as unknown as Record<string, unknown>)[key] = v;
    }
  });
}

/** Change one number in her cost settings. */
export function editCostSetting(key: Exclude<keyof CostSettings, 'floorPerM2'>, value: number, label: string): void {
  useStore.getState().commit(label, (draft) => {
    draft.costSettings = { ...(draft.costSettings ?? {}), [key]: value };
  });
}

/** Change the price per m² of one floor finish. */
export function editFloorPrice(finishId: string, value: number, label: string): void {
  useStore.getState().commit(label, (draft) => {
    const cur = draft.costSettings ?? {};
    draft.costSettings = { ...cur, floorPerM2: { ...(cur.floorPerM2 ?? {}), [finishId]: value } };
  });
}
