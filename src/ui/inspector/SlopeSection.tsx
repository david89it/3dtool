import { useMemo, useState } from 'react';
import type { Level, Room, RoomSlope } from '../../model/types';
import { useStore } from '../../model/store';
import { matchDetected } from '../../geometry/rooms';
import { formatArea, formatLength } from '../../model/units';
import { boundaryWalls, DEFAULT_KNEE, DEFAULT_PITCH, flatCeiling, MAX_PITCH, MAX_SLOPES, MIN_PITCH, resolveSlopes, usableArea, USABLE_HEIGHT, wallSideWord } from '../../geometry/roof';
import { uid } from '../../model/ids';
import { EditableLength } from '../EditableLength';

/** A number she can click and type over, in degrees. Shows "≈" while it is a guess. */
function PitchField({ value, estimated, onChange }: { value: number; estimated: boolean; onChange: (deg: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const n = Number(text.replace('°', '').trim());
    if (!Number.isFinite(n) || n < MIN_PITCH || n > MAX_PITCH) {
      setError(`Between ${MIN_PITCH}° and ${MAX_PITCH}°`);
      return;
    }
    setText(null);
    setError(null);
    if (n !== value || estimated) onChange(Math.round(n * 10) / 10);
  };
  if (text === null) {
    return (
      <button type="button" className={`editable ${estimated ? 'estimated' : ''}`} aria-label={`Roof pitch: ${value} degrees. Click to change`} onClick={() => setText(String(value))}>
        {estimated && (
          <span className="approx" title="Estimated. Measure on site with a phone level or an angle finder.">
            ≈
          </span>
        )}
        {value}°
      </button>
    );
  }
  return (
    <span className="editable-input-wrap">
      <input
        className="editable-input"
        aria-label="Roof pitch in degrees"
        autoFocus
        inputMode="decimal"
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onBlur={() => (error ? (setText(null), setError(null)) : commit())}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setText(null);
            setError(null);
          }
        }}
      />
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}

/** Roof slopes for a loft room: which wall the roof comes down to, the knee-wall height and the pitch. */
export function SlopeSection({ level, room, detected }: { level: Level; room: Room; detected: NonNullable<ReturnType<typeof matchDetected>> }) {
  const editLevel = useStore((s) => s.editLevel);
  const units = useStore((s) => s.units);
  const walls = useMemo(() => boundaryWalls(level, detected), [level, detected]);
  const slopes = room.slopes ?? [];
  const flat = flatCeiling(level, room);
  const [pick, setPick] = useState('');
  const wallLabel = (wallId: string): string => {
    const w = walls.find((x) => x.wallId === wallId);
    if (!w) return 'a wall that is no longer here';
    const word = wallSideWord(w.inward);
    const same = walls.filter((x) => wallSideWord(x.inward) === word);
    const n = same.indexOf(w) + 1;
    return same.length > 1 ? `${word} ${n} (${formatLength(w.length, units)})` : `${word} (${formatLength(w.length, units)})`;
  };
  const free = walls.filter((w) => !slopes.some((s) => s.wallId === w.wallId));
  const chosen = free.some((w) => w.wallId === pick) ? pick : (free[0]?.wallId ?? '');
  const edit = (label: string, fn: (list: RoomSlope[]) => void) =>
    editLevel(label, (L) => {
      const r = L.rooms.find((x) => x.id === room.id);
      if (!r) return;
      const list = r.slopes ?? [];
      fn(list);
      if (list.length) r.slopes = list;
      else delete r.slopes;
    });
  const resolved = resolveSlopes(level, room, detected);
  const area = resolved.length ? usableArea(detected.inner, flat, resolved) : null;
  return (
    <div className="slope-section" data-testid="slope-section">
      <h3>Sloped ceiling</h3>
      {slopes.length === 0 && <p className="note">Loft under a pitched roof? Add the wall the roof comes down to, and the ceiling will slope up from it.</p>}
      {slopes.map((s) => (
        <div className="slope-card" key={s.id} data-testid="slope-card">
          <p className="note">
            <b>Roof comes down to the {wallLabel(s.wallId)}</b>
          </p>
          <div className="field">
            <span className="field-label">Wall height where it starts</span>
            <EditableLength
              label="Knee wall height"
              ctx="small"
              value={s.kneeHeight}
              estimated={!!s.estimated?.includes('knee')}
              min={100}
              max={Math.max(200, flat - 100)}
              onChange={(mm) =>
                edit('Set knee wall height', (list) => {
                  const x = list.find((q) => q.id === s.id);
                  if (!x) return;
                  x.kneeHeight = Math.round(mm);
                  x.estimated = x.estimated?.filter((k) => k !== 'knee');
                  if (!x.estimated?.length) delete x.estimated;
                })
              }
            />
          </div>
          <div className="field">
            <span className="field-label">Roof pitch</span>
            <PitchField
              value={s.pitchDeg}
              estimated={!!s.estimated?.includes('pitch')}
              onChange={(deg) =>
                edit('Set roof pitch', (list) => {
                  const x = list.find((q) => q.id === s.id);
                  if (!x) return;
                  x.pitchDeg = deg;
                  x.estimated = x.estimated?.filter((k) => k !== 'pitch');
                  if (!x.estimated?.length) delete x.estimated;
                })
              }
            />
          </div>
          <button className="btn small" onClick={() => edit('Remove sloped ceiling', (list) => void list.splice(list.findIndex((q) => q.id === s.id), 1))}>
            Remove this slope
          </button>
        </div>
      ))}
      {slopes.length < MAX_SLOPES && free.length > 0 && (
        <div className="field">
          <select className="text-field" aria-label="Wall the roof comes down to" value={chosen} onChange={(e) => setPick(e.target.value)}>
            {free.map((w) => (
              <option key={w.wallId} value={w.wallId}>
                {wallSideWord(w.inward)} ({formatLength(w.length, units)})
              </option>
            ))}
          </select>
          <button
            className="btn"
            onClick={() =>
              edit('Add sloped ceiling', (list) => {
                if (chosen) list.push({ id: uid('sl'), wallId: chosen, kneeHeight: DEFAULT_KNEE, pitchDeg: DEFAULT_PITCH, estimated: ['knee', 'pitch'] });
              })
            }
          >
            Add a sloped ceiling
          </button>
        </div>
      )}
      {area && (
        <p className="note" data-testid="usable-area">
          Floor with a ceiling at least {formatLength(USABLE_HEIGHT, units)} high: {formatArea(area.usable, units)} of {formatArea(area.total, units)}. The dashed line on the plan is where the ceiling is {formatLength(USABLE_HEIGHT, units)}; the hatched floor is lower.
        </p>
      )}
      {slopes.some((s) => s.estimated?.length) && <p className="note">≈ marks a guess. Measure the wall height where the roof starts and the pitch on site, then type them in.</p>}
    </div>
  );
}
