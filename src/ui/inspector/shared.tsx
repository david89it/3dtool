import { useState } from 'react';
import type { WallKind, Structural } from '../../model/types';

export const KIND_LABEL: Record<WallKind, string> = {
  internal: 'Inside wall',
  external: 'Outside wall',
  party: 'Shared with neighbour',
};

export const STRUCT_LABEL: Record<Structural, string> = {
  unknown: "Don't know",
  loadBearing: 'Load-bearing',
  nonLoadBearing: 'Not load-bearing',
};

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TextField({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="text-field"
      aria-label={label}
      value={text ?? value}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== null && text.trim() && text !== value) onCommit(text.trim());
        setText(null);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
