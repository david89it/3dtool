import { useEffect, useMemo, useState } from 'react';
import type { FinishScheme, Level, Project } from '../model/types';
import { useStore } from '../model/store';
import { activeLevels } from '../model/schemes';
import { applyScheme, makeScheme, schemeRoomNames } from '../model/finishSchemes';
import { faceRoomName, setWallFace, wallSideRooms } from '../model/faces';
import { WHITE_PAINT_ID } from '../model/palette';
import { defaultFloorId, defaultWallId, findFinish, FLOOR_FINISHES, leaseHint, wallFaceFinishId, WALL_FINISHES, type Finish } from './finishes';
import { finishName, finishThumb, PaintGrid } from '../ui/PaintGrid';

/** A wall face picked by clicking it in the 3D view. L and R are the left and right of the wall from its first corner to its second. */
export interface FaceSel {
  levelId: string;
  wallId: string;
  side: 'L' | 'R';
}

type Tab = 'floor' | 'walls' | 'ceiling' | 'woodwork';
const TABS: { id: Tab; label: string }[] = [
  { id: 'floor', label: 'Floor' },
  { id: 'walls', label: 'Walls' },
  { id: 'ceiling', label: 'Ceiling' },
  { id: 'woodwork', label: 'Woodwork' },
];

function FloorGrid({ list, value, onPick, label }: { list: Finish[]; value: string; onPick: (id: string) => void; label: string }) {
  return (
    <div className="floor-grid" role="radiogroup" aria-label={label}>
      {list.map((f) => {
        const thumb = finishThumb(f);
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={value === f.id}
            aria-label={f.name}
            className={value === f.id ? 'floor-swatch on' : 'floor-swatch'}
            title={f.name}
            onClick={() => onPick(f.id)}
          >
            <span className="chip-img" style={{ backgroundColor: f.color, backgroundImage: thumb ? `url(${thumb})` : undefined }} />
            <span className="chip-name">{f.name}</span>
          </button>
        );
      })}
    </div>
  );
}

const TEXTURED_WALLS = WALL_FINISHES.filter((f) => f.kind !== 'paint');

