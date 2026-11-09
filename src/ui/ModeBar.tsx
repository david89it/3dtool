import { useStore, type Mode } from '../model/store';

const MODES: { id: Mode; label: string; ready: boolean }[] = [
  { id: 'trace', label: 'Trace', ready: true },
  { id: 'openings', label: 'Openings', ready: false },
  { id: 'furnish', label: 'Furnish', ready: false },
  { id: 'advice', label: 'Advice', ready: false },
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
        </button>
      ))}
    </nav>
  );
}
