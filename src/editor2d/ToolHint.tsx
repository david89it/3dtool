import { useMemo } from 'react';
import { useStore } from '../model/store';
import { toolHintText } from './toolHint';

/** The line under the plan saying what to do next. `drawing` is true once a wall's first corner is down. */
export function ToolHint({ drawing, emptyFloor }: { drawing: boolean; emptyFloor: boolean }) {
  const tool = useStore((s) => s.tool);
  const mode = useStore((s) => s.mode);
  const selected = useStore((s) => s.selection?.kind ?? null);
  const touch = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches, []);
  return (
    <div className="tool-hint" data-testid="tool-hint">
      {toolHintText({ tool, mode, selected, drawing, emptyFloor, touch })}
    </div>
  );
}
