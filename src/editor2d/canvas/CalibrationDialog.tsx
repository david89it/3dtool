// "How far apart are those two points?": sets the scale of a traced picture.
import type { Dispatch, SetStateAction } from 'react';
import type { Level } from '../../model/types';
import { useStore } from '../../model/store';
import { calibrate } from '../../geometry/calibration';
import { formatScale, parseLength, type UnitSystem } from '../../model/units';
import type { CalibState } from './types';

type SetCalib = Dispatch<SetStateAction<CalibState | null>>;

export function commitCalibration(calib: CalibState | null, level: Level | undefined, units: UnitSystem, setCalib: SetCalib) {
  if (!calib || !level?.underlay) {
    setCalib(null);
    return;
  }
  const mm = parseLength(calib.text, units, 'length');
  if (mm === null || mm <= 0) {
    setCalib({ ...calib, error: 'Type the real distance, for example 4.52 m' });
    return;
  }
  const next = calibrate(level.underlay, calib.p1, calib.p2, mm);
  useStore.getState().editLevel('Set plan scale', (L) => {
    if (L.underlay) {
      L.underlay.scaleMmPerPx = next.scaleMmPerPx;
      L.underlay.offset = next.offset;
    }
  });
  setCalib(null);
  useStore.getState().setTool('select');
  useStore.getState().toast(`Scale set: ${formatScale(next.scaleMmPerPx)}.`);
}

export function CalibrationDialog({ calib, setCalib, onCommit }: { calib: CalibState; setCalib: SetCalib; onCommit: () => void }) {
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.stopPropagation()}>
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          onCommit();
        }}
      >
        <h2>How far apart are those two points?</h2>
        <p>
          Type the real distance. A room size printed on the plan works well: for example the reception is
          4.52 m wide.
        </p>
        <input
          autoFocus
          aria-label="Real distance"
          placeholder="e.g. 4.52 m"
          value={calib.text}
          onChange={(e) => setCalib({ ...calib, text: e.target.value, error: undefined })}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') setCalib(null);
          }}
        />
        {calib.error && <p className="error">{calib.error}</p>}
        <div className="modal-actions">
          <button title="Cancel setting the scale (Esc)" type="button" className="btn" onClick={() => setCalib(null)}>
            Cancel
          </button>
          <button title="Use this distance to set the scale" type="submit" className="btn primary">
            Set scale
          </button>
        </div>
      </form>
    </div>
  );
}
