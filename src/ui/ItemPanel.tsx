import { useLevelIssues } from './useIssues';
import { IssueCard } from './AdvicePanel';
import type { Level, PlacedItem } from '../model/types';
import { useStore } from '../model/store';
import { currentState, effectiveDims, findCatalogueItem, itemParts, STATE_LABEL, stateNames } from '../catalogue/catalogue';
import { FINISHABLE, FINISH_SWATCHES } from '../catalogue/colors';
import { SURROUND, surroundLayout } from '../catalogue/builders';
import { computeJoints } from '../geometry/joints';
import { detectRooms } from '../geometry/rooms';
import { ceilingAt, fitSurround, snapToOpening } from '../editor2d/itemOps';
import { CATEGORY_LABEL } from '../catalogue/items';
import { canResize, duplicateItem, rotateBy, setDimension } from '../editor2d/itemOps';
import { formatLength } from '../model/units';
import { EditableLength } from './EditableLength';
import { ItemPreview } from './FurnishPanel';

const AXIS_LABEL = { w: 'Width', d: 'Depth', h: 'Height' } as const;

export function ItemPanel({ level, itemId }: { level: Level; itemId: string }) {
  const project = useStore((s) => s.project);
  const units = useStore((s) => s.units);
  const editLevel = useStore((s) => s.editLevel);
  const select = useStore((s) => s.select);
  const item = level.items.find((i) => i.id === itemId);
  const cat = item ? findCatalogueItem(project, item.catalogueId) : undefined;
  if (!item || !cat) return null;

  const change = (label: string, fn: (i: PlacedItem) => PlacedItem) =>
    editLevel(label, (L) => {
      const idx = L.items.findIndex((x) => x.id === itemId);
      if (idx >= 0) L.items[idx] = fn(L.items[idx] as PlacedItem);
    });

  const states = stateNames(cat);
  const state = currentState(item, cat);
  const eff = effectiveDims(item, cat);
  const name = cat.name.toLowerCase();

  return (
    <div className="panel-section" data-testid="item-panel">
      <div className="row">
        <h2>{cat.name}</h2>
        <ItemPreview item={cat} size={40} />
      </div>
      <p className="note">
        {CATEGORY_LABEL[cat.category]}
        {cat.mount === 'wall' ? ' · fixed to a wall' : cat.mount === 'ceiling' ? ' · hangs from the ceiling' : ''}
        {item.locked ? ' · locked' : ''}
      </p>

      {cat.builder === 'opening-surround' && <SurroundFields level={level} item={item} change={change} locked={!!item.locked} />}

      {cat.builder !== 'opening-surround' && (['w', 'd', 'h'] as const).map((axis) => {
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
                onChange={(mm) => change(`Resize ${name}`, (i) => setDimension(i, cat, axis, mm))}
              />
            ) : (
              <span className="value" title={item.locked ? 'Unlock to change' : 'This item comes in one size'}>
                {formatLength(item.dims[axis], units, 'small')}
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
          <div className="segmented" role="radiogroup" aria-label="Item state">
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

      <FinishPicker item={item} change={change} name={name} hasFinish={itemParts(item, cat).some((p) => FINISHABLE.has(p.colorToken))} />

      <div className="field">
        <span className="field-label">Turned</span>
        <span className="value">{Math.round(item.rotationDeg)}°</span>
      </div>
      <div className="actions">
        <button className="btn" disabled={item.locked} onClick={() => change(`Turn ${name}`, (i) => rotateBy(i, -90))} aria-label="Turn 90° anticlockwise">
          ↺ Turn 90°
        </button>
        <button className="btn" disabled={item.locked} onClick={() => change(`Turn ${name}`, (i) => rotateBy(i, 90))} aria-label="Turn 90° clockwise">
          ↻ Turn 90°
        </button>
      </div>

      {cat.clearance.length > 0 && (
        <div className="field column">
          <span className="field-label">Space it needs</span>
          <ul className="clearance-list">
            {cat.clearance.map((c, i) => (
              <li key={i}>
                <strong>{c.side === 'all' ? 'All round' : c.side === 'front' ? 'In front' : c.side === 'back' ? 'Behind' : 'At the side'}:</strong>{' '}
                {c.reason}. At least {formatLength(c.min, units)}
                {c.ideal > c.min ? `, ideally ${formatLength(c.ideal, units)}` : ''}.
              </li>
            ))}
          </ul>
        </div>
      )}

      <ItemIssues itemId={itemId} />

      <div className="actions">
        <button
          className="btn"
          onClick={() => {
            const copy = duplicateItem(item);
            editLevel(`Duplicate ${name}`, (L) => void L.items.push(copy));
            select({ kind: 'item', id: copy.id });
          }}
        >
          Duplicate
        </button>
        <button className={item.locked ? 'btn on' : 'btn'} aria-pressed={!!item.locked} onClick={() => change(item.locked ? `Unlock ${name}` : `Lock ${name}`, (i) => ({ ...i, locked: !i.locked }))}>
          {item.locked ? 'Unlock' : 'Lock'}
        </button>
        <button
          className="btn danger"
          onClick={() => {
            editLevel(`Remove ${name}`, (L) => {
              L.items = L.items.filter((x) => x.id !== itemId);
            });
            select(null);
          }}
        >
          Remove
        </button>
      </div>
      {!canResize(cat, 'w') && !canResize(cat, 'd') && <p className="note">This item comes in one size.</p>}
    </div>
  );
}

/** Layout problems that involve this item (from the same checks as Advice mode). */
function ItemIssues({ itemId }: { itemId: string }) {
  const issues = useLevelIssues().filter((i) => i.itemIds.includes(itemId));
  return (
    <div className="field column" data-testid="item-issues">
      <span className="field-label">Layout check</span>
      {issues.length === 0 ? (
        <p className="note">No problems with this one.</p>
      ) : (
        <ul className="issue-list">
          {issues.map((i) => (
            <IssueCard key={i.id} issue={i} compact />
          ))}
        </ul>
      )}
    </div>
  );
}

type Change = (label: string, fn: (i: PlacedItem) => PlacedItem) => void;

/** Sizes for a bookcase surround: the opening it frames, the towers either side, depth and height. */
function SurroundFields({ level, item, change, locked }: { level: Level; item: PlacedItem; change: Change; locked: boolean }) {
  const units = useStore((s) => s.units);
  const { side, gapW, gapH } = surroundLayout(item, item.dims);
  const set = (label: string, next: { side?: number; gapW?: number; gapH?: number; d?: number; h?: number }) =>
    change(label, (i) => {
      const cur = surroundLayout(i, i.dims);
      const s2 = Math.max(SURROUND.minSide, Math.round(next.side ?? cur.side));
      const g = Math.max(SURROUND.minGap, Math.round(next.gapW ?? cur.gapW));
      const h = Math.round(next.h ?? i.dims.h);
      const gh = Math.min(Math.round(next.gapH ?? cur.gapH), h - 250);
      return { ...i, params: { ...(i.params ?? {}), gapW: g, gapH: gh }, dims: { w: g + 2 * s2, d: Math.round(next.d ?? i.dims.d), h } };
    });
  const field = (label: string, value: number, onChange: (mm: number) => void, min: number, max: number) => (
    <div className="field" key={label}>
      <span className="field-label">{label}</span>
      {locked ? (
        <span className="value">{formatLength(value, units, 'small')}</span>
      ) : (
        <EditableLength label={label} ctx="small" value={value} min={min} max={max} onChange={onChange} />
      )}
    </div>
  );
  return (
    <>
      {field('Opening width', gapW, (mm) => set('Change surround opening', { gapW: mm }), SURROUND.minGap, 4000)}
      {field('Opening height', gapH, (mm) => set('Change surround opening', { gapH: mm }), 1200, 3000)}
      {field('Shelving each side', side, (mm) => set('Change surround towers', { side: mm }), SURROUND.minSide, 1500)}
      {field('Depth', item.dims.d, (mm) => set('Change surround depth', { d: mm }), 250, 500)}
      {field('Total height', item.dims.h, (mm) => set('Change surround height', { h: mm }), 2200, 3500)}
      <button
        className="btn"
        disabled={locked}
        onClick={() => {
          const J = computeJoints(level);
          const snap = snapToOpening(level, J, item.pos, item.dims.d, side, 1500);
          if (!snap) {
            useStore.getState().toast('No door or opening close enough. Move it next to one first.');
            return;
          }
          change('Fit surround to opening', (i) => fitSurround(i, snap, side, ceilingAt(level, detectRooms(level, J), snap.pos)));
        }}
      >
        Fit to opening
      </button>
    </>
  );
}

/** Paint or timber colour for the piece's painted and wooden parts. */
function FinishPicker({ item, change, name, hasFinish }: { item: PlacedItem; change: Change; name: string; hasFinish: boolean }) {
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
