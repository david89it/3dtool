import { useStore } from '../../model/store';
import { useBudgetUi } from '../budgetUi';
import { useReportUi } from '../../report/state';

export function WideButtons() {
  const units = useStore((s) => s.units);
  const setUnits = useStore((s) => s.setUnits);
  return (
    <>
    <button
      className="icon-btn"
      onClick={() => useBudgetUi.getState().setOpen(true)}
      aria-label="Budget and shopping list"
      title="Budget and shopping list"
      data-testid="budget-button"
    >
      £
    </button>
    <div className="segmented small" role="radiogroup" aria-label="Units">
      <button
        role="radio"
        aria-checked={units === 'metric'}
        aria-label="Metres and millimetres"
        title="Show lengths in metres and millimetres"
        className={units === 'metric' ? 'on' : ''}
        onClick={() => setUnits('metric')}
      >
        m
      </button>
      <button
        role="radio"
        aria-checked={units === 'imperial'}
        aria-label="Feet and inches"
        title="Show lengths in feet and inches"
        className={units === 'imperial' ? 'on' : ''}
        onClick={() => setUnits('imperial')}
      >
        ft
      </button>
    </div>
    <button
      className="icon-btn"
      onClick={() => useReportUi.getState().setOpen(true)}
      aria-label="Report a problem"
      title="Report a problem"
      data-testid="report-button"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 4.5h14v9H9l-3.5 3v-3H3z" />
        <path d="M10 7.2v3" />
        <path d="M10 12.2v.1" />
      </svg>
    </button>
    <button
      className="icon-btn"
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)"
      onClick={() => useStore.getState().setShortcutsOpen(true)}
    >
      ?
    </button>
    <button className="btn" title="Settings: on-site measuring, Ask Claude and layout rules" onClick={() => useStore.getState().setSettingsOpen(true)}>
      Settings
    </button>
    </>
  );
}
