import type { FloorAngle, FloorPattern, Room } from '../model/types';
import { effectiveAngle, effectivePattern, FLOOR_ANGLES, FLOOR_PATTERNS, patternInfo } from '../model/floorPatterns';
import { drawWoodPattern, PATTERN_ROTATION } from './floorTextures';
import type { Finish } from './finishes';

const thumbCache = new Map<string, string>();

/** A small picture of a laying pattern in a floor's colour, turned the way it is laid. */
export function patternThumb(pattern: FloorPattern, color: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const key = `${pattern}|${color}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext('2d');
  if (!ctx) return undefined;
  // Draw a bigger square, turned about the centre, so the corners stay covered.
  const big = 160;
  ctx.translate(48, 48);
  ctx.rotate(PATTERN_ROTATION[pattern]);
  ctx.translate(-big / 2, -big / 2);
  drawWoodPattern(ctx, pattern, color, big, `thumb-${pattern}`);
  const url = c.toDataURL();
  thumbCache.set(key, url);
  return url;
}

interface Props {
  room: Pick<Room, 'floorPattern' | 'floorAngle'>;
  floor: Finish;
  onPattern: (p: FloorPattern) => void;
  onAngle: (a: FloorAngle) => void;
}

/** How the boards are laid. Shown only for wood floors. */
export function FloorPatternPicker({ room, floor, onPattern, onAngle }: Props) {
  const pattern = effectivePattern(room, floor.kind) ?? 'straight';
  const angle = effectiveAngle(room);
  return (
    <div className="pattern-picker field column" data-testid="floor-pattern">
      <span className="field-label">Pattern</span>
      <div className="floor-grid" role="radiogroup" aria-label="Floor pattern">
        {FLOOR_PATTERNS.map((p) => {
          const thumb = patternThumb(p.id, floor.color);
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={pattern === p.id}
              aria-label={p.name}
              title={p.hint}
              className={pattern === p.id ? 'floor-swatch on' : 'floor-swatch'}
              onClick={() => onPattern(p.id)}
            >
              <span className="chip-img" style={{ backgroundColor: floor.color, backgroundImage: thumb ? `url(${thumb})` : undefined }} />
              <span className="chip-name">{p.name}</span>
            </button>
          );
        })}
      </div>
      <p className="note">{patternInfo(pattern).hint}</p>
      <span className="field-label">Direction</span>
      <div className="segmented" role="radiogroup" aria-label="Floor direction">
        {FLOOR_ANGLES.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={angle === a.id} className={angle === a.id ? 'on' : ''} onClick={() => onAngle(a.id)}>
            {a.name}
          </button>
        ))}
      </div>
      {patternInfo(pattern).labourNote && <p className="note">{patternInfo(pattern).labourNote}</p>}
    </div>
  );
}
