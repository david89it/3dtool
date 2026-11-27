import type { PackModel } from './model';
import { formatGBP, sizeText, STATUSES, STATUS_LABEL } from '../../model/costs';

export function BudgetPage({ m }: { m: PackModel }) {
  const { units, budget } = m;
  return (
    <section className="print-page flow" data-testid="print-budget">
      <h2>Budget</h2>
      <h3>Summary</h3>
      <table className="print-table">
        <tbody>
          {STATUSES.map((st) => (
            <tr key={st}>
              <td>
                Furniture: {STATUS_LABEL[st].toLowerCase()} ({budget.summary.byStatus[st].count})
              </td>
              <td className="num">{formatGBP(budget.summary.byStatus[st].total)}</td>
            </tr>
          ))}
          <tr>
            <td>Furniture total</td>
            <td className="num">{formatGBP(budget.summary.furnitureTotal)}</td>
          </tr>
          <tr>
            <td>Decorating: wall paint, ceiling paint and flooring</td>
            <td className="num">{formatGBP(budget.summary.decoratingTotal)}</td>
          </tr>
          <tr>
            <td>Spare money ({budget.summary.contingencyPct}%)</td>
            <td className="num">{formatGBP(budget.summary.contingency)}</td>
          </tr>
          <tr>
            <td>
              <strong>Grand total</strong>
            </td>
            <td className="num">
              <strong>{formatGBP(budget.summary.grandTotal)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <h3>Furniture list</h3>
      {budget.furniture.length === 0 ? (
        <p>No furniture has been placed yet.</p>
      ) : (
        <table className="print-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Size</th>
              <th>Status</th>
              <th>Supplier</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {budget.furniture.flatMap((f) =>
              f.rooms.flatMap((g) => [
                <tr key={`${f.levelId}-${g.room}`}>
                  <th colSpan={4}>
                    {f.floor}: {g.room}
                  </th>
                  <th className="num">{formatGBP(g.total)}</th>
                </tr>,
                ...g.rows.map((r) => (
                  <tr key={r.itemId}>
                    <td>{r.name}</td>
                    <td>{sizeText(r.dims, units)}</td>
                    <td>{STATUS_LABEL[r.status]}</td>
                    <td>{r.supplier ?? ''}</td>
                    <td className="num">{r.price !== undefined ? formatGBP(r.price) : 'not set'}</td>
                  </tr>
                )),
              ]),
            )}
          </tbody>
        </table>
      )}
      <p className="print-small">Prices are in pounds. Paint and flooring are rough estimates from room sizes.</p>
    </section>
  );
}
