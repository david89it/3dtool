import type { Level, PlacedItem } from '../../model/types';
import { useStore } from '../../model/store';
import { SURROUND, surroundLayout } from '../../catalogue/builders';
import { computeJoints } from '../../geometry/joints';
import { detectRooms } from '../../geometry/rooms';
import { ceilingAt, fitSurround, snapToOpening } from '../../editor2d/itemOps';
import { formatLength } from '../../model/units';
import { EditableLength } from '../EditableLength';
import { Change } from './shared';

/** Sizes for a bookcase surround: the opening it frames, the towers either side, depth and height. */
export function SurroundFields({ level, item, change, locked }: { level: Level; item: PlacedItem; change: Change; locked: boolean }) {
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
      <button title="Resize it to fit the nearest door or opening"
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
