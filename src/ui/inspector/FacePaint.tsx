import { useMemo } from 'react';
import type { Level, Wall } from '../../model/types';
import { useStore } from '../../model/store';
import { PaintGrid, finishName } from '../PaintGrid';
import { faceRoomName, setWallFace, wallSideRooms } from '../../model/faces';
import { surfaceColor, wallFaceFinishId, WALL_FINISHES } from '../../view3d/finishes';

/** "Paint: Side facing Reception": one wall face, with the same swatches as the 3D panel. */
export function FacePaint({ level, wall }: { level: Level; wall: Wall }) {
  const editLevel = useStore((s) => s.editLevel);
  const sides = useMemo(() => wallSideRooms(level), [level]);
  const mine = sides.get(wall.id);
  const shown = (['L', 'R'] as const).filter((side) => mine?.[side]);
  const textured = useMemo(() => WALL_FINISHES.filter((f) => f.kind !== 'paint'), []);
  return (
    <div className="field column" data-testid="wall-paint">
      <span className="field-label">Paint</span>
      {shown.length === 0 && <p className="note">This wall does not face a room yet, so there is nothing to paint.</p>}
      {shown.map((side) => {
        const name = faceRoomName(mine, side)!;
        const own = wall.faces?.[side];
        const current = wallFaceFinishId(mine?.[side]?.room, wall, side);
        const color = surfaceColor(current);
        return (
          <details key={side} className="face-paint" data-testid={`face-${side}`}>
            <summary>
              <span className="swatch-dot" style={{ backgroundColor: color }} />
              Side facing {name}
              <span className="muted"> · {own ? finishName(own) : 'room colour'}</span>
            </summary>
            <PaintGrid
              label={`Paint: side facing ${name}`}
              value={own}
              extras={textured}
              onPick={(id) =>
                editLevel(`Paint wall: ${finishName(id)}`, (L) => {
                  const w = L.walls.find((x) => x.id === wall.id);
                  if (w) setWallFace(w, side, id);
                })
              }
            />
            <button
              className="btn small"
              disabled={!own}
              onClick={() =>
                editLevel('Back to the room colour', (L) => {
                  const w = L.walls.find((x) => x.id === wall.id);
                  if (w) setWallFace(w, side, undefined);
                })
              }
            >
              Back to the room colour
            </button>
          </details>
        );
      })}
    </div>
  );
}
