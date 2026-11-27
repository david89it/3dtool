import type { PlacedItem } from '../../model/types';
import { MODULE, moduleDims, moduleGrid } from '../../catalogue/builders';
import { Change } from './shared';

/** Modules across and high (stacked). Each module is a fixed 75 x 75 cm, 37 cm deep. */
export function ModuleFields({ item, change, locked }: { item: PlacedItem; change: Change; locked: boolean }) {
  const { cols, rows } = moduleGrid(item);
  const set = (label: string, next: { cols?: number; rows?: number }) =>
    change(label, (i) => {
      const cur = moduleGrid(i);
      const g = moduleGrid({ params: { cols: next.cols ?? cur.cols, rows: next.rows ?? cur.rows } });
      // Keep the back edge and the left end where they are when it grows or shrinks.
      const dims = moduleDims(g.cols, g.rows);
      const dw = (dims.w - i.dims.w) / 2;
      const a = (i.rotationDeg * Math.PI) / 180;
      const pos = { x: i.pos.x + dw * Math.cos(a), y: i.pos.y + dw * Math.sin(a) };
      return { ...i, pos, params: { ...(i.params ?? {}), cols: g.cols, rows: g.rows }, dims };
    });
  const stepper = (label: string, value: number, max: number, key: 'cols' | 'rows', unit: string) => (
    <div className="field" key={key}>
      <span className="field-label">{label}</span>
      <div className="stepper">
        <button className="btn" disabled={locked || value <= 1} aria-label={`One fewer ${unit}`} title={`One fewer ${unit}`} onClick={() => set(`Modules ${label.toLowerCase()}`, { [key]: value - 1 })}>
          −
        </button>
        <span className="value" data-testid={`modules-${key}`}>{value}</span>
        <button className="btn" disabled={locked || value >= max} aria-label={`One more ${unit}`} title={`One more ${unit}`} onClick={() => set(`Modules ${label.toLowerCase()}`, { [key]: value + 1 })}>
          +
        </button>
      </div>
    </div>
  );
  return (
    <>
      {stepper('Across', cols, MODULE.maxAcross, 'cols', 'module across')}
      {stepper('Stacked high', rows, MODULE.maxHigh, 'rows', 'module on top')}
      <p className="note">
        {cols * rows} module{cols * rows === 1 ? '' : 's'}, each {MODULE.w / 10} × {MODULE.h / 10} cm and {MODULE.d / 10} cm deep.
      </p>
    </>
  );
}
