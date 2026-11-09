import { useEffect, useRef, useState } from 'react';
import type { Project } from '../model/types';
import { useStore } from '../model/store';
import { deleteOption, duplicateAsOption, groupOf, optionsOf } from '../model/schemes';

/**
 * Compare mode: switch between options of the current floor, duplicate the
 * floor as a new option, rename or delete an option.
 */
export function OptionSwitcher() {
  const project = useStore((s) => s.project);
  const levelId = useStore((s) => s.levelId);
  const level = project.levels.find((l) => l.id === levelId);
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setRenaming(null);
        setConfirmDelete(false);
      }
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  if (!level) return null;
  const opts = optionsOf(project, groupOf(level));
  const s = useStore.getState;

  const duplicate = () => {
    let newId: string | null = null;
    s().commit(`Duplicate ${level.name} as an option`, (draft) => {
      newId = duplicateAsOption(draft as Project, level.id);
    });
    if (newId) {
      s().setLevel(newId);
      const name = useStore.getState().project.levels.find((l) => l.id === newId)?.scheme?.name;
      s().toast(`${name} is a copy of ${level.name}. Change it freely: the other option stays as it was.`);
    }
    setOpen(false);
  };

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    let next: string | null = null;
    s().commit(`Delete ${level.scheme?.name ?? 'option'}`, (draft) => {
      next = deleteOption(draft as Project, level.id);
    });
    if (next) s().setLevel(next);
    setConfirmDelete(false);
    setOpen(false);
  };

  return (
    <div className="option-switcher" ref={ref}>
      <button
        className="btn option-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="option-switcher"
        onClick={() => setOpen(!open)}
        title="Compare layout options for this floor"
      >
        {opts.length > 1 ? `${level.scheme?.name ?? 'Option'} ▾` : 'Options ▾'}
      </button>
      {open && (
        <div className="menu option-menu" role="menu">
          {opts.length > 1 && (
            <>
              {opts.map((o) =>
                renaming === o.id ? (
                  <input
                    key={o.id}
                    className="text-field"
                    aria-label="Option name"
                    autoFocus
                    defaultValue={o.scheme?.name}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Escape') setRenaming(null);
                      if (e.key === 'Enter') {
                        const v = (e.target as HTMLInputElement).value.trim();
                        if (v)
                          s().commit('Rename option', (draft) => {
                            const t = draft.levels.find((l) => l.id === o.id);
                            if (t?.scheme) t.scheme.name = v;
                          });
                        setRenaming(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    key={o.id}
                    role="menuitemradio"
                    aria-checked={o.id === levelId}
                    className={o.id === levelId ? 'on' : ''}
                    onClick={() => {
                      s().setLevel(o.id);
                      setOpen(false);
                    }}
                  >
                    {o.id === levelId ? '● ' : '○ '}
                    {o.scheme?.name}
                  </button>
                ),
              )}
              <hr />
            </>
          )}
          <button role="menuitem" onClick={duplicate}>
            Duplicate as a new option
          </button>
          {opts.length > 1 && (
            <>
              <button role="menuitem" onClick={() => setRenaming(level.id)}>
                Rename {level.scheme?.name}
              </button>
              <button role="menuitem" className="danger" onClick={remove}>
                {confirmDelete ? `Click again to delete ${level.scheme?.name}` : `Delete ${level.scheme?.name}`}
              </button>
            </>
          )}
          {opts.length === 1 && (
            <p className="note menu-note">Try a different layout without losing this one. You can switch between them at any time.</p>
          )}
        </div>
      )}
    </div>
  );
}
