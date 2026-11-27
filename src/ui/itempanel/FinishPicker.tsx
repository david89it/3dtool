import type { PlacedItem } from '../../model/types';
import { FINISH_SWATCHES } from '../../catalogue/colors';
import { Change } from './shared';

/** Paint or timber colour for the piece's painted and wooden parts. */
export function FinishPicker({ item, change, name, hasFinish }: { item: PlacedItem; change: Change; name: string; hasFinish: boolean }) {
  if (!hasFinish) return null;
  const setFinish = (hex: string | undefined, label: string) =>
    change(`${label}: ${name}`, (i) => {
      const next = { ...i };
      if (hex) next.finish = hex;
      else delete next.finish;
      return next;
    });
  return (
    <div className="field column">
      <span className="field-label">Colour</span>
      <div className="swatches" role="radiogroup" aria-label="Colour">
        <button
          type="button"
          role="radio"
          aria-checked={!item.finish}
          className={!item.finish ? 'swatch on' : 'swatch'}
          title="As made"
          aria-label="As made"
          onClick={() => setFinish(undefined, 'Original colour')}
        >
          <span className="swatch-chip as-made" />
        </button>
        {FINISH_SWATCHES.map((sw) => (
          <button
            key={sw.hex}
            type="button"
            role="radio"
            aria-checked={item.finish === sw.hex}
            className={item.finish === sw.hex ? 'swatch on' : 'swatch'}
            title={sw.name}
            aria-label={sw.name}
            onClick={() => setFinish(sw.hex, sw.name)}
          >
            <span className="swatch-chip" style={{ background: sw.hex }} />
          </button>
        ))}
        <label className="swatch custom" title="Any colour">
          <input
            type="color"
            aria-label="Any colour"
            value={item.finish ?? '#e7e1d6'}
            onChange={(e) => setFinish(e.target.value, 'Colour')}
          />
        </label>
      </div>
    </div>
  );
}
