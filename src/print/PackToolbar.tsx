import { relativeTime, type VersionMeta } from '../model/versions';

interface Props {
  ready: boolean;
  shotsPending: boolean;
  metas: VersionMeta[] | null;
  ordered: VersionMeta[];
  chosenId: string | null;
  onCompare: (id: string | null) => void;
  onClose: () => void;
}

/** The bar above the pages: progress text, version picker, print and close. */
export function PackToolbar({ ready, shotsPending, metas, ordered, chosenId, onCompare, onClose }: Props) {
  return (
    <div className="print-toolbar">
      <div>
        <strong>Print or save as PDF</strong>
        <span className="print-status" role="status">
          {!ready
            ? 'Drawing the plans…'
            : shotsPending
              ? 'Preparing 3D views… You can print now; any 3D picture still missing will show a short note.'
              : 'Ready. In the print window, choose “Save as PDF” as the printer.'}
        </span>
      </div>
      <div className="print-toolbar-actions">
        <label className="print-compare">
          Compare with
          <select
            data-testid="compare-select"
            value={chosenId ?? 'none'}
            onChange={(e) => onCompare(e.target.value === 'none' ? null : e.target.value)}
            disabled={!metas}
          >
            <option value="none">Nothing (no comparison)</option>
            {ordered.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({relativeTime(m.createdAt, Date.now())})
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary" disabled={!ready} onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <button title="Close and go back to the plan (Esc)" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
