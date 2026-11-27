import { useMemo } from 'react';
import type { Level } from '../../model/types';
import { useStore } from '../../model/store';
import { detectRooms, matchDetected } from '../../geometry/rooms';
import { formatArea, formatLength } from '../../model/units';
import { EditableLength } from '../EditableLength';
import { needsStructuralBadge, STRUCTURAL_BADGE_TEXT } from '../../geometry/openings';
import { noteLength } from '../../model/notes';
import { TextField } from './shared';

export function LevelPanel({ level }: { level: Level }) {
  const editLevel = useStore((s) => s.editLevel);
  const units = useStore((s) => s.units);
  const select = useStore((s) => s.select);
  const showMarkers = useStore((s) => s.showMarkers);
  const setShowMarkers = useStore((s) => s.setShowMarkers);
  const detected = useMemo(() => detectRooms(level), [level]);
  const estimatedWalls = level.walls.filter((w) => w.estimated).length;

  return (
    <div className="panel-section" data-testid="level-panel">
      <h2>{level.name}</h2>
      <div className="field column">
        <span className="field-label">Floor name</span>
        <TextField label="Floor name" value={level.name} onCommit={(v) => editLevel('Rename floor', (L) => void (L.name = v))} />
      </div>
      <div className="field">
        <span className="field-label">Ceiling height</span>
        <EditableLength
          label="Ceiling height"
          value={level.ceilingHeight}
          estimated={level.estimated}
          min={1500}
          max={6000}
          onChange={(mm) =>
            editLevel('Set ceiling height', (L) => {
              L.ceilingHeight = Math.round(mm);
              L.estimated = false;
            })
          }
        />
      </div>
      <div className="field">
        <span className="field-label">Floor height above the front door</span>
        <EditableLength
          label="Floor height above entrance"
          value={level.elevation}
          estimated={level.estimated}
          min={-10000}
          max={30000}
          onChange={(mm) => editLevel('Set floor height', (L) => void (L.elevation = Math.round(mm)))}
        />
      </div>

      {level.walls.some(needsStructuralBadge) && (
        <>
          <h3>Structural warnings</h3>
          <ul className="room-list" data-testid="structural-list">
            {level.walls.filter(needsStructuralBadge).map((w) => (
              <li key={w.id}>
                <button className="list-btn" onClick={() => select({ kind: 'wall', id: w.id })}>
                  <span className="pin">!</span>
                  <span className="wrap">{STRUCTURAL_BADGE_TEXT}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Rooms</h3>
      {level.rooms.length === 0 && <p className="note">No closed rooms yet. Draw walls that meet up to make one.</p>}
      <ul className="room-list" data-testid="room-list">
        {level.rooms.map((r) => {
          const d = matchDetected(r, detected);
          return (
            <li key={r.id}>
              <button className="list-btn" onClick={() => select({ kind: 'room', id: r.id })}>
                <span>{r.name}</span>
                <span className="muted">{d ? formatArea(d.area, units) : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {(level.notes ?? []).length > 0 && (
        <>
          <h3>Notes</h3>
          <ul className="room-list" data-testid="note-list">
            {(level.notes ?? []).map((n) => (
              <li key={n.id}>
                <button className="list-btn" onClick={() => select({ kind: 'note', id: n.id })}>
                  <span className="pin note-pin">{n.kind === 'note' ? '✎' : n.kind === 'measure' ? '↔' : '→'}</span>
                  <span className="wrap">
                    {n.kind === 'measure' ? `${formatLength(noteLength(n), units)}${n.text ? ' · ' : ''}` : ''}
                    {n.text ?? (n.kind === 'note' ? 'Empty note' : n.kind === 'arrow' ? 'Arrow' : '')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>To measure on site</h3>
      {estimatedWalls > 0 && (
        <p className="note">
          {estimatedWalls} {estimatedWalls === 1 ? 'wall is' : 'walls are'} still estimated (shown with ≈).
        </p>
      )}
      <ul className="room-list">
        {(level.markers ?? []).map((m) => (
          <li key={m.id}>
            <button className="list-btn" onClick={() => select({ kind: 'marker', id: m.id })}>
              <span className="pin">?</span>
              <span className="wrap">{m.text}</span>
            </button>
          </li>
        ))}
      </ul>
      <label className="toggle">
        <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} />
        Show “measure me” pins on the plan
      </label>
    </div>
  );
}
