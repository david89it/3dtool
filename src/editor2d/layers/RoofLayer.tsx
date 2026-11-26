import { memo, useMemo } from 'react';
import { Line, Shape, Text } from 'react-konva';
import type { Level, Vec2 } from '../../model/types';
import type { DetectedRoom } from '../../geometry/rooms';
import { contourSegments, lowPolygons, slopeZones } from '../../geometry/roof';
import { FONT } from '../theme';

/** Konva node names, so tests (and the print image) can find the roof marks. */
export const ROOF_LINE = 'roof-line';
export const ROOF_HATCH = 'roof-hatch';

const HATCH = 'rgba(180, 83, 9, 0.4)';
const LINE = '#b45309';

function hatch(ctx: { _context: CanvasRenderingContext2D }, poly: Vec2[], step: number, width: number) {
  const c = ctx._context;
  c.save();
  c.beginPath();
  poly.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)));
  c.closePath();
  c.clip();
  c.strokeStyle = HATCH;
  c.lineWidth = width;
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  c.beginPath();
  // Lines running down-left: x + y = k.
  for (let k = minX + minY; k <= maxX + maxY; k += step) {
    c.moveTo(k - minY, minY);
    c.lineTo(k - maxY, maxY);
  }
  c.stroke();
  c.restore();
}

/**
 * Sloped ceilings in the plan: light diagonal hatching on the floor where the ceiling is lower
 * than 1.5 m (the UK "usable floor area" rule), and a dashed line where it is exactly 1.5 m.
 */
function RoofShapesImpl({ level, rooms, scale }: { level: Level; rooms: DetectedRoom[]; scale: number }) {
  const zones = useMemo(() => (level.rooms.some((r) => r.slopes?.length) ? slopeZones(level, rooms) : []), [level, rooms]);
  if (zones.length === 0) return null;
  const px = 1 / scale;
  return (
    <>
      {zones.map((z) => (
        <RoofZone key={z.roomId} zone={z} px={px} />
      ))}
    </>
  );
}

function RoofZone({ zone, px }: { zone: ReturnType<typeof slopeZones>[number]; px: number }) {
  const lows = lowPolygons(zone.poly, zone.flat, zone.slopes);
  const lines = contourSegments(zone.poly, zone.flat, zone.slopes);
  return (
    <>
      {lows.map((poly, i) => (
        <Shape
          key={`h${i}`}
          name={ROOF_HATCH}
          listening={false}
          sceneFunc={(ctx) => hatch(ctx as unknown as { _context: CanvasRenderingContext2D }, poly, 9 * px, 1 * px)}
        />
      ))}
      {lines.map(([p, q], i) => (
        <Line
          key={`l${i}`}
          name={ROOF_LINE}
          points={[p.x, p.y, q.x, q.y]}
          stroke={LINE}
          strokeWidth={2 * px}
          dash={[10 * px, 6 * px]}
          listening={false}
        />
      ))}
      {lines.slice(0, 1).map(([p, q]) => (
        <Text
          key="t"
          x={(p.x + q.x) / 2 + 40 * px}
          y={(p.y + q.y) / 2 - 16 * px}
          text="1.5 m high"
          fontSize={12 * px}
          fontFamily={FONT}
          fill={LINE}
          listening={false}
        />
      ))}
    </>
  );
}

export const RoofShapes = memo(RoofShapesImpl, (a, b) => a.level.rooms === b.level.rooms && a.level.walls === b.level.walls && a.level.nodes === b.level.nodes && a.level.ceilingHeight === b.level.ceilingHeight && a.rooms === b.rooms && a.scale === b.scale);
