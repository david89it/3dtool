import { useStore } from '../../model/store';
import { formatGBP, isWebLink, normaliseLink, parsePrice, sizeText, STATUSES, STATUS_LABEL, type Budget, type FurnitureRow } from '../../model/costs';
import { editItemCost } from '../../model/costEdits';
import type { ItemStatus } from '../../model/types';
import { CommitInput } from '../budgetFields';

export function FurnitureTab({ budget, units }: { budget: Budget; units: 'metric' | 'imperial' }) {
  if (budget.furniture.length === 0) {
    return <p>Nothing is placed yet. Add furniture in Furnish mode and it will be listed here, floor by floor and room by room.</p>;
  }
  return (
    <>
      {budget.furniture.map((f) => (
        <section key={f.levelId} className="budget-floor" data-testid="budget-floor">
          <h3>
            {f.floor}
            <span className="budget-total" data-testid="floor-total">
              {formatGBP(f.total)}
            </span>
          </h3>
          {f.rooms.map((g) => (
            <div key={g.room} className="budget-room" data-testid="budget-room">
              <h4>
                {g.room}
                <span className="budget-total" data-testid="room-total">
                  {formatGBP(g.total)}
                </span>
              </h4>
              <div className="budget-scroll">
                <table className="budget-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Size</th>
                      <th>Status</th>
                      <th>Price (£)</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <ItemRow key={r.itemId} row={r} units={units} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

function ItemRow({ row, units }: { row: FurnitureRow; units: 'metric' | 'imperial' }) {
  return (
    <tr data-testid="budget-item-row">
      <td>
        {row.name}
        {row.supplier && <div className="note">{row.supplier}</div>}
      </td>
      <td className="note">{sizeText(row.dims, units)}</td>
      <td>
        <select
          className="text-field"
          aria-label={`Status of ${row.name}`}
          value={row.status}
          onChange={(e) => editItemCost(row.levelId, row.itemId, { status: e.target.value as ItemStatus }, `Mark ${row.name.toLowerCase()} as ${STATUS_LABEL[e.target.value as ItemStatus].toLowerCase()}`)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <CommitInput
          className="text-field money"
          label={`Price of ${row.name}`}
          testId={`price-${row.itemId}`}
          inputMode="decimal"
          placeholder="not set"
          value={row.price !== undefined ? String(row.price) : ''}
          onCommit={(t) => {
            if (!t.trim()) return editItemCost(row.levelId, row.itemId, { price: undefined }, `Clear price of ${row.name.toLowerCase()}`);
            const n = parsePrice(t);
            if (n === undefined) return useStore.getState().toast('Type the price in pounds, like 250 or 79.99.', 'warn');
            editItemCost(row.levelId, row.itemId, { price: n }, `Set price of ${row.name.toLowerCase()}`);
          }}
        />
      </td>
      <td>
        {isWebLink(row.link) ? (
          <a href={row.link} target="_blank" rel="noopener noreferrer" className="source-link">
            Open
          </a>
        ) : (
          <CommitInput
            label={`Link for ${row.name}`}
            inputMode="url"
            placeholder="https://…"
            value={row.link ?? ''}
            onCommit={(t) => editItemCost(row.levelId, row.itemId, { link: normaliseLink(t) || undefined }, `Set link of ${row.name.toLowerCase()}`)}
          />
        )}
      </td>
    </tr>
  );
}
