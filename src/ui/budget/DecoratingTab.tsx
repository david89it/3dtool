import { useMemo } from 'react';
import { useStore } from '../../model/store';
import { formatGBP, formatLitres, formatM2, parsePrice, type Budget } from '../../model/costs';
import { editCostSetting, editFloorPrice } from '../../model/costEdits';
import type { CostSettings } from '../../model/types';
import { CommitInput } from '../budgetFields';

type NumKey = Exclude<keyof CostSettings, 'floorPerM2'>;

export function Setting({ label, unit, value, k, min = 0 }: { label: string; unit: string; value: number; k: NumKey; min?: number }) {
  return (
    <label className="budget-setting">
      <span>{label}</span>
      <span className="budget-setting-input">
        <CommitInput
          className="text-field money"
          label={label}
          inputMode="decimal"
          value={String(value)}
          onCommit={(t) => {
            const n = parsePrice(t);
            if (n === undefined || n < min || (min > 0 && n === 0)) return useStore.getState().toast('Type a number, like 12.', 'warn');
            editCostSetting(k, n, `Change ${label.toLowerCase()}`);
          }}
        />
        <span className="note">{unit}</span>
      </span>
    </label>
  );
}

export function DecoratingTab({ budget }: { budget: Budget }) {
  const s = budget.settings;
  const finishes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of budget.decorating) seen.set(d.floorFinishId, d.floorFinishName);
    return [...seen.entries()];
  }, [budget.decorating]);
  return (
    <>
      <div className="budget-settings" data-testid="budget-settings">
        <Setting label="Paint price" unit="£ per litre" value={s.paintPerLitre} k="paintPerLitre" />
        <Setting label="One litre covers" unit="m² per coat" value={s.coverage} k="coverage" min={0.1} />
        <Setting label="Coats" unit="on walls and ceilings" value={s.coats} k="coats" min={1} />
        <Setting label="Extra flooring for cuts" unit="%" value={s.flooringWastagePct} k="flooringWastagePct" />
        {finishes.map(([id, name]) => (
          <label className="budget-setting" key={id}>
            <span>{name}, price</span>
            <span className="budget-setting-input">
              <CommitInput
                className="text-field money"
                label={`Price of ${name} flooring per square metre`}
                inputMode="decimal"
                value={String(s.floorPerM2[id] ?? 0)}
                onCommit={(t) => {
                  const n = parsePrice(t);
                  if (n === undefined) return useStore.getState().toast('Type a price in pounds, like 60.', 'warn');
                  editFloorPrice(id, n, `Change ${name.toLowerCase()} price`);
                }}
              />
              <span className="note">£ per m²</span>
            </span>
          </label>
        ))}
      </div>
      {budget.decorating.length === 0 ? (
        <p>There are no rooms yet. Draw the walls in Trace mode and each room will be listed here.</p>
      ) : (
        <div className="budget-scroll">
          <table className="budget-table" data-testid="decorating-table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Wall paint</th>
                <th>Ceiling paint</th>
                <th>Flooring</th>
                <th>Room total</th>
              </tr>
            </thead>
            <tbody>
              {budget.decorating.map((d) => (
                <tr key={`${d.levelId}-${d.room}-${d.floorM2}`} data-testid="deco-row">
                  <td>
                    <strong>{d.room}</strong>
                    <div className="note">{d.floor}</div>
                  </td>
                  <td>
                    {formatM2(d.wallM2)} · {formatLitres(d.wallLitres)}
                    <div className="note">{formatGBP(d.wallCost)}</div>
                  </td>
                  <td>
                    {formatM2(d.ceilingM2)} · {formatLitres(d.ceilingLitres)}
                    <div className="note">{formatGBP(d.ceilingCost)}</div>
                  </td>
                  <td>
                    {d.floorFinishName}: {formatM2(d.floorBuyM2)} to buy
                    <div className="note">{formatGBP(d.floorCost)}</div>
                  </td>
                  <td data-testid="deco-total">
                    <strong>{formatGBP(d.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="note">
        Wall area is the length of each inside wall face times the ceiling height, minus doors, windows and openings. Litres cover every coat. Flooring is the room’s area plus the extra for cuts.
      </p>
    </>
  );
}
