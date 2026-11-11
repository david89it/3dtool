// Draw one floor on its own, off screen, for the print pack. It uses the same
// Konva layers as the editor (rooms, walls, openings, the overlay with room
// names, wall lengths, notes and structural pins) but with no selection and
// no hover, and adds a scale bar. Works whatever mode the app is in.

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import type { Level, Project, Vec2 } from '../model/types';
import { useStore } from '../model/store';
import { computeJoints } from '../geometry/joints';
import { detectRooms } from '../geometry/rooms';
import { wallDimensions } from '../geometry/dimensions';
import { fitView, type View } from './view';
import { RoomFills } from './layers/RoomLayer';
import { WallShapes } from './layers/WallLayer';
import { StairShapes } from './layers/StairLayer';
import { OverlayLayer } from './layers/OverlayLayer';
import { openingLabels, type OpeningLabel } from './openingLabels';
import { COLORS, FONT } from './theme';

export interface RenderOptions {
  /** Logical size in pixels. Text and pins are drawn at their normal on-screen size. */
  width: number;
  height: number;
  /** Extra sharpness for print. Default 2. */
  pixelRatio?: number;
  /**
   * Walls that were taken out (compared with an earlier version), as outline
   * polygons in plan mm. Drawn as dashed red outlines over the plan.
   */
  ghostWalls?: Vec2[][];
}

/** A floor with nothing but its walls, notes and stairs in view (no photo, no "measure me" pins). */
function printable(level: Level): Level {
  return { ...level, markers: [], underlay: undefined, vectorUnderlay: undefined };
}

export function hasPrintableWalls(level: Level): boolean {
  return level.walls.length > 0;
}

function ScaleBar({ view, height }: { view: View; height: number }) {
  const x = 24;
  const y = height - 26;
  const bar = (metres: number, row: number) => {
    const len = metres * 1000 * view.scale;
    const yy = y - row * 22;
    const parts = [];
    for (let i = 0; i < metres; i++) {
      parts.push(
        <Rect key={i} x={x + i * 1000 * view.scale} y={yy} width={1000 * view.scale} height={6} fill={i % 2 === 0 ? '#1f2328' : '#ffffff'} stroke="#1f2328" strokeWidth={1} />,
      );
    }
    return (
      <Group key={metres}>
        {parts}
        <Text x={x + len + 8} y={yy - 3} text={`${metres} m`} fontSize={12} fontStyle="600" fontFamily={FONT} fill={COLORS.label} />
      </Group>
    );
  };
  return (
    <Group listening={false}>
      <Rect x={x - 10} y={y - 38} width={5 * 1000 * view.scale + 70} height={62} fill="#ffffff" opacity={0.85} cornerRadius={4} />
      {bar(5, 0)}
      {bar(1, 1)}
    </Group>
  );
}

function PrintScene({
  level,
  project,
  width,
  height,
  onStage,
  ghostWalls,
}: {
  ghostWalls?: Vec2[][];
  level: Level;
  project: Project;
  width: number;
  height: number;
  onStage: (s: Konva.Stage | null) => void;
}) {
  const view = fitView(level, width, height);
  const joints = computeJoints(level);
  const rooms = detectRooms(level, joints);
  const dims = wallDimensions(level, joints, rooms);
  // The width of every opening she has added, so the engineer reads sizes off the plan.
  const labels: OpeningLabel[] = [];
  for (const w of level.walls) {
    for (const o of w.openings) {
      if (o.existing) continue;
      const l = openingLabels(level, joints, dims, view, o.id).find((x) => x.field === 'width');
      if (l) labels.push({ ...l, field: 'width' });
    }
  }
  return (
    <Stage width={width} height={height} ref={onStage} listening={false}>
      <Layer listening={false}>
        <Rect x={0} y={0} width={width} height={height} fill="#ffffff" />
        <Group x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}>
          <RoomFills level={level} rooms={rooms} translucent={false} />
          <WallShapes level={level} joints={joints} ghost={null} />
          <StairShapes stairs={level.stairs} project={project} />
          {(ghostWalls ?? []).map((pts, i) => (
            <Line
              key={i}
              points={pts.flatMap((p) => [p.x, p.y])}
              closed
              stroke="#d92d20"
              strokeWidth={3 / view.scale}
              dash={[10 / view.scale, 6 / view.scale]}
              fill="rgba(217,45,32,0.08)"
              listening={false}
            />
          ))}
        </Group>
      </Layer>
      <Layer listening={false}>
        <OverlayLayer
          level={level}
          view={view}
          rooms={rooms}
          dims={dims}
          units={useStore.getState().units}
          selection={null}
          overlay={{}}
          showMarkers={false}
          showDims
          openingLabels={labels}
          ghost={null}
          minLabelPx={22}
        />
        <ScaleBar view={view} height={height} />
      </Layer>
    </Stage>
  );
}

/** One floor as a PNG data URL, or null when the floor has no walls. */
export async function renderLevelImage(levelId: string, opts: RenderOptions): Promise<string | null> {
  // Leave whatever React is doing (this is called from effects) before rendering synchronously.
  await new Promise((r) => setTimeout(r, 0));
  const project = useStore.getState().project;
  const found = project.levels.find((l) => l.id === levelId);
  if (!found || !hasPrintableWalls(found)) return null;
  const level = printable(found);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
  document.body.appendChild(host);
  const root = createRoot(host);
  let stage: Konva.Stage | null = null;
  try {
    flushSync(() => {
      root.render(
        <PrintScene level={level} project={project} width={opts.width} height={opts.height} onStage={(s) => void (stage = s)} ghostWalls={opts.ghostWalls} />,
      );
    });
    const st = stage as Konva.Stage | null;
    if (!st) return null;
    st.draw();
    return st.toDataURL({ pixelRatio: opts.pixelRatio ?? 2, mimeType: 'image/png' });
  } finally {
    root.unmount();
    host.remove();
  }
}
