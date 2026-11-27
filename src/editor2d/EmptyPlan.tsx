// What the plan says when the floor has no walls yet: one clear next step for the mode she is in.

import { useStore } from '../model/store';
import { useLayout } from '../ui/layoutState';
import type { Level } from '../model/types';

function startDrawing() {
  const s = useStore.getState();
  if (s.mode !== 'trace') s.setMode('trace');
  s.setTool('draw');
}

function importImage() {
  const s = useStore.getState();
  if (s.mode !== 'trace') s.setMode('trace');
  useLayout.getState().setOpen('left', true);
  setTimeout(() => document.querySelector<HTMLElement>('[data-action="import-plan"]')?.click(), 120);
}

export function EmptyPlan({ level }: { level: Level }) {
  const mode = useStore((s) => s.mode);
  const trace = mode === 'trace';
  const title = trace ? 'Start by drawing the walls' : mode === 'openings' ? 'Doors and windows go on walls' : 'Furniture goes inside rooms';
  const body = trace
    ? 'Click to put down each corner of a room. Or trace over a picture of the floorplan.'
    : 'This floor has no walls yet. Draw them first, then come back here.';
  return (
    <div className="canvas-empty" data-testid="empty-plan">
      <p className="canvas-empty-title">{title}</p>
      {(level.markers ?? []).length > 0 && <p>{level.markers![0].text}</p>}
      <p>{body}</p>
      <div className="canvas-empty-actions" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn primary" onClick={startDrawing} title="Start drawing walls on the plan">
          {trace ? 'Draw walls' : 'Go and draw walls'}
        </button>
        {trace && (
          <button className="btn" onClick={importImage} title="Choose a picture or PDF of the floorplan to trace over">
            Use a floorplan picture
          </button>
        )}
      </div>
    </div>
  );
}
