import { useStore } from '../../model/store';
import { formatLength } from '../../model/units';
import type { View } from '../view';
import { guideLabelScreen, GUIDE_COLORS } from '../layers/GuideLayer';
import { moveToGap, type DistanceGuide } from '../guides';
import { EditableLength } from '../../ui/EditableLength';

const SIDE_WORDS = { front: 'in front', back: 'behind', left: 'to the left', right: 'to the right' } as const;

/** A distance label you can tap to type a new gap; the piece moves along that direction. */
export function GuideLabel({ g, view, itemId, itemName }: { g: DistanceGuide; view: View; itemId: string; itemName: string }) {
  const units = useStore((s) => s.units);
  const p = guideLabelScreen(g, view);
  const color = GUIDE_COLORS[g.status];
  const apply = (mm: number) => {
    const st = useStore.getState();
    const lvl = st.project.levels.find((l) => l.id === st.levelId);
    const it = lvl?.items.find((i) => i.id === itemId);
    if (!it) return;
    const to = moveToGap(it, g.side, g.gap, mm);
    st.editLevel(`Move ${itemName} ${formatLength(mm, units)} from ${g.kind === 'wall' ? 'wall' : 'other item'}`, (L) => {
      const i = L.items.find((x) => x.id === itemId);
      if (i) i.pos = to;
    });
  };
  return (
    <div
      className="guide-label"
      data-testid={`guide-${g.side}`}
      data-gap={Math.round(g.gap)}
      style={{ left: p.x, top: p.y, borderColor: color, color }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <EditableLength value={g.gap} onChange={apply} label={`Space ${SIDE_WORDS[g.side]} the ${itemName}`} min={0} max={20000} />
    </div>
  );
}
