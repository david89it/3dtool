// A small row of buttons that floats next to whatever is selected on the plan, so the
// everyday actions (turn, copy, delete...) are under her finger and not in a side panel.
// It shows only what applies to the selection, and every button goes through the same
// actions as the keyboard and the right-click menu, so each is one undo step.

import { useMemo } from 'react';
import type { Id } from '../model/types';
import { currentLevel, useStore } from '../model/store';
import { findOpening } from '../geometry/openings';
import { selectionIds } from '../model/groups';
import { toScreen, type View } from './view';
import { selectionBox } from './selectionAnchor';
import { runContextAction } from './contextActions';
import { lockSelected, turnSelected } from './selectionActions';
import type { ContextAction, ContextHit } from './contextMenu';

const BTN = 44;
const GAP = 10;

interface Btn {
  key: string;
  label: string;
  /** Short word on the button (omitted for icon-only buttons). */
  text?: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

/** The buttons for a selection. Pure apart from reading the plan. */
export function toolbarButtons(): { buttons: Btn[]; name: string } | null {
  const s = useStore.getState();
  const sel = s.selection;
  const L = currentLevel();
  if (!sel || !L) return null;
  const act = (action: ContextAction, hit: ContextHit) => () => runContextAction(action, hit);
  if (sel.kind === 'item' || sel.kind === 'items') {
    const ids = selectionIds(sel);
    const items = L.items.filter((i) => ids.includes(i.id));
    if (items.length === 0) return null;
    const locked = items.every((i) => i.locked);
    const hit: ContextHit = { kind: 'item', id: ids[0] as Id, locked, world: { x: 0, y: 0 }, count: items.length };
    return {
      name: items.length > 1 ? `${items.length} items selected` : 'Selected item',
      buttons: [
        { key: 'left', label: 'Turn left 90°', icon: '↺', disabled: locked, run: () => turnSelected(-90) },
        { key: 'right', label: 'Turn right 90°', icon: '↻', disabled: locked, run: () => turnSelected(90) },
        { key: 'dup', label: 'Make a copy', text: 'Copy', run: act('item.duplicate', hit) },
        { key: 'lock', label: locked ? 'Unlock so it can be moved' : 'Lock so it cannot be moved', text: locked ? 'Unlock' : 'Lock', run: lockSelected },
        { key: 'del', label: 'Delete', text: 'Delete', danger: true, run: act('item.delete', hit) },
      ],
    };
  }
  if (sel.kind === 'wall') {
    const hit: ContextHit = { kind: 'wall', id: sel.id, world: { x: 0, y: 0 } };
    return {
      name: 'Selected wall',
      buttons: [
        { key: 'open', label: 'Open up with a wide opening', text: 'Open up', run: act('wall.openUp', hit) },
        { key: 'del', label: 'Delete this wall', text: 'Delete', danger: true, run: act('wall.delete', hit) },
      ],
    };
  }
  if (sel.kind === 'opening') {
    const f = findOpening(L, sel.id);
    if (!f) return null;
    const isDoor = f.opening.type === 'door';
    const hit: ContextHit = { kind: 'opening', id: sel.id, wallId: f.wall.id, isDoor, world: { x: 0, y: 0 } };
    return {
      name: 'Selected opening',
      buttons: [
        ...(isDoor ? [{ key: 'hinge', label: 'Swap the hinge side', text: 'Swap hinge', run: act('opening.swapHinge', hit) }] : []),
        { key: 'del', label: 'Delete', text: 'Delete', danger: true, run: act('opening.delete', hit) },
      ],
    };
  }
  if (sel.kind === 'note') {
    const hit: ContextHit = { kind: 'note', id: sel.id, world: { x: 0, y: 0 } };
    return {
      name: 'Selected note',
      buttons: [
        { key: 'edit', label: 'Edit the note text', text: 'Edit', run: act('note.edit', hit) },
        { key: 'del', label: 'Delete', text: 'Delete', danger: true, run: act('note.delete', hit) },
      ],
    };
  }
  return null;
}

/** `hidden` is true while something else owns the pointer (a drag, a typed measurement, the menu). */
export function SelectionToolbar({ view, size, hidden }: { view: View; size: { w: number; h: number }; hidden: boolean }) {
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const levelId = useStore((s) => s.levelId);
  const tool = useStore((s) => s.tool);
  const mode = useStore((s) => s.mode);
  const level = project.levels.find((l) => l.id === levelId);
  const box = useMemo(() => (level ? selectionBox(level, project, selection) : null), [level, project, selection]);
  if (hidden || !box || !level || tool !== 'select' || mode === '3d') return null;
  const spec = toolbarButtons();
  if (!spec) return null;

  const topLeft = toScreen(view, box.min);
  const bottomRight = toScreen(view, box.max);
  const width = spec.buttons.reduce((t, b) => t + (b.text ? 84 : BTN), 0) + 8;
  const centre = (topLeft.x + bottomRight.x) / 2;
  // Above the selection (clear of the resize dots); below it when there is no room above.
  let top = topLeft.y - BTN - GAP - 14;
  if (top < 4) top = bottomRight.y + GAP + 40;
  top = Math.max(4, Math.min(top, size.h - BTN - 8));
  const left = Math.max(4, Math.min(centre - width / 2, size.w - width - 4));

  return (
    <div
      className="sel-toolbar"
      role="toolbar"
      aria-label={spec.name}
      data-testid="selection-toolbar"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {spec.buttons.map((b) => (
        <button
          key={b.key}
          type="button"
          className={`sel-btn${b.danger ? ' danger' : ''}${b.text ? ' with-text' : ''}`}
          title={b.label}
          aria-label={b.label}
          disabled={b.disabled}
          data-testid={`sel-${b.key}`}
          onClick={b.run}
        >
          {b.icon ?? b.text}
        </button>
      ))}
    </div>
  );
}
