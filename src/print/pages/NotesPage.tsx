import type { PackModel } from './model';
import { formatLength } from '../../model/units';
import { noteLength, NOTE_KIND_LABEL } from '../../model/notes';

export function NotesPage({ m }: { m: PackModel }) {
  const { units, withNotes } = m;
  return (
    <section className="print-page flow" data-testid="print-notes">
      <h2>Notes</h2>
      {withNotes.length === 0 ? (
        <p>No notes have been added to the plan.</p>
      ) : (
        withNotes.map((f) => (
          <div key={f.levelId}>
            <h3>{f.name}</h3>
            <ol>
              {f.notes.map((n) => (
                <li key={n.id}>
                  {n.kind === 'measure' ? `${NOTE_KIND_LABEL.measure} ${formatLength(noteLength(n), units)}: ` : ''}
                  {n.text}
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
    </section>
  );
}
