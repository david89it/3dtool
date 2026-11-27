import type { CatalogueItem, Level, PlacedItem } from '../../model/types';
import { useStore } from '../../model/store';
import { CATEGORY_LABEL } from '../../catalogue/items';
import { ItemPreview } from '../FurnishPanel';
import { groupOfItem } from '../../model/groups';

import type { Change } from './shared';
export function ItemHeader({ level, item, cat, change, name }: { level: Level; item: PlacedItem; cat: CatalogueItem; change: Change; name: string }) {
  const select = useStore((s) => s.select);
  return (
    <>
      <div className="row">
        <h2>{cat.name}</h2>
        <ItemPreview item={cat} size={40} />
      </div>
      <p className="note">
        {CATEGORY_LABEL[cat.category]}
        {cat.mount === 'wall' ? ' · fixed to a wall' : cat.mount === 'ceiling' ? ' · hangs from the ceiling' : ''}
        {item.locked ? ' · locked' : ''}
      </p>
      {cat.measureNote && (
        <p className="note measure-note" data-testid="item-measure-note">
          {item.estimated && (
            <span className="approx" title="Estimated. Measure on site.">
              ≈{' '}
            </span>
          )}
          {cat.measureNote}{' '}
          {item.estimated && (
            <button className="btn small" onClick={() => change(`Confirm ${name} size`, (i) => ({ ...i, estimated: undefined }))}>
              I have measured it
            </button>
          )}
        </p>
      )}
      {groupOfItem(level, item.id) && (
        <p className="note" data-testid="item-group-note">
          Part of the group “{groupOfItem(level, item.id)!.name}”.{' '}
          <button className="link-btn" onClick={() => select({ kind: 'items', ids: groupOfItem(level, item.id)!.itemIds })}>
            Select the whole group
          </button>
        </p>
      )}

    </>
  );
}
