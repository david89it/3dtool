import type { CatalogueItem, PlacedItem } from '../../model/types';
import { canResize } from '../../editor2d/itemOps';
import { deleteSelected, duplicateSelected, lockSelected } from '../../editor2d/selectionActions';

export function ItemActions({ item, cat }: { item: PlacedItem; cat: CatalogueItem }) {
  return (
    <>
      <div className="actions">
        <button title="Make a copy of this item (Ctrl/⌘ D)"
          className="btn"
          onClick={() => duplicateSelected()}
        >
          Duplicate
        </button>
        <button
          className={item.locked ? 'btn on' : 'btn'}
          aria-pressed={!!item.locked}
          title={item.locked ? 'Let this item move again' : 'Lock this item so it cannot move by accident'}
          onClick={() => lockSelected()}
        >
          {item.locked ? 'Unlock' : 'Lock'}
        </button>
        <button title="Remove this item from the plan (Delete)"
          className="btn danger"
          onClick={() => deleteSelected()}
        >
          Remove
        </button>
      </div>
      {!canResize(cat, 'w') && !canResize(cat, 'd') && <p className="note">This item comes in one size.</p>}
    </>
  );
}
