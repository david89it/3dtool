import { useState } from 'react';
import type { Id, Level } from '../model/types';
import { useStore } from '../model/store';
import { findCatalogueItem } from '../catalogue/catalogue';
import { groupMatching, type AlignMode } from '../model/groups';
import {
  alignSelected,
  deleteSelected,
  duplicateSelected,
  groupSelected,
  lockSelected,
  renameGroupById,
  spaceSelected,
  turnSelected,
  ungroupSelected,
} from '../editor2d/selectionActions';

const ALIGN: { mode: AlignMode; label: string; title: string }[] = [
  { mode: 'left', label: 'Left', title: 'Line up their left edges' },
  { mode: 'centre', label: 'Centre', title: 'Line up their centres across' },
  { mode: 'right', label: 'Right', title: 'Line up their right edges' },
  { mode: 'top', label: 'Top', title: 'Line up their top edges' },
  { mode: 'middle', label: 'Middle', title: 'Line up their middles down' },
  { mode: 'bottom', label: 'Bottom', title: 'Line up their bottom edges' },
];

/** The right-hand panel when several pieces of furniture are selected, or a whole group. */
export function MultiPanel({ level, ids }: { level: Level; ids: Id[] }) {
  const project = useStore((s) => s.project);
  const items = level.items.filter((i) => ids.includes(i.id));
  const group = groupMatching(level, ids);
  const locked = items.filter((i) => i.locked).length;
  const allLocked = locked === items.length;
  const [name, setName] = useState('');

  const counts = new Map<string, number>();
  for (const it of items) {
    const n = findCatalogueItem(project, it.catalogueId)?.name ?? 'Item';
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }

  return (
    <div className="panel-section multi-panel" data-testid="multi-panel">
      <h2>{items.length} pieces selected</h2>
      <ul className="piece-list">
        {[...counts].map(([n, c]) => (
          <li key={n}>
            {n}
            {c > 1 ? ` × ${c}` : ''}
          </li>
        ))}
      </ul>
      {locked > 0 && (
        <p className="note" data-testid="multi-locked-note">
          {allLocked ? 'These pieces are locked, so they will not move or turn. Unlock them to change them.' : `${locked} of these ${locked === 1 ? 'is' : 'are'} locked and will stay where ${locked === 1 ? 'it is' : 'they are'}.`}
        </p>
      )}

      <div className="field column">
        <span className="field-label">Group</span>
        {group ? (
          <>
            <div className="group-name">
              <input
                key={`${group.id}:${group.name}`}
                aria-label="Group name"
                defaultValue={group.name}
                onBlur={(e) => renameGroupById(group.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
            <p className="note">Click any piece to select the whole group. Alt-click picks just one piece.</p>
            <button className="btn" onClick={() => ungroupSelected()}>
              Ungroup
            </button>
          </>
        ) : (
          <>
            <div className="group-name">
              <input
                aria-label="Group name"
                placeholder="Name it, e.g. Dining set"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && groupSelected(name)) setName('');
                }}
              />
            </div>
            <button
              className="btn"
              onClick={() => {
                if (groupSelected(name)) setName('');
              }}
            >
              Group
            </button>
            <p className="note">A group moves, turns, copies and deletes as one.</p>
          </>
        )}
      </div>

      <div className="actions">
        <button className="btn" disabled={allLocked} onClick={() => turnSelected(-90)} aria-label="Turn all 90° anticlockwise">
          ↺ Turn 90°
        </button>
        <button className="btn" disabled={allLocked} onClick={() => turnSelected(90)} aria-label="Turn all 90° clockwise">
          ↻ Turn 90°
        </button>
      </div>
      <div className="actions">
        <button className="btn" onClick={() => duplicateSelected()}>
          Duplicate
        </button>
        <button className={allLocked ? 'btn on' : 'btn'} aria-pressed={allLocked} onClick={() => lockSelected()}>
          {allLocked ? 'Unlock' : 'Lock'}
        </button>
        <button className="btn danger" onClick={() => deleteSelected()}>
          Remove
        </button>
      </div>

      <div className="field column">
        <span className="field-label">Align</span>
        <div className="align-grid" role="group" aria-label="Align">
          {ALIGN.map((a) => (
            <button key={a.mode} className="btn" title={a.title} aria-label={`Align ${a.label.toLowerCase()}`} onClick={() => alignSelected(a.mode)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field column">
        <span className="field-label">Space evenly</span>
        <div className="actions">
          <button className="btn" disabled={items.length < 3} onClick={() => spaceSelected('x')} aria-label="Space evenly across">
            Across
          </button>
          <button className="btn" disabled={items.length < 3} onClick={() => spaceSelected('y')} aria-label="Space evenly down">
            Down
          </button>
        </div>
        {items.length < 3 && <p className="note">Needs 3 or more pieces.</p>}
      </div>
    </div>
  );
}
