import { useEffect, useRef, useState } from 'react';
import type { Level } from '../../model/types';
import { useStore } from '../../model/store';
import { EditableLength } from '../EditableLength';
import { deleteNote, findNote, NOTE_COLORS, NOTE_KIND_LABEL, noteColor, noteLength, setNoteColor, setNoteText } from '../../model/notes';

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

export function NotePanel({ level, noteId }: { level: Level; noteId: string }) {
  const editLevel = useStore((s) => s.editLevel);
  const select = useStore((s) => s.select);
  const n = findNote(level, noteId);
  if (!n) return null;
  const current = noteColor(n);
  return (
    <div className="panel-section" data-testid="note-panel">
      <h2>{NOTE_KIND_LABEL[n.kind]}</h2>
      {n.kind === 'measure' && (
        <div className="field">
          <span className="field-label">Length</span>
          <EditableLength
            label="Measurement length"
            value={noteLength(n)}
            min={10}
            max={200000}
            onChange={(mm) =>
              editLevel('Set measurement length', (L) => {
                const note = findNote(L as Level, n.id);
                if (!note?.to) return;
                const len = noteLength(note);
                if (len < 1) return;
                const k = mm / len;
                note.to = { x: note.pos.x + (note.to.x - note.pos.x) * k, y: note.pos.y + (note.to.y - note.pos.y) * k };
              })
            }
          />
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
              <span className="note-swatch" style={{ background: c.value }} aria-hidden />
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <p className="note">Drag it on the plan to move it. {n.kind !== 'note' ? 'Drag a round end to change it. ' : ''}It goes in the printed pack.</p>
      <div className="actions">
        <button
          className="btn danger"
          title="Remove this note (Delete)"
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
