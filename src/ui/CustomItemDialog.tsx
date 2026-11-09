import { useState } from 'react';
import type { CatalogueItem, Clearance } from '../model/types';
import { useStore } from '../model/store';
import { uid } from '../model/ids';
import { CATEGORY_LABEL, customGeometry } from '../catalogue/items';
import { formatLength, parseLength } from '../model/units';

type Cat = CatalogueItem['category'];

interface Field {
  key: string;
  label: string;
  initial: number;
  min: number;
  max: number;
}

const SIZE_FIELDS: Field[] = [
  { key: 'w', label: 'Width', initial: 800, min: 50, max: 6000 },
  { key: 'd', label: 'Depth', initial: 500, min: 20, max: 6000 },
  { key: 'h', label: 'Height', initial: 900, min: 5, max: 3500 },
];

const CLEAR_FIELDS: Field[] = [
  { key: 'frontMin', label: 'In front: at least', initial: 600, min: 0, max: 3000 },
  { key: 'frontIdeal', label: 'In front: ideally', initial: 800, min: 0, max: 3000 },
  { key: 'sideMin', label: 'Each side: at least', initial: 0, min: 0, max: 3000 },
  { key: 'sideIdeal', label: 'Each side: ideally', initial: 0, min: 0, max: 3000 },
];

export function CustomItemDialog({ onClose }: { onClose: () => void }) {
  const units = useStore((s) => s.units);
  const [name, setName] = useState('');
  const [mount, setMount] = useState<CatalogueItem['mount']>('floor');
  const [category, setCategory] = useState<Cat>('storage');
  const [reason, setReason] = useState('Room to use it');
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries([...SIZE_FIELDS, ...CLEAR_FIELDS].map((f) => [f.key, formatLength(f.initial, units, 'small')])),
  );
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!name.trim()) {
      setError('Give it a name, for example "Grandma\'s trunk".');
      return;
    }
    const v: Record<string, number> = {};
    for (const f of [...SIZE_FIELDS, ...CLEAR_FIELDS]) {
      const mm = parseLength(text[f.key] ?? '', units, 'small');
      if (mm === null || mm < f.min || mm > f.max) {
        setError(`${f.label}: type a size like 60 cm or 600 mm (between ${formatLength(f.min, units, 'small')} and ${formatLength(f.max, units)}).`);
        return;
      }
      v[f.key] = Math.round(mm);
    }
    const clearance: Clearance[] = [];
    if (v.frontMin > 0 || v.frontIdeal > 0) clearance.push({ side: 'front', min: v.frontMin, ideal: Math.max(v.frontIdeal, v.frontMin), reason: reason.trim() || 'Room to use it' });
    if (v.sideMin > 0 || v.sideIdeal > 0) {
      for (const side of ['left', 'right'] as const) clearance.push({ side, min: v.sideMin, ideal: Math.max(v.sideIdeal, v.sideMin), reason: reason.trim() || 'Room to use it' });
    }
    const item: CatalogueItem = {
      id: `custom-${uid('c')}`,
      name: name.trim(),
      aliases: [name.trim().toLowerCase(), 'custom', 'my item'],
      category,
      defaultDims: { w: v.w, d: v.d, h: v.h },
      resizable: { w: [Math.max(50, Math.round(v.w / 2)), v.w * 2], d: [Math.max(20, Math.round(v.d / 2)), v.d * 2], h: [Math.max(5, Math.round(v.h / 2)), v.h * 2] },
      mount,
      geometry: customGeometry(v.w, v.d, v.h, mount),
      clearance,
      rules: ['door-swing', 'loft-headroom'],
    };
    useStore.getState().commit(`Add custom item “${item.name}”`, (draft) => {
      draft.catalogueOverrides.push(item);
    });
    useStore.getState().toast(`“${item.name}” added. Find it in the list or by search.`);
    onClose();
  };

  return (
    <div className="modal-backdrop fixed" onPointerDown={(e) => e.stopPropagation()}>
      <form
        className="modal"
        aria-label="Add custom item"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
        }}
      >
        <h2>Add your own item</h2>
        <label className="form-row">
          <span className="field-label">Name</span>
          <input className="text-field" aria-label="Item name" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Grandma's trunk" />
        </label>
        <div className="form-grid">
          {SIZE_FIELDS.map((f) => (
            <label key={f.key} className="form-row">
              <span className="field-label">{f.label}</span>
              <input className="text-field" aria-label={f.label} value={text[f.key]} onChange={(e) => setText({ ...text, [f.key]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className="form-grid two">
          <label className="form-row">
            <span className="field-label">Stands on</span>
            <select className="text-field" aria-label="Mounted on" value={mount} onChange={(e) => setMount(e.target.value as CatalogueItem['mount'])}>
              <option value="floor">The floor</option>
              <option value="wall">A wall</option>
              <option value="ceiling">The ceiling</option>
            </select>
          </label>
          <label className="form-row">
            <span className="field-label">Group</span>
            <select className="text-field" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as Cat)}>
              {(Object.keys(CATEGORY_LABEL) as Cat[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <span className="field-label">Space it needs</span>
        <div className="form-grid two">
          {CLEAR_FIELDS.map((f) => (
            <label key={f.key} className="form-row">
              <span className="field-label small">{f.label}</span>
              <input className="text-field" aria-label={f.label} value={text[f.key]} onChange={(e) => setText({ ...text, [f.key]: e.target.value })} />
            </label>
          ))}
        </div>
        <label className="form-row">
          <span className="field-label">Why it needs that space</span>
          <input className="text-field" aria-label="Why it needs that space" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Add to the list
          </button>
        </div>
      </form>
    </div>
  );
}
