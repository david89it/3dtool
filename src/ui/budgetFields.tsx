import { useEffect, useRef, useState } from 'react';

/**
 * A text box that saves when she leaves it or presses Enter (one undo step for
 * the whole edit, not one per key). Escape puts the old text back.
 */
export function CommitInput({
  value,
  onCommit,
  label,
  placeholder,
  inputMode,
  className = 'text-field',
  testId,
}: {
  value: string;
  onCommit: (text: string) => void;
  label: string;
  placeholder?: string;
  inputMode?: 'decimal' | 'numeric' | 'text' | 'url';
  className?: string;
  testId?: string;
}) {
  const [text, setText] = useState(value);
  const skip = useRef(false);
  useEffect(() => setText(value), [value]);
  const finish = () => {
    if (skip.current) {
      skip.current = false;
      setText(value);
      return;
    }
    if (text.trim() !== value.trim()) onCommit(text);
    else setText(value);
  };
  return (
    <input
      className={className}
      aria-label={label}
      data-testid={testId}
      value={text}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(e) => setText(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          skip.current = true;
          setText(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
