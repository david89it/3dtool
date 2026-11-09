import { useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import type { CatalogueItem } from '../model/types';
import { useStore } from '../model/store';
import { CATEGORY_LABEL } from '../catalogue/items';
import { allCatalogue } from '../catalogue/catalogue';
import { planColor } from '../catalogue/colors';
import { canvasApi } from '../editor2d/canvasApi';
import { formatLength } from '../model/units';
import { CustomItemDialog } from './CustomItemDialog';

type Cat = CatalogueItem['category'];
const CATEGORIES = Object.keys(CATEGORY_LABEL) as Cat[];

/** Small top-down drawing of an item from its parts. */
export function ItemPreview({ item, size = 44 }: { item: CatalogueItem; size?: number }) {
  const { w, d } = item.defaultDims;
  const parts = [...item.geometry].sort((a, b) => a.pos[1] + a.size[1] / 2 - (b.pos[1] + b.size[1] / 2));
  const pad = Math.max(w, d) * 0.06;
  return (
    <svg width={size} height={size} viewBox={`${-w / 2 - pad} ${-d / 2 - pad} ${w + 2 * pad} ${d + 2 * pad}`} aria-hidden preserveAspectRatio="xMidYMid meet">
      {parts.map((p, i) =>
        p.shape === 'cylinder' ? (
          <ellipse key={i} cx={p.pos[0]} cy={p.pos[2]} rx={p.size[0] / 2} ry={p.size[2] / 2} fill={planColor(p.colorToken)} stroke="#5f646b" strokeWidth={Math.max(w, d) / 120} />
        ) : (
          <rect key={i} x={p.pos[0] - p.size[0] / 2} y={p.pos[2] - p.size[2] / 2} width={p.size[0]} height={p.size[2]} fill={planColor(p.colorToken)} stroke="#5f646b" strokeWidth={Math.max(w, d) / 120} />
        ),
      )}
    </svg>
  );
}

export function FurnishPanel() {
  const project = useStore((s) => s.project);
  const units = useStore((s) => s.units);
  const tool = useStore((s) => s.tool);
  const placeItemId = useStore((s) => s.placeItemId);
  const showAll = useStore((s) => s.showAllClearances);
  const setShowAll = useStore((s) => s.setShowAllClearances);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Cat | 'all'>('all');
  const [dialog, setDialog] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);

  const items = useMemo(() => allCatalogue(project), [project]);
  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: [
          { name: 'name', weight: 2 },
          { name: 'aliases', weight: 1.5 },
          { name: 'categoryLabel', weight: 0.5, getFn: (c: CatalogueItem) => CATEGORY_LABEL[c.category] },
        ],
        threshold: 0.38,
        ignoreLocation: true,
      }),
    [items],
  );
  const shown = useMemo(() => {
    const base = query.trim() ? fuse.search(query.trim()).map((r) => r.item) : items;
    return category === 'all' ? base : base.filter((c) => c.category === category);
  }, [query, category, fuse, items]);

  const onPointerDown = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.remove-custom')) return;
    e.preventDefault();
    drag.current = { id, x: e.clientX, y: e.clientY, moved: false };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 5) {
        d.moved = true;
        useStore.setState({ selection: null });
        document.body.classList.add('dragging-opening');
      }
      if (d.moved) canvasApi.itemGhostAt({ x: ev.clientX, y: ev.clientY }, d.id, ev.altKey);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('dragging-opening');
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (!d.moved) {
        useStore.getState().armItem(d.id);
        return;
      }
      canvasApi.itemGhostAt({ x: ev.clientX, y: ev.clientY }, d.id, ev.altKey);
      const g = useStore.getState().itemGhost;
      if (!canvasApi.dropItemGhost()) {
        useStore.getState().setItemGhost(null);
        if (g && !g.ok && g.reason) useStore.getState().toast(`${g.reason}.`);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const removeCustom = (id: string) => {
    const s = useStore.getState();
    s.commit('Remove custom item', (draft) => {
      draft.catalogueOverrides = draft.catalogueOverrides.filter((c) => c.id !== id);
      for (const L of draft.levels) L.items = L.items.filter((i) => i.catalogueId !== id);
    });
    setConfirmRemove(null);
  };

  return (
    <section className="panel-section furnish" aria-label="Furniture">
      <h2>Furniture</h2>
      <input
        className="text-field"
        type="search"
        placeholder="Search: sofa, wall bed, utility…"
        aria-label="Search furniture"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <div className="cat-tabs" role="tablist" aria-label="Categories">
        <button role="tab" aria-selected={category === 'all'} className={category === 'all' ? 'on' : ''} onClick={() => setCategory('all')}>
          All
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} role="tab" aria-selected={category === c} className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <p className="note">Click one, then click the plan. Or drag it onto the plan.</p>
      <ul className="catalogue-list" data-testid="catalogue-list">
        {shown.length === 0 && <li className="note">Nothing matches. Try another word, or add your own item below.</li>}
        {shown.map((c) => {
          const armed = tool === 'placeItem' && placeItemId === c.id;
          const custom = c.id.startsWith('custom-');
          return (
            <li key={c.id}>
              <div
                role="button"
                tabIndex={0}
                className={armed ? 'palette-item on' : 'palette-item'}
                aria-pressed={armed}
                data-testid={`catalogue-${c.id}`}
                onPointerDown={onPointerDown(c.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') useStore.getState().armItem(c.id);
                }}
              >
                <ItemPreview item={c} />
                <span className="palette-text">
                  <span className="tool-label">{c.name}</span>
                  <span className="tool-desc">
                    {formatLength(c.defaultDims.w, units)} × {formatLength(c.defaultDims.d, units)}
                    {custom ? ' · your item' : ''}
                  </span>
                </span>
                {custom && (
                  <button
                    className="remove-custom"
                    aria-label={`Remove ${c.name} from the list`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirmRemove === c.id) removeCustom(c.id);
                      else setConfirmRemove(c.id);
                    }}
                  >
                    {confirmRemove === c.id ? 'Remove?' : '×'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <button className="btn wide" onClick={() => setDialog(true)}>
        Add custom item…
      </button>
      <label className="toggle">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Show space needed around everything
      </label>
      {dialog && <CustomItemDialog onClose={() => setDialog(false)} />}
    </section>
  );
}
