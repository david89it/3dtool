import { useRef, useState } from 'react';
import { useStore } from '../../model/store';
import { useVersionsUi } from '../versionsUi';
import { useBudgetUi } from '../budgetUi';
import { useDismiss } from '../useDialogEsc';
import { useReportUi } from '../../report/state';

export function MoreMenu() {
  const units = useStore((s) => s.units);
  const setUnits = useStore((s) => s.setUnits);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useDismiss(more, moreRef, () => setMore(false));
  return (
    <div className="menu-wrap" ref={moreRef}>
      <button className="btn" aria-haspopup="menu" aria-expanded={more} title="More: versions, budget, units, report a problem, shortcuts and settings" onClick={() => setMore(!more)} data-testid="more-button">
        More ▾
      </button>
      {more && (
        <div className="menu" role="menu" aria-label="More">
          <button role="menuitem" title="Versions: save and restore copies of your plan" aria-label="Versions" onClick={() => { setMore(false); useVersionsUi.getState().setOpen(true); }}>
            Versions
          </button>
          <button role="menuitem" title="Budget and shopping list" aria-label="Budget and shopping list" onClick={() => { setMore(false); useBudgetUi.getState().setOpen(true); }}>
            Budget and shopping list
          </button>
          <button role="menuitemradio" aria-checked={units === 'metric'} title="Show lengths in metres and millimetres" aria-label="Metres and millimetres" className={units === 'metric' ? 'on' : ''} onClick={() => { setUnits('metric'); setMore(false); }}>
            {units === 'metric' ? '● ' : '○ '}Metres and millimetres
          </button>
          <button role="menuitemradio" aria-checked={units === 'imperial'} title="Show lengths in feet and inches" aria-label="Feet and inches" className={units === 'imperial' ? 'on' : ''} onClick={() => { setUnits('imperial'); setMore(false); }}>
            {units === 'imperial' ? '● ' : '○ '}Feet and inches
          </button>
          <button role="menuitem" title="Report a problem" aria-label="Report a problem" onClick={() => { setMore(false); useReportUi.getState().setOpen(true); }}>
            Report a problem
          </button>
          <button role="menuitem" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => { setMore(false); useStore.getState().setShortcutsOpen(true); }}>
            Keyboard shortcuts
          </button>
          <button role="menuitem" title="Settings: on-site measuring, Ask Claude and layout rules" aria-label="Settings" onClick={() => { setMore(false); useStore.getState().setSettingsOpen(true); }}>
            Settings
          </button>
        </div>
      )}
    </div>
  );
}
