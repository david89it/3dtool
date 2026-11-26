// Distance and alignment guides, drawn in screen space (constant size at any zoom).
// While a piece is dragged the labels are drawn here; once it is dropped the labels are
// HTML buttons (GuideLabels in PlanCanvas) so they can be tapped, and only the lines stay.

import { memo } from 'react';
import { Group, Label, Line, Tag, Text } from 'react-konva';
import type { Vec2 } from '../../model/types';
import { formatLength, type UnitSystem } from '../../model/units';
import { toScreen, type View } from '../view';
import { COLORS, FONT } from '../theme';
import type { DistanceGuide, GapStatus, GuideSet } from '../guides';

export const GUIDE_COLORS: Record<GapStatus, string> = { ok: COLORS.accent, low: COLORS.amber, tight: '#dc2626' };
const ALIGN_COLOR = '#c026d3';
const TICK = 6;

/** Where a distance label sits on the plan: the middle of its line, in screen px. */
export function guideLabelScreen(g: DistanceGuide, view: View): Vec2 {
  const a = toScreen(view, g.from);
  const b = toScreen(view, g.to);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function DistanceLine({ g, view, units, label }: { g: DistanceGuide; view: View; units: UnitSystem; label: boolean }) {
  const a = toScreen(view, g.from);
  const b = toScreen(view, g.to);
  const color = GUIDE_COLORS[g.status];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const text = formatLength(g.gap, units);
  const w = text.length * 6.6 + 10;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return (
    <Group>
      <Line points={[a.x, a.y, b.x, b.y]} stroke={color} strokeWidth={1.5} />
      <Line points={[a.x - nx * TICK, a.y - ny * TICK, a.x + nx * TICK, a.y + ny * TICK]} stroke={color} strokeWidth={1.75} />
      <Line points={[b.x - nx * TICK, b.y - ny * TICK, b.x + nx * TICK, b.y + ny * TICK]} stroke={color} strokeWidth={1.75} />
      {label && (
        <Label x={mid.x} y={mid.y} offsetX={w / 2} offsetY={10.5}>
          <Tag fill="#ffffff" opacity={0.95} stroke={color} strokeWidth={1} cornerRadius={4} />
          <Text text={text} fontSize={12} fontStyle="600" fontFamily={FONT} padding={4} fill={color} />
        </Label>
      )}
    </Group>
  );
}

export const GuideShapes = memo(function GuideShapes({ guides, view, units, labels }: { guides: GuideSet; view: View; units: UnitSystem; labels: boolean }) {
  return (
    <Group listening={false}>
      {guides.aligns.map((l, i) => {
        const a = toScreen(view, l.from);
        const b = toScreen(view, l.to);
        return <Line key={`al-${i}`} points={[a.x, a.y, b.x, b.y]} stroke={ALIGN_COLOR} strokeWidth={1.25} dash={[6, 4]} />;
      })}
      {guides.distances.map((g) => (
        <DistanceLine key={g.side} g={g} view={view} units={units} label={labels} />
      ))}
    </Group>
  );
});
