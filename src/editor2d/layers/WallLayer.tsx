import { Group, Line } from 'react-konva';
import type { Level, Opening, Vec2, Wall } from '../../model/types';
import type { JointData, WallOutline } from '../../geometry/joints';
import { add, mul, perpL, perpR } from '../../geometry/vec';
import { COLORS } from '../theme';
import type { OpeningGhost } from '../../model/store';
import { makeOpening } from '../../geometry/openings';
import { surfaceColor } from '../../view3d/finishes';

const flat = (pts: Vec2[]) => pts.flatMap((p) => [p.x, p.y]);

function wallColor(w: Wall): string {
  if (w.kind === 'internal' && w.structural === 'loadBearing') return COLORS.wall.party;
  return COLORS.wall[w.kind];
}

/** Rectangle across the full wall thickness between two distances along it. */
function across(o: WallOutline, half: number, s: number, e: number): Vec2[] {
  const n = perpL(o.dir);
  const p = add(o.a, mul(o.dir, s));
  const q = add(o.a, mul(o.dir, e));
  return [add(p, mul(n, half)), add(q, mul(n, half)), add(q, mul(n, -half)), add(p, mul(n, -half))];
}

function OpeningShape({ o, w, op }: { o: WallOutline; w: Wall; op: Opening }) {
  const half = w.thickness / 2;
  const s = op.offset;
  const e = op.offset + op.width;
  const gap = across(o, half + 2, s, e);
  const n = perpL(o.dir);
  const at = (dAlong: number, dAcross: number) => add(add(o.a, mul(o.dir, dAlong)), mul(n, dAcross));
  const parts = [<Line key="gap" points={flat(gap)} closed fill={COLORS.gap} listening={false} />];

  if (op.type === 'window' || op.type === 'bayWindow') {
    parts.push(
      <Line key="frame" points={flat(across(o, half, s, e))} closed stroke={COLORS.label} strokeWidth={1} strokeScaleEnabled={false} listening={false} />,
      <Line key="g1" points={flat([at(s, half * 0.25), at(e, half * 0.25)])} stroke={COLORS.glass} strokeWidth={2} strokeScaleEnabled={false} listening={false} />,
      <Line key="g2" points={flat([at(s, -half * 0.25), at(e, -half * 0.25)])} stroke={COLORS.glass} strokeWidth={2} strokeScaleEnabled={false} listening={false} />,
    );
  } else if (op.type === 'opening') {
    parts.push(
      <Line key="j1" points={flat([at(s, half), at(s, -half)])} stroke={COLORS.label} strokeWidth={1} strokeScaleEnabled={false} listening={false} />,
      <Line key="j2" points={flat([at(e, half), at(e, -half)])} stroke={COLORS.label} strokeWidth={1} strokeScaleEnabled={false} listening={false} />,
      <Line key="d1" points={flat([at(s, half), at(e, half)])} stroke={COLORS.labelMuted} dash={[4, 4]} strokeWidth={1} strokeScaleEnabled={false} listening={false} />,
      <Line key="d2" points={flat([at(s, -half), at(e, -half)])} stroke={COLORS.labelMuted} dash={[4, 4]} strokeWidth={1} strokeScaleEnabled={false} listening={false} />,
    );
  } else if (op.type === 'door') {
    const sw = op.swing ?? { hinge: 'start', side: 'left', angle: 90 };
    const sideN = sw.side === 'left' ? perpL(o.dir) : perpR(o.dir);
    const sign = sw.side === 'left' ? 1 : -1;
    const hingeAlong = sw.hinge === 'start' ? s : e;
    const otherAlong = sw.hinge === 'start' ? e : s;
    const H = at(hingeAlong, sign * half);
    const J = at(otherAlong, sign * half);
    const r = op.width;
    const a0 = Math.atan2(J.y - H.y, J.x - H.x);
    const a1 = Math.atan2(sideN.y, sideN.x);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const sweep = da * Math.min(1, (sw.angle ?? 90) / 90);
    const arc: Vec2[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = a0 + (sweep * i) / 20;
      arc.push({ x: H.x + Math.cos(t) * r, y: H.y + Math.sin(t) * r });
    }
    const leafEnd = arc[arc.length - 1];
    parts.push(
      <Line key="arc" points={flat(arc)} stroke={COLORS.door} strokeWidth={1} dash={[5, 4]} strokeScaleEnabled={false} listening={false} />,
      <Line key="leaf" points={flat([H, leafEnd])} stroke={COLORS.door} strokeWidth={2.5} strokeScaleEnabled={false} listening={false} />,
    );
  }
  return <Group listening={false}>{parts}</Group>;
}

