import { countRender } from '../../perf';
import { memo } from 'react';
import { Line } from 'react-konva';
import type { Level } from '../../model/types';
import type { DetectedRoom } from '../../geometry/rooms';
import { COLORS, roomFill } from '../theme';

const flat = (pts: { x: number; y: number }[]) => pts.flatMap((p) => [p.x, p.y]);

function RoomFillsImpl({
  level,
  rooms,
  selectedRoomId,
  translucent,
}: {
  level: Level;
  rooms: DetectedRoom[];
  selectedRoomId?: string;
  translucent: boolean;
}) {
  countRender('RoomFills');
  return (
    <>
      {rooms.map((r) => {
        if (r.solid) {
          return <Line key={r.key} points={flat(r.centre)} closed fill={COLORS.solid} listening={false} />;
        }
        const stored = level.rooms.find((x) => x.boundary.join('|') === r.nodeIds.join('|'));
        const selected = stored && stored.id === selectedRoomId;
        return (
          <Line
            key={r.key}
            points={flat(r.inner)}
            closed
            fill={selected ? COLORS.roomSelected : roomFill(stored?.id ?? r.key)}
            opacity={translucent ? 0.55 : 1}
            listening={false}
          />
        );
      })}
    </>
  );
}

export const RoomFills = memo(
  RoomFillsImpl,
  (a, b) => a.level.rooms === b.level.rooms && a.rooms === b.rooms && a.selectedRoomId === b.selectedRoomId && a.translucent === b.translucent,
);
