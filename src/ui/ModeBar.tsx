import { useStore, type Mode } from '../model/store';
import { countBySeverity } from '../rules/engine';
import { useLevelIssues } from './useIssues';

/** Count of problems on this floor, coloured by the worst one. */
function AdviceBadge() {
  const issues = useLevelIssues();
  if (issues.length === 0) return null;
  const c = countBySeverity(issues);
  const worst = c.error ? 'error' : c.warning ? 'warning' : 'tip';
  const n = c.error + c.warning + c.tip;
  return (
    <span className={`mode-badge ${worst}`} data-testid="advice-badge" aria-label={`${n} layout ${n === 1 ? 'problem' : 'problems'}`}>
      {n}
    </span>
  );
}

const MODES: { id: Mode; label: string; ready: boolean; hint: string }[] = [
  { id: 'trace', label: 'Trace', ready: true, hint: 'Trace: draw the walls and rooms' },
  { id: 'openings', label: 'Openings', ready: true, hint: 'Openings: place doors and windows' },
  { id: 'furnish', label: 'Furnish', ready: true, hint: 'Furnish: add and move furniture' },
  { id: 'advice', label: 'Advice', ready: true, hint: 'Advice: check the layout and get tips' },
  { id: '3d', label: '3D', ready: true, hint: 'Look around and walk through in 3D (Tab)' },
];

export function ModeBar() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  return (
    <nav className="modebar" aria-label="Modes">
      {MODES.map((m) => (
        <button
          key={m.id}
          className={mode === m.id ? 'mode on' : 'mode'}
          aria-pressed={mode === m.id}
          disabled={!m.ready}
          title={m.ready ? m.hint : 'Coming in a later phase'}
          onClick={() => setMode(m.id)}
          data-tour={`mode-${m.id}`}
        >
          {m.label}
          {m.id === 'advice' && <AdviceBadge />}
        </button>
      ))}
    </nav>
  );
}
