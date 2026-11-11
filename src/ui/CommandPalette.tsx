import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { usePalette } from './paletteState';
import { paletteCommands } from './paletteCommands';
import { buildIndex, makeSearcher, type SearchKind } from './searchIndex';
import { runEntry } from './paletteActions';

const KIND_LABEL: Record<SearchKind, string> = { room: 'Room', item: 'On the plan', catalogue: 'Add', command: 'Action' };

/** Search for a room, a piece on the plan, something to add, or an action (Ctrl/⌘ K). */
export function CommandPalette() {
  const open = usePalette((s) => s.open);
  if (!open) return null;
  return <PaletteBody />;
}

function PaletteBody() {
  const project = useStore((s) => s.project);
  const recent = usePalette((s) => s.recent);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const search = useMemo(() => makeSearcher(buildIndex(project, paletteCommands())), [project]);
  const results = useMemo(() => search(query, recent), [search, query, recent]);
  const shown = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [shown, results]);

  const close = () => usePalette.getState().setOpen(false);
  const pick = (i: number) => {
    const e = results[i];
    if (!e) return;
    usePalette.getState().remember(e.id);
    close();
    runEntry(e);
  };

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setActive((shown + 1) % Math.max(results.length, 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActive((shown - 1 + results.length) % Math.max(results.length, 1));
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      pick(shown);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      close();
    }
  };

  return (
    <div className="modal-backdrop fixed palette-backdrop" onPointerDown={close}>
      <div className="modal palette" role="dialog" aria-label="Search" onPointerDown={(e) => e.stopPropagation()}>
        <input
          className="palette-input"
          autoFocus
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-label="Search rooms, pieces, things to add and actions"
          placeholder="Search rooms, furniture and actions…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul id="palette-list" className="palette-list" role="listbox" aria-label="Results" ref={listRef} data-testid="palette-list">
          {results.length === 0 && <li className="note palette-empty">Nothing found. Try another word.</li>}
          {results.map((e, i) => (
            <li key={e.id} role="option" aria-selected={i === shown}>
              <button type="button" className={i === shown ? 'palette-row on' : 'palette-row'} tabIndex={-1} onPointerEnter={() => setActive(i)} onClick={() => pick(i)}>
                <span className="palette-label">{e.label}</span>
                {e.detail && <span className="palette-detail">{e.detail}</span>}
                <span className={`palette-kind ${e.kind}`}>{KIND_LABEL[e.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="note palette-hint">{query.trim() ? 'Up and down to choose, Enter to go, Esc to close.' : 'Recent picks first, then actions. Type to search everything.'}</p>
      </div>
    </div>
  );
}
