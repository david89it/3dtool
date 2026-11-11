import { useEffect, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { historyRows, jumpPlan } from '../model/history';

/** Undo and redo until the plan is as it was after `target` changes. */
export function jumpToHistory(target: number): void {
  const s = useStore.getState();
  const plan = jumpPlan(s.past.length, target);
  for (let i = 0; i < plan.count; i++) {
    if (plan.action === 'undo') useStore.getState().undo();
    else useStore.getState().redo();
  }
}

const LONG_PRESS_MS = 500;

/**
 * The Undo button with a small ▾ next to it (or press and hold Undo) that lists the last
 * 30 changes, newest first. Pick one to go back (or forward) to just after it.
 */
export function UndoButton() {
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const undo = useStore((s) => s.undo);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);
  const lastUndo = past[past.length - 1];

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);

  const rows = open ? historyRows(past, future) : [];

  return (
    <div className="undo-wrap" ref={wrap}>
      <button
        className="btn"
        onClick={() => {
          // A press-and-hold that opened the list is not also an undo.
          if (hold.current?.fired) {
            hold.current = null;
            return;
          }
          undo();
        }}
        onPointerDown={() => {
          if (hold.current) clearTimeout(hold.current.timer);
          const h = { fired: false, timer: setTimeout(() => {
            h.fired = true;
            setOpen(true);
          }, LONG_PRESS_MS) };
          hold.current = h;
        }}
        onPointerUp={() => hold.current && clearTimeout(hold.current.timer)}
        onPointerLeave={() => hold.current && !hold.current.fired && clearTimeout(hold.current.timer)}
        disabled={!lastUndo}
        title={lastUndo ? `Undo: ${lastUndo.label} (Ctrl/⌘ Z). Hold to see the list` : 'Nothing to undo'}
        aria-label="Undo"
      >
        ↶ Undo
      </button>
      <button
        className="btn undo-more"
        aria-label="Show recent changes"
        aria-haspopup="menu"
        aria-expanded={open}
        title="List of recent changes"
        data-testid="undo-history-button"
        disabled={past.length === 0 && future.length === 0}
        onClick={() => setOpen(!open)}
      >
        ▾
      </button>
      {open && (
        <div className="history-menu" role="menu" aria-label="Recent changes" data-testid="undo-history">
          <p className="history-hint">Pick a change to go back to just after it.</p>
          {rows.map((r) => (
            <button
              key={r.target}
              role="menuitem"
              className={`history-row${r.current ? ' current' : ''}${r.undone ? ' undone' : ''}`}
              aria-current={r.current ? 'true' : undefined}
              data-testid="history-row"
              onClick={() => {
                setOpen(false);
                jumpToHistory(r.target);
              }}
            >
              <span className="history-mark" aria-hidden>
                {r.current ? '●' : ''}
              </span>
              <span className="history-label">{r.label}</span>
              {r.current && <span className="history-now">you are here</span>}
              {r.undone && <span className="history-now">undone</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
