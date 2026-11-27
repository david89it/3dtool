import type { CatalogueItem, PlacedItem } from '../../model/types';
import { useStore } from '../../model/store';
import { currentState, effectiveDims, isRound, STATE_LABEL, stateNames } from '../../catalogue/catalogue';
import { setDimension } from '../../editor2d/itemOps';
import { formatLength } from '../../model/units';
import { EditableLength } from '../EditableLength';
import { isMine, makeRound, type Change } from './shared';

const AXIS_LABEL = { w: 'Width', d: 'Depth', h: 'Height' } as const;

export function SizeFields({ item, cat, change, name }: { item: PlacedItem; cat: CatalogueItem; change: Change; name: string }) {
  const units = useStore((s) => s.units);
  const states = stateNames(cat);
  const state = currentState(item, cat);
  const eff = effectiveDims(item, cat);
  return (
    <>
      {isRound(cat) && cat.resizable.w && cat.resizable.d && !item.locked && (
        <div className="field">
          <span className="field-label">Diameter</span>
          <EditableLength
            label="Item diameter"
            ctx="small"
            value={Math.max(item.dims.w, item.dims.d)}
            min={Math.max(cat.resizable.w[0], cat.resizable.d[0])}
            max={Math.min(cat.resizable.w[1], cat.resizable.d[1])}
            onChange={(mm) => change(`Resize ${name}`, (i) => setDimension(setDimension(i, cat, 'w', mm), cat, 'd', mm))}
          />
        </div>
      )}
      {isRound(cat) && (!cat.resizable.w || !cat.resizable.d || item.locked) && (
        <div className="field">
          <span className="field-label">Diameter</span>
          <span className="value" title={item.locked ? 'Unlock to change' : 'This item comes in one size'}>
            {formatLength(Math.max(item.dims.w, item.dims.d), units, 'small')}
          </span>
        </div>
      )}
      {!isRound(cat) && isMine(cat) && !item.locked && (
        <button className="btn" title="Turn your item into a round piece, sized by its diameter" onClick={() => makeRound(cat, item)}>
          ◯ Make it round
        </button>
      )}

      {cat.builder !== 'opening-surround' && (['w', 'd', 'h'] as const).filter((axis) => !isRound(cat) || axis === 'h').map((axis) => {
        const r = cat.resizable[axis];
        return (
          <div className="field" key={axis}>
            <span className="field-label">{AXIS_LABEL[axis]}</span>
            {r && !item.locked ? (
              <EditableLength
                label={`Item ${AXIS_LABEL[axis].toLowerCase()}`}
                ctx="small"
                value={item.dims[axis]}
                min={r[0]}
                max={r[1]}
                estimated={item.estimated}
                onChange={(mm) => change(`Resize ${name}`, (i) => ({ ...setDimension(i, cat, axis, mm), estimated: undefined }))}
              />
            ) : (
              <span className="value" title={item.locked ? 'Unlock to change' : 'This item comes in one size'}>
                {formatLength(item.dims[axis], units, 'small')}
                {!item.locked && <span className="muted"> · one size</span>}
              </span>
            )}
          </div>
        );
      })}
      {states.length > 0 && state !== states[0] && (
        <p className="note">
          Sizes are for “{STATE_LABEL[states[0]] ?? states[0]}”. Now it takes {formatLength(eff.w, units)} × {formatLength(eff.d, units)}.
        </p>
      )}

      {states.length > 0 && (
        <div className="field column">
          <span className="field-label">Position</span>
          <div className="segmented" role="radiogroup" aria-label="Position">
            {states.map((st) => (
              <button
                key={st}
                role="radio"
                aria-checked={state === st}
                className={state === st ? 'on' : ''}
                onClick={() => change(`${STATE_LABEL[st] ?? st}: ${name}`, (i) => ({ ...i, state: st }))}
              >
                {STATE_LABEL[st] ?? st}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
