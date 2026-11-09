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

const MODES: { id: Mode; label: string; ready: boolean }[] = [
  { id: 'trace', label: 'Trace', ready: true },
  { id: 'openings', label: 'Openings', ready: true },
  { id: 'furnish', label: 'Furnish', ready: true },
  { id: 'advice', label: 'Advice', ready: true },
  { id: '3d', label: '3D', ready: false },
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
          title={m.ready ? undefined : 'Coming in a later phase'}
          onClick={() => setMode(m.id)}
        >
          {m.label}
          {m.id === 'advice' && <AdviceBadge />}
        </button>
      ))}
    </nav>
  );
}
