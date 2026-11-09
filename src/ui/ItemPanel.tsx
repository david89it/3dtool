import { useLevelIssues } from './useIssues';
import { IssueCard } from './AdvicePanel';
import type { Level, PlacedItem } from '../model/types';
import { useStore } from '../model/store';
import { currentState, effectiveDims, findCatalogueItem, STATE_LABEL, stateNames } from '../catalogue/catalogue';
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

      {(['w', 'd', 'h'] as const).map((axis) => {
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
