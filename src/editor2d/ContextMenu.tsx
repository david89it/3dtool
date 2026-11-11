import { useEffect, useRef } from 'react';
import type { Vec2 } from '../model/types';
import { contextEntries, type ContextHit } from './contextMenu';
import { runContextAction } from './contextActions';

const MENU_W = 220;
const ROW_H = 44;

/**
 * Menu at the pointer on the plan. `at` is relative to the plan area (`bounds` is its size) so the
 * menu stays inside it. Closes on Esc, a press outside, or a choice.
 */
export function ContextMenu({ hit, at, bounds, touch, onClose }: { hit: ContextHit; at: Vec2; bounds: { w: number; h: number }; touch: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const openedAt = useRef(performance.now());
  const entries = contextEntries(hit);
  const height = entries.length * ROW_H + 12;
  const left = Math.max(4, Math.min(at.x, bounds.w - MENU_W - 4));
  const top = Math.max(4, Math.min(at.y, bounds.h - height - 4));

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);

  const move = (e: React.KeyboardEvent, dir: 1 | -1) => {
    e.preventDefault();
    const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    btns[(i + dir + btns.length) % btns.length]?.focus();
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label="Actions"
      data-testid="context-menu"
      style={{ left, top, width: MENU_W }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') move(e, 1);
        else if (e.key === 'ArrowUp') move(e, -1);
      }}
    >
      {entries.map((c) => (
        <button
          key={c.action}
          role="menuitem"
          className={c.danger ? 'danger' : undefined}
          disabled={c.disabled}
          onClick={() => {
            // A finger lifting after a long press must not pick the row under it.
            if (touch && performance.now() - openedAt.current < 350) return;
            onClose();
            runContextAction(c.action, hit);
          }}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
