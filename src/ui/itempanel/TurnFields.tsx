import type { PlacedItem } from '../../model/types';
import { CommitInput } from '../budgetFields';
import { turnSelected } from '../../editor2d/selectionActions';

import type { Change } from './shared';
export function TurnFields({ item, name, change }: { item: PlacedItem; name: string; change: Change }) {
  return (
    <>
      <div className="field">
        <span className="field-label">Turned</span>
        {item.locked ? (
          <span className="value">{Math.round(item.rotationDeg)}°</span>
        ) : (
          <CommitInput
            value={String(Math.round(item.rotationDeg * 10) / 10)}
            label="Angle in degrees"
            inputMode="decimal"
            className="text-field angle-field"
            testId="item-angle"
            onCommit={(text) => {
              const v = Number(text.replace(/[°\s]/g, '').replace(',', '.'));
              if (!Number.isFinite(v)) return;
              const deg = ((v % 360) + 360) % 360;
              change(`Turn ${name} to ${Math.round(deg)}°`, (i) => ({ ...i, rotationDeg: deg, mountedTo: undefined }));
            }}
          />
        )}
      </div>
      <div className="actions turn-actions">
        <button title="Turn 15° left (Alt Shift R)" className="btn" disabled={item.locked} onClick={() => turnSelected(-15)} aria-label="Turn 15° anticlockwise">
          ↺ 15°
        </button>
        <button title="Turn 15° right (Alt R)" className="btn" disabled={item.locked} onClick={() => turnSelected(15)} aria-label="Turn 15° clockwise">
          ↻ 15°
        </button>
        <button title="Turn 90° left (Shift R)" className="btn" disabled={item.locked} onClick={() => turnSelected(-90)} aria-label="Turn 90° anticlockwise">
          ↺ 90°
        </button>
        <button title="Turn 90° right (R)" className="btn" disabled={item.locked} onClick={() => turnSelected(90)} aria-label="Turn 90° clockwise">
          ↻ 90°
        </button>
      </div>
    </>
  );
}
