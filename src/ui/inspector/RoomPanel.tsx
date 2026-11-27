import { useMemo } from 'react';
import type { Level } from '../../model/types';
import { useStore } from '../../model/store';
import { detectRooms, matchDetected } from '../../geometry/rooms';
import { formatArea } from '../../model/units';
import { EditableLength } from '../EditableLength';
import { frameRoom, walkIntoRoom } from '../roomViews';
import { TextField } from './shared';
import { SlopeSection } from './SlopeSection';

export function RoomPanel({ level, roomId }: { level: Level; roomId: string }) {
  const editLevel = useStore((s) => s.editLevel);
  const units = useStore((s) => s.units);
  const room = level.rooms.find((r) => r.id === roomId);
  const detected = useMemo(() => (room ? matchDetected(room, detectRooms(level)) : undefined), [level, room]);
  if (!room) return null;
  return (
    <div className="panel-section" data-testid="room-panel">
      <h2>Room</h2>
      <div className="field column">
        <span className="field-label">Name</span>
        <TextField
          label="Room name"
          value={room.name}
          onCommit={(v) =>
            editLevel('Rename room', (L) => {
              const r = L.rooms.find((x) => x.id === roomId);
              if (r) r.name = v;
            })
          }
        />
      </div>
      <div className="field">
        <span className="field-label">Floor area</span>
        <span className="value">{detected ? formatArea(detected.area, units) : '–'}</span>
      </div>
      <div className="field">
        <span className="field-label">Ceiling height</span>
        <EditableLength
          label="Room ceiling height"
          value={room.ceilingHeight ?? level.ceilingHeight}
          estimated={room.ceilingHeight === undefined && level.estimated}
          min={1500}
          max={6000}
          onChange={(mm) =>
            editLevel('Set ceiling height', (L) => {
              const r = L.rooms.find((x) => x.id === roomId);
              if (r) r.ceilingHeight = Math.round(mm);
            })
          }
        />
      </div>
      {room.ceilingHeight !== undefined && (
        <button
          className="btn small"
          onClick={() =>
            editLevel('Reset ceiling height', (L) => {
              const r = L.rooms.find((x) => x.id === roomId);
              if (r) delete r.ceilingHeight;
            })
          }
        >
          Use the floor's ceiling height
        </button>
      )}
      {detected && <SlopeSection level={level} room={room} detected={detected} />}
      {detected && (
        <div className="actions">
          <button className="btn" onClick={() => frameRoom(level, detected)}>
            Frame this room
          </button>
          <button title="Look around this room in 3D" className="btn" onClick={() => walkIntoRoom(level, detected, () => useStore.getState().setMode('3d'))}>
            Walk in here
          </button>
        </div>
      )}
      <p className="note">Rooms are found from closed loops of walls. Move or delete walls to change them.</p>
    </div>
  );
}
