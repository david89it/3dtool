import type { PlacedItem } from '../../model/types';
import { useStore } from '../../model/store';
import { CommitInput } from '../budgetFields';
import { isWebLink, normaliseLink, parsePrice, STATUSES, STATUS_LABEL } from '../../model/costs';
import { useBudgetUi } from '../budgetUi';
import { Change } from './shared';

/** Price, where to buy it and whether it is bought. Feeds the Budget and shopping list. */
export function CostSection({ item, change, name }: { item: PlacedItem; change: Change; name: string }) {
  const status = item.status ?? 'idea';
  const set = (label: string, patch: Partial<Pick<PlacedItem, 'price' | 'supplier' | 'link' | 'status'>>) =>
    change(`${label}: ${name}`, (i) => {
      const next: PlacedItem = { ...i, ...patch };
      for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] === undefined) delete next[k];
      return next;
    });
  return (
    <div className="field column cost-section" data-testid="cost-section">
      <span className="field-label">Cost</span>
      <label className="cost-row">
        <span className="note">Price (£, each)</span>
        <CommitInput
          label="Price in pounds"
          inputMode="decimal"
          placeholder="not set"
          value={item.price !== undefined ? String(item.price) : ''}
          onCommit={(t) => {
            if (!t.trim()) return set('Clear price', { price: undefined });
            const n = parsePrice(t);
            if (n === undefined) return useStore.getState().toast('Type the price in pounds, like 250 or 79.99.', 'warn');
            set('Set price', { price: n });
          }}
        />
      </label>
      <label className="cost-row">
        <span className="note">Shop or supplier</span>
        <CommitInput label="Supplier" value={item.supplier ?? ''} placeholder="e.g. John Lewis" onCommit={(t) => set('Set supplier', { supplier: t.trim() || undefined })} />
      </label>
      <label className="cost-row">
        <span className="note">Link</span>
        <CommitInput label="Link" inputMode="url" value={item.link ?? ''} placeholder="https://…" onCommit={(t) => set('Set link', { link: normaliseLink(t) || undefined })} />
      </label>
      {isWebLink(item.link) && (
        <a href={item.link} target="_blank" rel="noopener noreferrer" className="source-link">
          Open the link in a new tab
        </a>
      )}
      <div className="segmented" role="radiogroup" aria-label="Status">
        {STATUSES.map((st) => (
          <button
            key={st}
            type="button"
            role="radio"
            aria-checked={status === st}
            className={status === st ? 'on' : ''}
            onClick={() => status !== st && set('Mark as ' + STATUS_LABEL[st].toLowerCase(), { status: st })}
          >
            {STATUS_LABEL[st]}
          </button>
        ))}
      </div>
      <button type="button" className="btn" onClick={() => useBudgetUi.getState().setOpen(true)}>
        £ Budget and shopping list…
      </button>
    </div>
  );
}
