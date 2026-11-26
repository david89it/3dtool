import { takeOverEditing, useTabRole } from '../model/tabLock';

/** Shown in a tab that may not edit because another tab is the editor. It covers the whole window. */
export function TabOverlay() {
  const role = useTabRole((s) => s.role);
  const note = useTabRole((s) => s.note);
  if (role !== 'viewer' && role !== 'claiming') return null;
  const taking = role === 'claiming';
  return (
    <div className="modal-backdrop fixed tab-overlay" data-testid="tab-overlay">
      <div className="modal" role="alertdialog" aria-modal="true" aria-label="This plan is open in another tab">
        <h2>This plan is open in another tab</h2>
        <p>This plan is open in another tab. Use that one, or press Use this tab (the other tab will stop editing).</p>
        {note && <p role="status">{note}</p>}
        <div className="modal-actions">
          <button className="btn primary" disabled={taking} onClick={takeOverEditing} data-testid="use-this-tab">
            {taking ? 'Taking over…' : 'Use this tab'}
          </button>
        </div>
      </div>
    </div>
  );
}
