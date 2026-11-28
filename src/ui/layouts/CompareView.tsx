import { useEffect, useRef, useState } from 'react';
import { Group, Layer, Rect, Stage } from 'react-konva';
import type { Level, Project } from '../../model/types';
import { useStore } from '../../model/store';
import { groupOf, optionsOf } from '../../model/schemes';
import { layoutName } from '../../model/layouts';
import { computeJoints } from '../../geometry/joints';
import { detectRooms } from '../../geometry/rooms';
import { fitView } from '../../editor2d/view';
import { COLORS } from '../../editor2d/theme';
import { RoomFills } from '../../editor2d/layers/RoomLayer';
import { WallShapes } from '../../editor2d/layers/WallLayer';
import { StairShapes } from '../../editor2d/layers/StairLayer';
import { ItemShapes } from '../../editor2d/layers/ItemLayer';
import { useCompare } from './compareState';
import { showLayout } from './layoutActions';

const NO_IDS: string[] = [];

/** One layout drawn small and read-only. */
function Thumb({ level, project, width, height }: { level: Level; project: Project; width: number; height: number }) {
  const view = fitView(level, width, height);
  const joints = computeJoints(level);
  const rooms = detectRooms(level, joints);
  return (
    <Stage width={width} height={height} listening={false}>
      <Layer listening={false}>
        <Rect x={0} y={0} width={width} height={height} fill={COLORS.paper} />
        <Group x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}>
          <RoomFills level={level} rooms={rooms} translucent={false} />
          <ItemShapes level={level} project={project} selectedIds={NO_IDS} showClearances={false} showAllClearances={false} ghost={null} />
          <WallShapes level={level} joints={joints} />
          <StairShapes stairs={level.stairs} project={project} />
        </Group>
      </Layer>
    </Stage>
  );
}

function Pane({ side, level, project, options }: { side: 'left' | 'right'; level: Level; project: Project; options: Level[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const set = side === 'left' ? useCompare.getState().setLeft : useCompare.getState().setRight;
  return (
    <section className="compare-pane" data-testid={`compare-${side}`}>
      <header>
        <select aria-label={`${side === 'left' ? 'Left' : 'Right'} layout`} value={level.id} onChange={(e) => set(e.target.value)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {layoutName(o)}
            </option>
          ))}
        </select>
        <span className="note">{level.items.length} {level.items.length === 1 ? 'piece' : 'pieces'}</span>
        <button
          className="btn"
          onClick={() => {
            showLayout(level.id);
            useCompare.getState().close();
          }}
        >
          Use this one
        </button>
      </header>
      <div className="compare-plan" ref={ref}>
        {size.w > 0 && size.h > 0 && <Thumb level={level} project={project} width={size.w} height={size.h} />}
      </div>
    </section>
  );
}

/** Two layouts of the floor she is on, side by side, over the plan. */
export function CompareView() {
  const { open, left, right } = useCompare();
  const project = useStore((s) => s.project);
  const levelId = useStore((s) => s.levelId);
  const current = project.levels.find((l) => l.id === levelId);
  const options = current ? optionsOf(project, groupOf(current)) : [];
  const a = options.find((o) => o.id === left);
  const b = options.find((o) => o.id === right);
  const bad = open && (options.length < 2 || !a || !b);
  useEffect(() => {
    if (bad) useCompare.getState().close();
  }, [bad]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useCompare.getState().close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open || !a || !b) return null;
  return (
    <div className="compare-view" role="dialog" aria-label="Compare layouts" data-testid="compare-view" onPointerDown={(e) => e.stopPropagation()}>
      <div className="compare-bar">
        <strong>Compare layouts of {current?.name}</strong>
        <button className="btn" onClick={() => useCompare.getState().close()}>
          Done
        </button>
      </div>
      <div className="compare-panes">
        <Pane side="left" level={a} project={project} options={options} />
        <Pane side="right" level={b} project={project} options={options} />
      </div>
    </div>
  );
}
