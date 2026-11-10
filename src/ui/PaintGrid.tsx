import { useEffect, useRef, useState } from 'react';
import { isHex, normaliseHex, paintName, PAINT_GROUPS, PAINTS, sameFinish } from '../model/palette';
import { drawFinish, findSurface, type Finish } from '../view3d/finishes';

const thumbCache = new Map<string, string>();

/** Small preview picture of a textured finish, drawn once per finish. */
export function finishThumb(f: Finish): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const hit = thumbCache.get(f.id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext('2d');
  if (!ctx) return undefined;
  drawFinish(ctx, f, 96);
  const url = c.toDataURL();
  thumbCache.set(f.id, url);
  return url;
}

/** Name of what a finish value is, for a "Chosen: Sage" line. */
export function finishName(id: string | undefined): string {
  if (!id) return '';
  const f = findSurface(id);
  if (!f) return id;
  return isHex(id) ? paintName(id) : f.name;
}

interface Props {
  /** The finish id or hex now chosen (highlighted), if any. */
  value: string | undefined;
  onPick: (id: string) => void;
  /** Accessible name of the whole picker, e.g. "Wall colour". */
  label: string;
  /** Textured finishes shown after the paints (wall tile, timber panelling). */
  extras?: Finish[];
  /** Hide the colour name line (when the caller shows its own). */
  hideChosen?: boolean;
}

/** Paint swatches in six groups, plus a free colour (hex) input. Used by the 3D panel and the 2D wall panel. */
export function PaintGrid({ value, onPick, label, extras, hideChosen }: Props) {
  return (
    <div className="paint-grid" role="radiogroup" aria-label={label}>
      {PAINT_GROUPS.map((g) => (
        <div key={g} className="paint-group">
          <span className="paint-group-name">{g}</span>
          <div className="paint-row">
            {PAINTS.filter((p) => p.group === g).map((p) => {
              const on = sameFinish(value, p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={p.name}
                  title={p.name}
                  className={on ? 'paint-swatch on' : 'paint-swatch'}
                  style={{ backgroundColor: p.hex }}
                  onClick={() => onPick(p.id)}
                />
              );
            })}
          </div>
        </div>
      ))}
      {extras && extras.length > 0 && (
        <div className="paint-group">
          <span className="paint-group-name">Other finishes</span>
          <div className="paint-row">
            {extras.map((f) => {
              const on = sameFinish(value, f.id);
              const thumb = finishThumb(f);
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={f.name}
                  title={f.name}
                  className={on ? 'paint-swatch on' : 'paint-swatch'}
                  style={{ backgroundColor: f.color, backgroundImage: thumb ? `url(${thumb})` : undefined, backgroundSize: 'cover' }}
                  onClick={() => onPick(f.id)}
                />
              );
            })}
          </div>
        </div>
      )}
      <HexInput value={value} onPick={onPick} label={label} />
      {!hideChosen && value && <p className="note paint-chosen">Chosen: {finishName(value)}</p>}
    </div>
  );
}

function HexInput({ value, onPick, label }: { value: string | undefined; onPick: (hex: string) => void; label: string }) {
  const current = isHex(value) ? value.toLowerCase() : '';
  const [text, setText] = useState(current);
  const [bad, setBad] = useState(false);
  const well = useRef<HTMLInputElement>(null);
  const inputId = `hex-${label.replace(/\W+/g, '-')}`;
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    setText(current);
    setBad(false);
  }, [current]);

  // The colour well fires "change" once, when its picker closes, so dragging
  // through colours does not make one undo step (and one rebuild) per shade.
  useEffect(() => {
    const el = well.current;
    if (!el) return;
    const onChange = () => {
      const hex = normaliseHex(el.value);
      if (hex) pick.current(hex);
    };
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);

  const commit = () => {
    if (text.trim() === '') {
      setBad(false);
      return;
    }
    const hex = normaliseHex(text);
    if (!hex) {
      setBad(true);
      return;
    }
    setBad(false);
    if (hex !== current) onPick(hex);
  };

  return (
    <div className="paint-hex">
      <label className="field-label" htmlFor={inputId}>
        Any other colour
      </label>
      <div className="paint-hex-row">
        <input
          ref={well}
          type="color"
          className="paint-well"
          aria-label={`${label}: pick a colour`}
          value={normaliseHex(text) ?? (current || '#ffffff')}
          onChange={(e) => setText(e.target.value)}
        />
        <input
          id={inputId}
          className="paint-hex-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={7}
          placeholder="#5a2a3a"
          aria-label={`${label}: colour code`}
          aria-invalid={bad}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
            e.stopPropagation(); // typing must not trigger plan shortcuts
          }}
        />
        <button type="button" className="btn small" onClick={commit}>
          Use
        </button>
      </div>
      {bad && <p className="note paint-bad">Use six letters or digits, like #5a2a3a.</p>}
    </div>
  );
}
