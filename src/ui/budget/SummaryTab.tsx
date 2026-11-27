import { formatGBP, STATUSES, STATUS_LABEL, type Budget } from '../../model/costs';
import { Setting } from './DecoratingTab';

export function SummaryTable({ budget }: { budget: Budget }) {
  const s = budget.summary;
  return (
    <table className="budget-table summary" data-testid="summary-table">
      <tbody>
        <tr className="head">
          <th colSpan={2}>Furniture</th>
        </tr>
        {STATUSES.map((st) => (
          <tr key={st} data-testid={`sum-${st}`}>
            <td>
              {STATUS_LABEL[st]} <span className="note">({s.byStatus[st].count})</span>
            </td>
            <td className="num">{formatGBP(s.byStatus[st].total)}</td>
          </tr>
        ))}
        <tr className="sub" data-testid="sum-furniture">
          <td>Furniture total{s.unpriced > 0 ? ` (${s.unpriced} without a price)` : ''}</td>
          <td className="num">{formatGBP(s.furnitureTotal)}</td>
        </tr>
        <tr className="head">
          <th colSpan={2}>Decorating</th>
        </tr>
        <tr>
          <td>Wall paint</td>
          <td className="num">{formatGBP(s.wallPaint)}</td>
        </tr>
        <tr>
          <td>Ceiling paint</td>
          <td className="num">{formatGBP(s.ceilingPaint)}</td>
        </tr>
        <tr>
          <td>Flooring</td>
          <td className="num">{formatGBP(s.flooring)}</td>
        </tr>
        <tr className="sub" data-testid="sum-decorating">
          <td>Decorating total</td>
          <td className="num">{formatGBP(s.decoratingTotal)}</td>
        </tr>
        <tr data-testid="sum-contingency">
          <td>Spare money ({s.contingencyPct}%)</td>
          <td className="num">{formatGBP(s.contingency)}</td>
        </tr>
        <tr className="grand" data-testid="sum-grand">
          <td>Grand total</td>
          <td className="num">{formatGBP(s.grandTotal)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function SummaryTab({ budget }: { budget: Budget }) {
  return (
    <>
      <div className="budget-settings">
        <Setting label="Spare money on top" unit="% of the total" value={budget.settings.contingencyPct} k="contingencyPct" />
      </div>
      <SummaryTable budget={budget} />
      <p className="note">Items with no price count as £0 until you type one. “Spare money” covers surprises: renovation costs usually run over.</p>
    </>
  );
}
