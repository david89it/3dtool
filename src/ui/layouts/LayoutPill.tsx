import { useRef, useState } from 'react';
import { useDismiss } from '../useDialogEsc';
import { useStore } from '../../model/store';
import { groupOf, optionsOf } from '../../model/schemes';
import { isMainLayout, layoutName } from '../../model/layouts';
import { useCompare } from './compareState';
import { deleteCurrentLayout, makeCurrentMain, renameCurrentLayout, showLayout, tryAlternative } from './layoutActions';

/**
 * The layout pill on the plan: which layout of this floor is showing, a list
 * to switch, and the actions (try an alternative, rename, make main, delete,
 * compare side by side).
 */
export function LayoutPill() {
  const project = useStore((s) => s.project);
  const levelId = useStore((s) => s.levelId);
  const level = project.levels.find((l) => l.id === levelId);
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    setRenaming(false);
    setConfirmDelete(false);
  };
  useDismiss(open, ref, close);
  if (!level) return null;

  const opts = optionsOf(project, groupOf(level));
  const several = opts.length > 1;
  const name = layoutName(level);
  const done = (fn: () => void) => () => {
    fn();
    close();
  };
  const compare = () => {
    const other = opts.find((o) => o.id !== level.id) ?? level;
    useCompare.getState().show(level.id, other.id);
  };

  return (
    <div className="layout-pill" ref={ref} onPointerDown={(e) => e.stopPropagation()} data-testid="layout-pill">
      <button
        className="btn layout-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="option-switcher"
        title="Layouts of this floor: try a different arrangement without losing this one (key: L)"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="layout-label">Layout</span> {name} ▾
      </button>
      {open && (
        <div className="menu layout-menu" role="menu">
          <p className="layout-title">Layouts of {level.name}</p>
          {opts.map((o) => (
            <button
              key={o.id}
              role="menuitemradio"
              aria-checked={o.id === levelId}
              className={o.id === levelId ? 'on' : ''}
              onClick={done(() => showLayout(o.id))}
            >
              {o.id === levelId ? '● ' : '○ '}
              {layoutName(o)}
              {several && isMainLayout(project, o) && <span className="layout-main"> ★ main</span>}
            </button>
          ))}
          <hr />
          <button role="menuitem" onClick={done(tryAlternative)}>
            ＋ Try an alternative
          </button>
          {several && (
            <button role="menuitem" onClick={done(compare)}>
              Compare side by side
            </button>
          )}
          {several && !renaming && (
            <button role="menuitem" onClick={() => setRenaming(true)}>
              Rename {name}
            </button>
          )}
          {several && renaming && (
            <input
              className="text-field"
              aria-label="Layout name"
              autoFocus
              defaultValue={name}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') setRenaming(false);
                if (e.key === 'Enter') {
                  renameCurrentLayout((e.target as HTMLInputElement).value);
                  close();
                }
              }}
            />
          )}
          {several && !isMainLayout(project, level) && (
            <button role="menuitem" onClick={done(makeCurrentMain)}>
              Make this the main layout
            </button>
          )}
          {several && (
            <button
              role="menuitem"
              className="danger"
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                deleteCurrentLayout();
                close();
              }}
            >
              {confirmDelete ? `Click again to delete ${name}` : `Delete ${name}`}
            </button>
          )}
          <p className="note menu-note">
            Walls, doors, furniture and notes are saved separately in each layout, so you can try ideas safely. Press L to flip between them.
          </p>
        </div>
      )}
    </div>
  );
}