export function WallShapes({
  level,
  joints,
  selectedWallId,
  hoverWallId,
  selectedOpeningId,
  hoverOpeningId,
  ghost,
}: {
  level: Level;
  joints: JointData;
  selectedWallId?: string;
  hoverWallId?: string;
  selectedOpeningId?: string;
  hoverOpeningId?: string;
  ghost?: OpeningGhost | null;
}) {
  const byId = new Map(level.walls.map((w) => [w.id, w] as const));
  return (
    <>
      {joints.hubs.map((h) => {
        const ws = h.wallIds.map((id) => byId.get(id)).filter((w): w is Wall => !!w);
        const thickest = ws.reduce((a, b) => (b.thickness > a.thickness ? b : a), ws[0]);
        if (!thickest) return null;
        const c = wallColor(thickest);
        return <Line key={`hub-${h.nodeId}`} points={flat(h.poly)} closed fill={c} stroke={c} strokeWidth={0.75} strokeScaleEnabled={false} listening={false} />;
      })}
      {level.walls.map((w) => {
        const o = joints.outlines.get(w.id);
        if (!o) return null;
        const selected = w.id === selectedWallId;
        return (
          <Line
            key={w.id}
            points={flat(o.poly)}
            closed
            fill={selected ? COLORS.wallSelected : wallColor(w)}
            stroke={selected ? COLORS.wallSelected : w.id === hoverWallId ? COLORS.wallHover : wallColor(w)}
            strokeWidth={!selected && w.id === hoverWallId ? 3 : 0.75}
            strokeScaleEnabled={false}
            listening={false}
          />
        );
      })}
      {/* A thin coloured line along each painted wall face, so feature walls show on the plan. */}
      {level.walls.map((w) => {
        const o = joints.outlines.get(w.id);
        if (!o || !w.faces) return null;
        return (['L', 'R'] as const).map((side) => {
          const color = surfaceColor(w.faces?.[side]);
          if (!color) return null;
          const pts = flat(side === 'L' ? [o.aL, o.bL] : [o.aR, o.bR]);
          return (
            <Group key={`${w.id}-face-${side}`} listening={false}>
              <Line points={pts} stroke="rgba(0,0,0,0.35)" strokeWidth={4.5} lineCap="butt" strokeScaleEnabled={false} listening={false} />
              <Line points={pts} stroke={color} strokeWidth={3} lineCap="butt" strokeScaleEnabled={false} listening={false} />
            </Group>
          );
        });
      })}
      {level.walls.map((w) => {
        const o = joints.outlines.get(w.id);
        if (!o) return null;
        return w.openings.map((op) => <OpeningShape key={op.id} o={o} w={w} op={op} />);
      })}
      {level.walls.map((w) => {
        const o = joints.outlines.get(w.id);
        if (!o) return null;
        return w.openings
          .filter((op) => op.id === selectedOpeningId || op.id === hoverOpeningId)
          .map((op) => (
            <Line
              key={`hl-${op.id}`}
              points={flat(across(o, w.thickness / 2 + 25, op.offset, op.offset + op.width))}
              closed
              stroke={COLORS.accent}
              strokeWidth={op.id === selectedOpeningId ? 3 : 2}
              dash={op.id === selectedOpeningId ? undefined : [6, 4]}
              fill={op.id === selectedOpeningId ? 'rgba(37,99,235,0.12)' : undefined}
              strokeScaleEnabled={false}
              listening={false}
            />
          ));
      })}
      {ghost?.ok &&
        (() => {
          const w = level.walls.find((x) => x.id === ghost.wallId);
          const o = joints.outlines.get(ghost.wallId);
          if (!w || !o) return null;
          const op = { ...makeOpening(ghost.type, ghost.offset, ghost.width), id: 'ghost' };
          return (
            <Group opacity={0.85} listening={false}>
              <OpeningShape o={o} w={w} op={op} />
              <Line
                points={flat(across(o, w.thickness / 2 + 25, ghost.offset, ghost.offset + ghost.width))}
                closed
                stroke={COLORS.accent}
                strokeWidth={2}
                dash={[6, 4]}
                fill="rgba(37,99,235,0.18)"
                strokeScaleEnabled={false}
              />
            </Group>
          );
        })()}
    </>
  );
}
