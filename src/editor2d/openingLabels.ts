// Where the width and end-gap measurements of the selected opening go.

import type { Id, Level, Vec2 } from '../model/types';
import type { JointData } from '../geometry/joints';
import type { WallDimension } from '../geometry/dimensions';
import { endDistances, findOpening, usableRange } from '../geometry/openings';
import type { OpeningField } from '../geometry/openingEdits';
import { add, dist, mul, perpL } from '../geometry/vec';
import { toScreen, type View } from './view';

export interface OpeningLabel {
  field: Extract<OpeningField, 'width' | 'before' | 'after'>;
  value: number;
  screen: Vec2;
  angleDeg: number;
}

export function openingLabels(
  level: Level,
  J: JointData,
  dims: WallDimension[],
  view: View,
  openingId: Id,
): OpeningLabel[] {
  const found = findOpening(level, openingId);
  if (!found) return [];
  const { wall, opening } = found;
  const o = J.outlines.get(wall.id);
  const range = usableRange(J, wall.id);
  if (!o || !range) return [];
  const dim = dims.find((d) => d.wallId === wall.id);
  const normal = dim?.normal ?? perpL(o.dir);
  const angleDeg = dim?.angleDeg ?? (Math.atan2(o.dir.y, o.dir.x) * 180) / Math.PI;
  const at = (s: number, px: number): Vec2 => {
    const w = add(add(o.a, mul(o.dir, s)), mul(normal, wall.thickness / 2));
    const sc = toScreen(view, w);
    return { x: sc.x + normal.x * px, y: sc.y + normal.y * px };
  };
  const d = endDistances(range, opening);
  const out: OpeningLabel[] = [
    { field: 'width', value: opening.width, screen: at(opening.offset + opening.width / 2, 16), angleDeg },
  ];
  // End gaps sit a row further out so they never cover the wall's own length label.
  if (d.before > 1) out.push({ field: 'before', value: d.before, screen: at(range.start + d.before / 2, 42), angleDeg });
  if (d.after > 1) out.push({ field: 'after', value: d.after, screen: at(opening.offset + opening.width + d.after / 2, 42), angleDeg });
  return out;
}

export function hitOpeningLabel(labels: OpeningLabel[], screen: Vec2): OpeningLabel | undefined {
  return labels.find((l) => dist(l.screen, screen) <= 20);
}
