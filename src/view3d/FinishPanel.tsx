import { useMemo } from 'react';
import type { Level } from '../model/types';
import { useStore } from '../model/store';
import { defaultFloorId, defaultWallId, drawFinish, findFinish, FLOOR_FINISHES, leaseHint, WALL_FINISHES, type Finish } from './finishes';

/** Small preview images of every swatch, drawn once. */
function useThumbs(): Map<string, string> {
  return useMemo(() => {
    const m = new Map<string, string>();
    if (typeof document === 'undefined') return m;
    for (const f of [...FLOOR_FINISHES, ...WALL_FINISHES]) {
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 96;
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      drawFinish(ctx, f, 96);
      m.set(f.id, c.toDataURL());
    }
    return m;
  }, []);
}

function Swatches({
  list,
  value,
  onPick,
  label,
  thumbs,
}: {
  list: Finish[];
  value: string;
  onPick: (id: string) => void;
  label: string;
  thumbs: Map<string, string>;
}) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {list.map((f) => (
        <button
          key={f.id}
          role="radio"
          aria-checked={value === f.id}
          className={value === f.id ? 'swatch on' : 'swatch'}
          title={f.name}
          onClick={() => onPick(f.id)}
        >
          <span className="swatch-chip" style={{ backgroundColor: f.color, backgroundImage: thumbs.get(f.id) ? `url(${thumbs.get(f.id)})` : undefined }} />
          <span className="swatch-name">{f.name}</span>
        </button>
      ))}
    </div>
  );
}

export function FinishPanel({ level, roomId, onPickRoom }: { level: Level; roomId: string | null; onPickRoom: (id: string) => void }) {
  const editLevel = useStore((s) => s.editLevel);
  const thumbs = useThumbs();
  const room = level.rooms.find((r) => r.id === roomId);
  const floorId = room ? (room.floorFinish ?? defaultFloorId(room.name)) : '';
  const wallId = room ? (room.wallFinish ?? defaultWallId(room.name)) : '';
  const floor = findFinish(floorId, FLOOR_FINISHES);
  const hint = room && floor ? leaseHint(room.name, floor) : null;

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
      {!room && level.rooms.length > 0 && <p className="note">Choose a room above, or click its floor in the view.</p>}
      {room && (
        <>
          <span className="field-label">Floor</span>
          <Swatches
            label="Floor finish"
            list={FLOOR_FINISHES}
            value={floorId}
            thumbs={thumbs}
            onPick={(id) =>
              editLevel(`Floor: ${findFinish(id, FLOOR_FINISHES)?.name ?? id}`, (L) => {
                const r = L.rooms.find((x) => x.id === room.id);
                if (r) r.floorFinish = id;
              })
            }
          />
          {hint && <p className="badge-amber" data-testid="lease-hint">{hint}</p>}
          <span className="field-label">Walls</span>
          <Swatches
            label="Wall finish"
            list={WALL_FINISHES}
            value={wallId}
            thumbs={thumbs}
            onPick={(id) =>
              editLevel(`Walls: ${findFinish(id, WALL_FINISHES)?.name ?? id}`, (L) => {
                const r = L.rooms.find((x) => x.id === room.id);
                if (r) r.wallFinish = id;
              })
            }
          />
          <p className="note">A wall between two rooms takes each room's finish on its own side.</p>
        </>
      )}
    </section>
  );
}
