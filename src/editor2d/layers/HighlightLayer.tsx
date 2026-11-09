// Outlines the furniture and walls an advice issue is about.

import { Line } from 'react-konva';
import type { Level, Project, Vec2 } from '../../model/types';
import type { Highlight } from '../../model/store';
import type { JointData } from '../../geometry/joints';
import { findCatalogueItem, footprint } from '../../catalogue/catalogue';

const flat = (pts: Vec2[]) => pts.flatMap((p) => [p.x, p.y]);
export const HIGHLIGHT_COLOR = '#e11d48';

export function HighlightShapes({
  level,
  project,
  joints,
  highlight,
}: {
  level: Level;
  project: Project;
  joints: JointData;
  highlight: Highlight | null;
}) {
  if (!highlight) return null;
  const shapes = [];
  for (const id of highlight.itemIds) {
    const it = level.items.find((x) => x.id === id);
    const cat = it && findCatalogueItem(project, it.catalogueId);
    if (!it || !cat) continue;
    shapes.push(
      <Line
        key={`hi-${id}`}
        points={flat(footprint(it, cat))}
        closed
        stroke={HIGHLIGHT_COLOR}
        strokeWidth={4}
        fill="rgba(225,29,72,0.14)"
        strokeScaleEnabled={false}
        listening={false}
      />,
    );
  }
  for (const id of highlight.wallIds) {
    const o = joints.outlines.get(id);
    if (!o) continue;
    shapes.push(
      <Line key={`hw-${id}`} points={flat(o.poly)} closed stroke={HIGHLIGHT_COLOR} strokeWidth={4} strokeScaleEnabled={false} listening={false} />,
    );
  }
  return <>{shapes}</>;
}

/** Every plan point the highlight covers (for zooming to it). */
export function highlightPoints(level: Level, project: Project, joints: JointData, h: Highlight): Vec2[] {
  const pts: Vec2[] = [];
  for (const id of h.itemIds) {
    const it = level.items.find((x) => x.id === id);
    const cat = it && findCatalogueItem(project, it.catalogueId);
    if (it && cat) pts.push(...footprint(it, cat));
  }
  for (const id of h.wallIds) {
    const o = joints.outlines.get(id);
    if (o) pts.push(...o.poly);
  }
  return pts;
}
