import { useMemo } from 'react';
import type { Level, Wall, WallKind, Structural } from '../../model/types';
import { useStore } from '../../model/store';
import { detectRooms } from '../../geometry/rooms';
import { computeJoints } from '../../geometry/joints';
import { measureWallFace, setInternalLength, wallDimensions } from '../../geometry/dimensions';
import { DEFAULT_THICKNESS, splitWall, wallEnds } from '../../geometry/wallGraph';
import { lerp } from '../../geometry/vec';
import { EditableLength } from '../EditableLength';
import { needsStructuralBadge, OPENING_LABEL, STRUCTURAL_BADGE_TEXT } from '../../geometry/openings';
import { deleteWallAction, openUpWallAction } from '../../editor2d/contextActions';
import { formatLength } from '../../model/units';
import { KIND_LABEL, STRUCT_LABEL, Segmented } from './shared';
import { FacePaint } from './FacePaint';

export function WallPanel({ level, wall }: { level: Level; wall: Wall }) {
  const editLevel = useStore((s) => s.editLevel);
  const select = useStore((s) => s.select);
  const units = useStore((s) => s.units);
  const face = useMemo(() => {
    const J = computeJoints(level);
    return wallDimensions(level, J, detectRooms(level, J)).find((d) => d.wallId === wall.id)?.length ?? 0;
  }, [level, wall.id]);

  const edit = (label: string, fn: (w: Wall, L: Level) => void) =>
    editLevel(label, (L) => {
      const w = L.walls.find((x) => x.id === wall.id);
      if (w) fn(w as Wall, L as Level);
    });


  return (
    <div className="panel-section" data-testid="wall-panel">
      <h2>Wall</h2>
      <div className="field">
        <span className="field-label">Length (inside)</span>
        <EditableLength
          label="Wall length"
          value={face}
          estimated={wall.estimated}
          min={50}
          onChange={(mm) =>
            editLevel('Set wall length', (L) => setInternalLength(L as Level, wall.id, mm, (lv) => measureWallFace(lv, wall.id)))
          }
        />
      </div>
      <div className="field">
        <span className="field-label">Thickness</span>
        <EditableLength
          label="Wall thickness"
          ctx="small"
          value={wall.thickness}
          estimated={wall.estimated}
          min={30}
          max={1000}
          onChange={(mm) =>
            edit('Set wall thickness', (w) => {
              w.thickness = Math.round(mm);
              w.estimated = false;
            })
          }
        />
      </div>
      <FacePaint level={level} wall={wall} />
      <div className="field column">
        <span className="field-label">What kind of wall?</span>
        <Segmented<WallKind>
          label="Kind of wall"
          value={wall.kind}
          options={(['internal', 'external', 'party'] as WallKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          onChange={(k) =>
            edit('Change wall type', (w) => {
              if (w.estimated || w.thickness === DEFAULT_THICKNESS[w.kind]) w.thickness = DEFAULT_THICKNESS[k];
              w.kind = k;
            })
          }
        />
      </div>
      <div className="field column">
        <span className="field-label">Does it hold the building up?</span>
        <Segmented<Structural>
          label="Load-bearing"
          value={wall.structural}
          options={(['unknown', 'loadBearing', 'nonLoadBearing'] as Structural[]).map((k) => ({
            value: k,
            label: STRUCT_LABEL[k],
          }))}
          onChange={(k) => edit('Change load-bearing note', (w) => void (w.structural = k))}
        />
        <p className="note">
          Only a structural engineer can confirm this. Until then, treat “Don’t know” as load-bearing.
        </p>
      </div>
      {needsStructuralBadge(wall) && (
        <p className="badge-amber" data-testid="structural-badge">
          ⚠ {STRUCTURAL_BADGE_TEXT}
        </p>
      )}
      <div className="field column">
        <span className="field-label">Doors, windows and openings</span>
        {wall.openings.length === 0 && <p className="note">None yet.</p>}
        <ul className="opening-list">
          {wall.openings.map((o) => (
            <li key={o.id}>
              <button className="list-btn" onClick={() => select({ kind: 'opening', id: o.id })}>
                <span>{OPENING_LABEL[o.type]}</span>
                <span className="muted">{formatLength(o.width, units)} wide</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          className="btn"
          onClick={() => openUpWallAction(wall.id)}
        >
          Open up this wall
        </button>
        <p className="note">Adds the widest opening this wall allows. You can then change its width.</p>
      </div>
      {wall.estimated && (
        <div className="estimate-box">
          <p>≈ Estimated from the agent's plan, which is not to scale.</p>
          <button className="btn small" onClick={() => edit('Confirm measurements', (w) => void (w.estimated = false))}>
            I've measured this wall
          </button>
        </div>
      )}
      <div className="actions">
        <button title="Split this wall into two walls where you click next"
          className="btn"
          onClick={() => {
            const [a, b] = wallEnds(level, wall);
            editLevel('Split wall', (L) => void splitWall(L as Level, wall.id, lerp(a, b, 0.5)));
          }}
        >
          Split in two
        </button>
        <button title="Delete this wall (Delete)"
          className="btn danger"
          onClick={() => deleteWallAction(wall.id)}
        >
          Delete wall
        </button>
      </div>
    </div>
  );
}
