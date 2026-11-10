import { useMemo } from 'react';
import type { Id, Level, Vec2 } from '../model/types';
import { computeJoints } from '../geometry/joints';
import { detectRooms } from '../geometry/rooms';
import { findOpening } from '../geometry/openings';
import { add, mul, perpL } from '../geometry/vec';

/** A small, read-only plan of one floor with one thing highlighted. */
export function MiniPlan({ level, highlight }: { level: Level; highlight: { wallId?: Id; openingId?: Id; point?: Vec2 } }) {
  const geo = useMemo(() => {
    const J = computeJoints(level);
    const rooms = detectRooms(level, J);
    const pts = [...J.outlines.values()].flatMap((o) => o.poly);
    for (const m of level.markers ?? []) pts.push(m.pos);
    if (pts.length === 0) pts.push({ x: -2000, y: -2000 }, { x: 2000, y: 2000 });
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = 400;
    const box = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
    return { J, rooms, box };
  }, [level]);

  const poly = (ps: Vec2[]) => ps.map((p) => `${p.x},${p.y}`).join(' ');
  const opening = highlight.openingId ? findOpening(level, highlight.openingId) : undefined;
  let openingPoly: Vec2[] | null = null;
  if (opening) {
    const o = geo.J.outlines.get(opening.wall.id);
    if (o) {
      const n = perpL(o.dir);
      const h = opening.wall.thickness / 2 + 120;
      const s = add(o.a, mul(o.dir, opening.opening.offset));
      const e = add(o.a, mul(o.dir, opening.opening.offset + opening.opening.width));
      openingPoly = [add(s, mul(n, h)), add(e, mul(n, h)), add(e, mul(n, -h)), add(s, mul(n, -h))];
    }
  }
  const r = Math.max(geo.box.w, geo.box.h) / 40;

  return (
    <svg
      className="sm-plan"
      viewBox={`${geo.box.x} ${geo.box.y} ${geo.box.w} ${geo.box.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Plan of ${level.name}`}
    >
      {geo.rooms.map((rm) => (
        <polygon key={rm.key} points={poly(rm.solid ? rm.centre : rm.inner)} className={rm.solid ? 'sm-solid' : 'sm-room'} />
      ))}
      {geo.J.hubs.map((h) => (
        <polygon key={`hub-${h.nodeId}`} points={poly(h.poly)} className="sm-wall" />
      ))}
      {level.walls.map((w) => {
        const o = geo.J.outlines.get(w.id);
        if (!o) return null;
        return <polygon key={w.id} points={poly(o.poly)} className={w.id === highlight.wallId && !opening ? 'sm-wall on' : 'sm-wall'} />;
      })}
      {openingPoly && <polygon points={poly(openingPoly)} className="sm-opening" />}
      {highlight.point && !highlight.wallId && <circle cx={highlight.point.x} cy={highlight.point.y} r={r} className="sm-pin" />}
      {highlight.point && highlight.wallId && <circle cx={highlight.point.x} cy={highlight.point.y} r={r * 1.6} className="sm-ring" />}
    </svg>
  );
}
