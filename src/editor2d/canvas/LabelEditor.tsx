// The small input that opens over a wall length or an opening measurement, and what happens on Enter.
import type { Dispatch, SetStateAction } from 'react';
import type { Level } from '../../model/types';
import { useStore } from '../../model/store';
import { measureWallFace, setInternalLength } from '../../geometry/dimensions';
import { editOpening } from '../../geometry/openingEdits';
import { formatLength, parseLength, type UnitSystem } from '../../model/units';
import type { LabelEdit } from './types';

type SetEdit = Dispatch<SetStateAction<LabelEdit | null>>;

/** Apply the typed length, or show a hint and keep the editor open. */
export function commitLabelEdit(edit: LabelEdit, level: Level, units: UnitSystem, setEdit: SetEdit) {
  if (edit.opening) {
    const mm = parseLength(edit.text, units, 'length');
    if (mm === null || mm < 0 || mm > 50000) {
      setEdit({ ...edit, error: 'Try 80 cm, 0.8 m or 2′ 7″' });
      return;
    }
    const { id, field } = edit.opening;
    let error: string | null = null;
    const fmt = (x: number) => formatLength(x, units);
    // Check on a scratch copy first so a refused edit leaves no undo step.
    const probe = structuredClone(level) as Level;
    error = editOpening(probe, id, field, mm, fmt);
    if (error) {
      setEdit({ ...edit, error });
      return;
    }
    useStore.getState().editLevel(field === 'width' ? 'Change opening width' : 'Move opening', (L) => {
      editOpening(L as Level, id, field, mm, fmt);
    });
    setEdit(null);
    return;
  }
  const mm = parseLength(edit.text, units, 'length');
  if (mm === null || mm < 50 || mm > 50000) {
    setEdit({ ...edit, error: 'Try 3.32 m, 332 cm or 10′ 11″' });
    return;
  }
  const wallId = edit.wallId;
  useStore.getState().editLevel('Set wall length', (L) => {
    setInternalLength(L, wallId, mm, (lv) => measureWallFace(lv, wallId));
  });
  setEdit(null);
}

export function LabelEditor({ edit, setEdit, onCommit }: { edit: LabelEdit; setEdit: SetEdit; onCommit: () => void }) {
  return (
    <div className="label-editor" style={{ left: edit.screen.x, top: edit.screen.y }} onPointerDown={(e) => e.stopPropagation()}>
      <input
        autoFocus
        aria-label={edit.opening ? 'Opening measurement on plan' : 'Wall length on plan'}
        value={edit.text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setEdit({ ...edit, text: e.target.value, error: undefined })}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') onCommit();
          if (e.key === 'Escape') setEdit(null);
        }}
        onBlur={() => setEdit(null)}
      />
      <div className={edit.error ? 'label-editor-hint error' : 'label-editor-hint'}>
        {edit.error ??
          (edit.opening
            ? edit.opening.field === 'width'
              ? 'Opening width. Enter to apply'
              : 'Wall left at this side. Enter to apply'
            : 'Inside length. Enter to apply, Esc to cancel')}
      </div>
    </div>
  );
}
