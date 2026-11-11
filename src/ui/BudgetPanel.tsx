import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import {
  budgetCsv,
  budgetText,
  buildBudget,
  formatGBP,
  formatLitres,
  formatM2,
  isWebLink,
  normaliseLink,
  parsePrice,
  sizeText,
  STATUSES,
  STATUS_LABEL,
  type Budget,
  type FurnitureRow,
} from '../model/costs';
import { editCostSetting, editFloorPrice, editItemCost } from '../model/costEdits';
import { safeFileName, downloadText } from '../model/persistence';
import type { CostSettings, ItemStatus } from '../model/types';
import { CommitInput } from './budgetFields';
import { useBudgetUi, type BudgetTab } from './budgetUi';

const TABS: { id: BudgetTab; label: string }[] = [
  { id: 'furniture', label: 'Furniture' },
  { id: 'decorating', label: 'Decorating' },
  { id: 'summary', label: 'Summary' },
];

export function BudgetPanel() {
  const open = useBudgetUi((s) => s.open);
  if (!open) return null;
  return <PanelBody />;
}

function PanelBody() {
  const setOpen = useBudgetUi((s) => s.setOpen);
  const tab = useBudgetUi((s) => s.tab);
  const setTab = useBudgetUi((s) => s.setTab);
  const project = useStore((s) => s.project);
  const units = useStore((s) => s.units);
  const budget = useMemo(() => buildBudget(project), [project]);
  const [fallback, setFallback] = useState<string | null>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (fallback !== null) fallbackRef.current?.select();
  }, [fallback]);

  const copy = async () => {
    const text = budgetText(budget, project.name, units);
    try {
      await navigator.clipboard.writeText(text);
      setFallback(null);
      useStore.getState().toast('Copied. Paste it into a message or a note.');
    } catch {
      // Clipboard blocked (some viewers and insecure pages): show the text, selected, to copy by hand.
      setFallback(text);
    }
  };

  const download = () => {
    downloadText(budgetCsv(budget, units), `${safeFileName(project.name)}-budget.csv`, 'text/csv;charset=utf-8');
  };

  return (
    <div className="modal-backdrop fixed" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal budget" role="dialog" aria-label="Budget and shopping list" data-testid="budget-panel">
        <div className="versions-head">
          <h2>Budget and shopping list</h2>
          <button className="btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        <p>
          Prices are in pounds. The paint, flooring and spare-money figures are rough UK guesses: change any of them below and the totals follow.
        </p>
        <div className="budget-actions">
          <div className="segmented" role="tablist" aria-label="Budget sections">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <button className="btn" onClick={copy}>
            Copy as a list
          </button>
          <button className="btn" onClick={download}>
            Download CSV
          </button>
        </div>
        {fallback !== null && (
          <div className="budget-fallback" data-testid="budget-fallback">
            <p>Your browser would not copy it for you. The list is selected below: press Ctrl+C (or ⌘C) to copy it.</p>
            <textarea ref={fallbackRef} readOnly value={fallback} aria-label="The list to copy" onFocus={(e) => e.currentTarget.select()} />
          </div>
        )}
        <div className="budget-body">
          {tab === 'furniture' && <FurnitureTab budget={budget} units={units} />}
          {tab === 'decorating' && <DecoratingTab budget={budget} />}
          {tab === 'summary' && <SummaryTab budget={budget} />}
        </div>
        <p className="budget-grand" data-testid="budget-grand-bar">
          Grand total: <strong>{formatGBP(budget.summary.grandTotal)}</strong>
        </p>
      </div>
    </div>
  );
}

function FurnitureTab({ budget, units }: { budget: Budget; units: 'metric' | 'imperial' }) {
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

type NumKey = Exclude<keyof CostSettings, 'floorPerM2'>;

function Setting({ label, unit, value, k, min = 0 }: { label: string; unit: string; value: number; k: NumKey; min?: number }) {
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

function DecoratingTab({ budget }: { budget: Budget }) {
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

function SummaryTab({ budget }: { budget: Budget }) {
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
