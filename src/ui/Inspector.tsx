import { useEffect, useMemo, useRef, useState } from 'react';
import type { Level, Wall, WallKind, Structural } from '../model/types';
import { useLevel, useStore } from '../model/store';
import { detectRooms, matchDetected } from '../geometry/rooms';
import { computeJoints } from '../geometry/joints';
import { measureWallFace, setInternalLength, wallDimensions } from '../geometry/dimensions';
import { DEFAULT_THICKNESS, deleteWall, splitWall, wallEnds } from '../geometry/wallGraph';
import { lerp } from '../geometry/vec';
import { formatArea } from '../model/units';
import { EditableLength } from './EditableLength';
import { AdvicePanel } from './AdvicePanel';
import { OpeningPanel } from './OpeningPanel';
import { ItemPanel } from './ItemPanel';
import { isStructural, needsStructuralBadge, OPENING_LABEL, STRUCTURAL_BADGE_TEXT } from '../geometry/openings';
import { openUpWall } from '../geometry/openingEdits';
import { formatLength } from '../model/units';
import { deleteNote, findNote, NOTE_COLORS, NOTE_KIND_LABEL, noteColor, noteLength, setNoteColor, setNoteText } from '../model/notes';

export const STRUCTURAL_DELETE_WARNING =
  'That wall may hold the building up. Removing it needs a structural engineer, steel, Building Control and the landlord’s licence. Undo puts it back.';

const KIND_LABEL: Record<WallKind, string> = {
  internal: 'Inside wall',
  external: 'Outside wall',
  party: 'Shared with neighbour',
};

