import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { budgetCsv, budgetText, buildBudget, formatGBP } from '../model/costs';
import { safeFileName, downloadText } from '../model/persistence';
import { useBudgetUi, type BudgetTab } from './budgetUi';
import { FurnitureTab } from './budget/FurnitureTab';
import { DecoratingTab } from './budget/DecoratingTab';
import { SummaryTab } from './budget/SummaryTab';

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
      // A field with an unsaved edit stops Esc itself (it undoes the edit first), so any Esc that gets here closes.
      if (e.key === 'Escape') setOpen(false);
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
          <button title="Close the budget (Esc)" className="btn" onClick={() => setOpen(false)}>
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
          <button title="Copy the shopping list so you can paste it into a message" className="btn" onClick={copy}>
            Copy as a list
          </button>
          <button title="Save the list as a spreadsheet file (CSV)" className="btn" onClick={download}>
            Download as spreadsheet (CSV)
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