export function FinishPanel({
  level,
  roomId,
  onPickRoom,
  face,
  onFace,
}: {
  level: Level;
  roomId: string | null;
  onPickRoom: (id: string) => void;
  face?: FaceSel | null;
  onFace?: (f: FaceSel | null) => void;
}) {
  const editLevel = useStore((s) => s.editLevel);
  const [tab, setTab] = useState<Tab>('floor');
  const room = level.rooms.find((r) => r.id === roomId);
  const sides = useMemo(() => wallSideRooms(level), [level]);

  // Clicking a wall in the view jumps to the Walls tab.
  const faceKey = face ? `${face.levelId}|${face.wallId}|${face.side}` : '';
  useEffect(() => {
    if (faceKey) setTab('walls');
  }, [faceKey]);

  const faceWall = face && face.levelId === level.id ? level.walls.find((w) => w.id === face.wallId) : undefined;
  const faceRoom = faceWall && face ? sides.get(faceWall.id)?.[face.side]?.room : undefined;
  const faceRoomLabel = faceWall && face ? faceRoomName(sides.get(faceWall.id), face.side) : undefined;

  const editRoom = (label: string, fn: (r: Level['rooms'][number]) => void) =>
    editLevel(label, (L) => {
      const r = L.rooms.find((x) => x.id === roomId);
      if (r) fn(r);
    });

  const floorId = room ? (room.floorFinish ?? defaultFloorId(room.name)) : '';
  const wallId = room ? (room.wallFinish ?? defaultWallId(room.name)) : '';
  const floor = findFinish(floorId, FLOOR_FINISHES);
  const hint = room && floor ? leaseHint(room.name, floor) : null;

  const paintFace = (id: string | undefined) => {
    if (!face) return;
    editLevel(id ? `Paint wall: ${finishName(id)}` : 'Back to the room colour', (L) => {
      const w = L.walls.find((x) => x.id === face.wallId);
      if (w) setWallFace(w, face.side, id);
    });
  };

  return (
    <section className="panel-section" aria-label="Finishes">
      <h2>Finishes</h2>
      {level.rooms.length === 0 && <p className="note">No rooms on this floor yet.</p>}
      <div className="room-chips" role="radiogroup" aria-label="Room">
        {level.rooms.map((r) => (
          <button key={r.id} role="radio" aria-checked={r.id === roomId} className={r.id === roomId ? 'chip on' : 'chip'} onClick={() => onPickRoom(r.id)}>
            {r.name}
          </button>
        ))}
      </div>
      {!room && !faceWall && level.rooms.length > 0 && <p className="note">Choose a room above, or click its floor or a wall in the view.</p>}

      {(room || faceWall) && (
        <>
          <div className="tabs" role="tablist" aria-label="What to change">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} id={`finish-tab-${t.id}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}

      {room && tab === 'floor' && (
        <div role="tabpanel" aria-labelledby="finish-tab-floor" className="finish-tab">
          <FloorGrid
            label="Floor finish"
            list={FLOOR_FINISHES}
            value={floorId}
            onPick={(id) => editRoom(`Floor: ${findFinish(id, FLOOR_FINISHES)?.name ?? id}`, (r) => void (r.floorFinish = id))}
          />
          {hint && (
            <p className="badge-amber" data-testid="lease-hint">
              {hint}
            </p>
          )}
        </div>
      )}

      {tab === 'walls' && (room || faceWall) && (
        <div role="tabpanel" aria-labelledby="finish-tab-walls" className="finish-tab">
          {faceWall && face && (
            <div className="face-banner" data-testid="face-banner">
              <strong>This wall face{faceRoomLabel ? `, facing ${faceRoomLabel}` : ''}</strong>
              <span className="note">
                {faceWall.faces?.[face.side] ? `Painted ${finishName(faceWall.faces[face.side])}.` : 'It still has the room colour. Pick a colour to paint just this wall.'}
              </span>
              <div className="actions">
                <button className="btn small" disabled={!faceWall.faces?.[face.side]} onClick={() => paintFace(undefined)}>
                  Back to the room colour
                </button>
                <button className="btn small" onClick={() => onFace?.(null)}>
                  Paint the whole room instead
                </button>
              </div>
            </div>
          )}
          {faceWall && face ? (
            <PaintGrid
              label="Wall face colour"
              value={wallFaceFinishId(faceRoom, faceWall, face.side)}
              extras={TEXTURED_WALLS}
              onPick={(id) => paintFace(id)}
            />
          ) : (
            room && (
              <>
                <PaintGrid
                  label="Wall colour"
                  value={wallId}
                  extras={TEXTURED_WALLS}
                  onPick={(id) => editRoom(`Walls: ${finishName(id)}`, (r) => void (r.wallFinish = id))}
                />
                <p className="note">Click a wall in the view to paint just that wall. A wall between two rooms takes each room's colour on its own side.</p>
              </>
            )
          )}
        </div>
      )}

      {room && tab === 'ceiling' && (
        <div role="tabpanel" aria-labelledby="finish-tab-ceiling" className="finish-tab">
          <PaintGrid
            label="Ceiling colour"
            value={room.ceilingFinish ?? WHITE_PAINT_ID}
            onPick={(id) => editRoom(`Ceiling: ${finishName(id)}`, (r) => void (r.ceilingFinish = id))}
          />
          <button
            className="btn small"
            disabled={!room.ceilingFinish}
            onClick={() => editRoom('Ceiling back to white', (r) => void delete r.ceilingFinish)}
          >
            Back to white
          </button>
        </div>
      )}

      {room && tab === 'woodwork' && (
        <div role="tabpanel" aria-labelledby="finish-tab-woodwork" className="finish-tab">
          <PaintGrid
            label="Woodwork colour"
            value={room.woodworkColor}
            onPick={(id) => editRoom(`Woodwork: ${finishName(id)}`, (r) => void (r.woodworkColor = id))}
          />
          <button
            className="btn small"
            disabled={!room.woodworkColor}
            onClick={() => editRoom('Woodwork back to white', (r) => void delete r.woodworkColor)}
          >
            Back to white
          </button>
          <p className="note">Skirting, door leaves and frames and window frames in this room.</p>
        </div>
      )}

      <Schemes level={level} />
    </section>
  );
}

/** Saved colour schemes: keep a floor's finishes under room names and apply them to any option. */
function Schemes({ level }: { level: Level }) {
  const schemes = useStore((s) => s.project.schemes) ?? [];
  const commit = useStore((s) => s.commit);
  const editLevel = useStore((s) => s.editLevel);
  const toast = useStore((s) => s.toast);
  const [name, setName] = useState('');

  const save = () => {
    const scheme = makeScheme(level, name);
    commit(`Save scheme: ${scheme.name}`, (d) => {
      d.schemes = [...(d.schemes ?? []), scheme];
    });
    setName('');
    toast(`Saved the scheme “${scheme.name}”.`);
  };

  const apply = (scheme: FinishScheme, all: boolean) => {
    const project = useStore.getState().project;
    const targets = all ? activeLevels(project) : [level];
    const matched = targets.reduce((n, L) => n + L.rooms.filter((r) => scheme.rooms[r.name]).length, 0);
    if (matched === 0) {
      toast('No room here has the same name as a room in that scheme.', 'warn');
      return;
    }
    if (all) {
      useStore.getState().commit(`Apply scheme: ${scheme.name}`, (d) => {
        for (const L of activeLevels(d as Project)) applyScheme(L, scheme);
      });
    } else {
      editLevel(`Apply scheme: ${scheme.name}`, (L) => void applyScheme(L, scheme));
    }
    toast(`Applied “${scheme.name}” to ${matched} ${matched === 1 ? 'room' : 'rooms'}.`);
  };

  return (
    <div className="field column" data-testid="schemes">
      <span className="field-label">Schemes</span>
      <p className="note">A scheme remembers every room's floor, wall, ceiling and woodwork finish by room name, so you can try it on another option.</p>
      <div className="paint-hex-row">
        <input
          className="paint-hex-input"
          style={{ width: 'auto', flex: 1 }}
          aria-label="Scheme name"
          placeholder="Name, e.g. Calm and pale"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') save();
          }}
        />
      </div>
      <button className="btn" disabled={level.rooms.length === 0} onClick={save}>
        Save these finishes as a scheme
      </button>
      {schemes.length > 0 && <span className="field-label">Apply scheme…</span>}
      {schemes.map((s) => (
        <div key={s.id} className="scheme-row" data-testid="scheme-row">
          <span className="scheme-name" title={schemeRoomNames(s)}>
            {s.name}
          </span>
          <button className="btn small" onClick={() => apply(s, false)} aria-label={`Apply ${s.name} to this floor`}>
            This floor
          </button>
          <button className="btn small" onClick={() => apply(s, true)} aria-label={`Apply ${s.name} to all floors`}>
            All floors
          </button>
          <button
            className="btn small"
            aria-label={`Delete scheme ${s.name}`}
            onClick={() =>
              useStore.getState().commit(`Delete scheme: ${s.name}`, (d) => {
                d.schemes = (d.schemes ?? []).filter((x) => x.id !== s.id);
              })
            }
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