const STRUCT_LABEL: Record<Structural, string> = {
  unknown: "Don't know",
  loadBearing: 'Load-bearing',
  nonLoadBearing: 'Not load-bearing',
};

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TextField({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="text-field"
      aria-label={label}
      value={text ?? value}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== null && text.trim() && text !== value) onCommit(text.trim());
        setText(null);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function WallPanel({ level, wall }: { level: Level; wall: Wall }) {
  const editLevel = useStore((s) => s.editLevel);
  const select = useStore((s) => s.select);
  const units = useStore((s) => s.units);
  const face = useMemo(() => {
    const J = computeJoints(level);
    return wallDimensions(level, J, detectRooms(level, J)).find((d) => d.wallId === wall.id)?.length ?? 0;
  }, [level, wall.id]);

  const edit = (label: string, fn: (w: Wall, L: Level) => void) =>
    editLevel(label, (L) => {
      const w = L.walls.find((x) => x.id === wall.id);
      if (w) fn(w as Wall, L as Level);
    });


  return (
    <div className="panel-section" data-testid="wall-panel">
      <h2>Wall</h2>
      <div className="field">
        <span className="field-label">Length (inside)</span>
        <EditableLength
          label="Wall length"
          value={face}
          estimated={wall.estimated}
          min={50}
          onChange={(mm) =>
            editLevel('Set wall length', (L) => setInternalLength(L as Level, wall.id, mm, (lv) => measureWallFace(lv, wall.id)))
          }
        />
      </div>
      <div className="field">
        <span className="field-label">Thickness</span>
        <EditableLength
          label="Wall thickness"
          ctx="small"
          value={wall.thickness}
          estimated={wall.estimated}
          min={30}
          max={1000}
          onChange={(mm) =>
            edit('Set wall thickness', (w) => {
              w.thickness = Math.round(mm);
              w.estimated = false;
            })
          }
        />
      </div>
      <div className="field column">
        <span className="field-label">What kind of wall?</span>
        <Segmented<WallKind>
          label="Kind of wall"
          value={wall.kind}
          options={(['internal', 'external', 'party'] as WallKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          onChange={(k) =>
            edit('Change wall type', (w) => {
              if (w.estimated || w.thickness === DEFAULT_THICKNESS[w.kind]) w.thickness = DEFAULT_THICKNESS[k];
              w.kind = k;
            })
          }
        />
      </div>
      <div className="field column">
        <span className="field-label">Does it hold the building up?</span>
        <Segmented<Structural>
          label="Load-bearing"
          value={wall.structural}
          options={(['unknown', 'loadBearing', 'nonLoadBearing'] as Structural[]).map((k) => ({
            value: k,
            label: STRUCT_LABEL[k],
          }))}
          onChange={(k) => edit('Change structure', (w) => void (w.structural = k))}
        />
        <p className="note">
          Only a structural engineer can confirm this. Until then, treat “Don’t know” as load-bearing.
        </p>
      </div>
      {needsStructuralBadge(wall) && (
        <p className="badge-amber" data-testid="structural-badge">
          ⚠ {STRUCTURAL_BADGE_TEXT}
        </p>
      )}
      <div className="field column">
        <span className="field-label">Doors, windows and openings</span>
        {wall.openings.length === 0 && <p className="note">None yet.</p>}
        <ul className="opening-list">
          {wall.openings.map((o) => (
            <li key={o.id}>
              <button className="list-btn" onClick={() => select({ kind: 'opening', id: o.id })}>
                <span>{OPENING_LABEL[o.type]}</span>
                <span className="muted">{formatLength(o.width, units)} wide</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          className="btn"
          onClick={() => {
            let id: string | null = null;
            let error: string | null = null;
            editLevel('Open up wall', (L) => {
              const r = openUpWall(L as Level, wall.id);
              if ('id' in r) id = r.id;
              else error = r.error;
            });
            if (id) {
              useStore.getState().setMode('openings');
              select({ kind: 'opening', id });
            } else if (error) useStore.getState().toast(error, 'warn');
          }}
        >
          Open up this wall
        </button>
        <p className="note">Adds the widest opening this wall allows. You can then change its width.</p>
      </div>
      {wall.estimated && (
        <div className="estimate-box">
          <p>≈ Estimated from the agent's plan, which is not to scale.</p>
          <button className="btn small" onClick={() => edit('Confirm measurements', (w) => void (w.estimated = false))}>
            I've measured this wall
          </button>
        </div>
      )}
      <div className="actions">
        <button
          className="btn"
          onClick={() => {
            const [a, b] = wallEnds(level, wall);
            editLevel('Split wall', (L) => void splitWall(L as Level, wall.id, lerp(a, b, 0.5)));
          }}
        >
          Split in two
        </button>
        <button
          className="btn danger"
          onClick={() => {
            editLevel('Delete wall', (L) => deleteWall(L as Level, wall.id));
            select(null);
            if (isStructural(wall)) useStore.getState().toast(STRUCTURAL_DELETE_WARNING, 'warn');
          }}
        >
          Delete wall
        </button>
      </div>
    </div>
  );
}

function RoomPanel({ level, roomId }: { level: Level; roomId: string }) {
  const editLevel = useStore((s) => s.editLevel);
  const units = useStore((s) => s.units);
  const room = level.rooms.find((r) => r.id === roomId);
  const detected = useMemo(() => (room ? matchDetected(room, detectRooms(level)) : undefined), [level, room]);
  if (!room) return null;
  return (
    <div className="panel-section" data-testid="room-panel">
      <h2>Room</h2>
      <div className="field column">
        <span className="field-label">Name</span>
        <TextField
          label="Room name"
          value={room.name}
          onCommit={(v) =>
            editLevel('Rename room', (L) => {
              const r = L.rooms.find((x) => x.id === roomId);
              if (r) r.name = v;
            })
          }
        />
      </div>
      <div className="field">
        <span className="field-label">Floor area</span>
        <span className="value">{detected ? formatArea(detected.area, units) : '–'}</span>
      </div>
      <div className="field">
        <span className="field-label">Ceiling height</span>
        <EditableLength
          label="Room ceiling height"
          value={room.ceilingHeight ?? level.ceilingHeight}
          estimated={room.ceilingHeight === undefined && level.estimated}
          min={1500}
          max={6000}
          onChange={(mm) =>
            editLevel('Set ceiling height', (L) => {
              const r = L.rooms.find((x) => x.id === roomId);
              if (r) r.ceilingHeight = Math.round(mm);
            })
          }
        />
      </div>
      {room.ceilingHeight !== undefined && (
        <button
          className="btn small"
          onClick={() =>
            editLevel('Reset ceiling height', (L) => {
              const r = L.rooms.find((x) => x.id === roomId);
              if (r) delete r.ceilingHeight;
            })
          }
        >
          Use the floor's ceiling height
        </button>
      )}
      <p className="note">Rooms are found from closed loops of walls. Move or delete walls to change them.</p>
    </div>
  );
}

function MarkerPanel({ level, markerId }: { level: Level; markerId: string }) {
  const editLevel = useStore((s) => s.editLevel);
  const select = useStore((s) => s.select);
  const m = (level.markers ?? []).find((x) => x.id === markerId);
  if (!m) return null;
  return (
    <div className="panel-section">
      <h2>To measure</h2>
      <p className="marker-text">{m.text}</p>
      <div className="actions">
        <button
          className="btn primary"
          onClick={() => {
            editLevel('Remove pin', (L) => {
              L.markers = (L.markers ?? []).filter((x) => x.id !== markerId);
            });
            select(null);
          }}
        >
          Done, remove pin
        </button>
      </div>
    </div>
  );
}

/** Text of a note. Saved when she leaves the box (one undo step), and never lost if the panel closes first. */
function NoteText({ noteId, value, focus }: { noteId: string; value: string; focus: boolean }) {
  const [text, setText] = useState(value);
  const latest = useRef({ text: value, noteId, value });
  latest.current = { text, noteId, value };
  const save = () => {
    const c = latest.current;
    if (c.text.trim() === c.value.trim()) return;
    useStore.getState().editLevel('Edit note', (L) => setNoteText(L as Level, c.noteId, c.text));
  };
  useEffect(() => save, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <textarea
      className="text-field area"
      aria-label="Note text"
      autoFocus={focus && !value}
      placeholder="Type your note, for example: is this a chimney breast?"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
      }}
    />
  );
}

function NotePanel({ level, noteId }: { level: Level; noteId: string }) {
  const editLevel = useStore((s) => s.editLevel);
  const select = useStore((s) => s.select);
  const units = useStore((s) => s.units);
  const n = findNote(level, noteId);
  if (!n) return null;
  const current = noteColor(n);
  return (
    <div className="panel-section" data-testid="note-panel">
      <h2>{NOTE_KIND_LABEL[n.kind]}</h2>
      {n.kind === 'measure' && (
        <div className="field">
          <span className="field-label">Length</span>
          <span className="value">{formatLength(noteLength(n), units)}</span>
        </div>
      )}
      <div className="field column">
        <span className="field-label">{n.kind === 'note' ? 'What do you want to say?' : 'Comment (optional)'}</span>
        <NoteText key={n.id} noteId={n.id} value={n.text ?? ''} focus={n.kind === 'note'} />
      </div>
      <div className="field column">
        <span className="field-label">Colour</span>
        <div className="segmented" role="radiogroup" aria-label="Note colour">
          {NOTE_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={current === c.value}
              className={current === c.value ? 'on' : ''}
              onClick={() => editLevel('Colour note', (L) => setNoteColor(L as Level, n.id, c.value))}
            >
              <span className="swatch" style={{ background: c.value }} aria-hidden />
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <p className="note">Drag it on the plan to move it. {n.kind !== 'note' ? 'Drag a round end to change it. ' : ''}It goes in the printed pack.</p>
      <div className="actions">
        <button
          className="btn danger"
          onClick={() => {
            editLevel('Remove note', (L) => deleteNote(L as Level, n.id));
            select(null);
          }}
        >
          Delete {NOTE_KIND_LABEL[n.kind].toLowerCase()}
        </button>
      </div>
    </div>
  );
}

function LevelPanel({ level }: { level: Level }) {
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

export function Inspector() {
  const level = useLevel();
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => s.mode);
  if (!level) return null;
  if (mode === 'advice') return <AdvicePanel />;
  let body;
  if (selection?.kind === 'wall') {
    const w = level.walls.find((x) => x.id === selection.id);
    body = w ? <WallPanel level={level} wall={w} /> : null;
  } else if (selection?.kind === 'room') body = <RoomPanel level={level} roomId={selection.id} />;
  else if (selection?.kind === 'marker') body = <MarkerPanel level={level} markerId={selection.id} />;
  else if (selection?.kind === 'note') body = <NotePanel level={level} noteId={selection.id} />;
  else if (selection?.kind === 'opening') body = <OpeningPanel level={level} openingId={selection.id} />;
  else if (selection?.kind === 'item') body = <ItemPanel level={level} itemId={selection.id} />;
  return (
    <aside className="inspector" aria-label="Details">
      {body ?? <LevelPanel level={level} />}
    </aside>
  );
}
