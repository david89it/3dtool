import { useState } from 'react';
import { useStore } from '../model/store';
import { formatLength, parseLength, type LengthContext } from '../model/units';

interface Props {
  value: number; // mm
  onChange: (mm: number) => void;
  label: string;
  ctx?: LengthContext;
  min?: number;
  max?: number;
  estimated?: boolean;
  /** Return a message to refuse a value (shown under the field). */
  validate?: (mm: number) => string | null;
}

/** A number she can click and type over. Shown in her units, stored in mm. */
export function EditableLength({ value, onChange, label, ctx = 'length', min = 1, max = 50000, estimated, validate }: Props) {
  const units = useStore((s) => s.units);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = formatLength(value, units, ctx);

  const commit = () => {
    if (text === null) return;
    const mm = parseLength(text, units, ctx);
    if (mm === null) {
      setError(units === 'metric' ? 'Try 3.32 m or 332 cm' : 'Try 10′ 11″');
      return;
    }
    if (mm < min || mm > max) {
      setError(`Between ${formatLength(min, units, ctx)} and ${formatLength(max, units, ctx)}`);
      return;
    }
    const problem = validate?.(mm);
    if (problem) {
      setError(problem);
      return;
    }
    setText(null);
    setError(null);
    if (Math.abs(mm - value) > 0.01 || estimated) onChange(mm);
  };

  if (text === null) {
    return (
      <button
        type="button"
        className={`editable ${estimated ? 'estimated' : ''}`}
        aria-label={`${label}: ${shown}. Click to change`}
        onClick={() => setText(shown)}
      >
        {estimated && <span className="approx" title="Estimated from the agent's plan. Measure on site.">≈</span>}
        {shown}
      </button>
    );
  }
  return (
    <span className="editable-input-wrap">
      <input
        className="editable-input"
        aria-label={label}
        autoFocus
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onBlur={() => {
          if (error) {
            setText(null);
            setError(null);
          } else commit();
        }}
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
