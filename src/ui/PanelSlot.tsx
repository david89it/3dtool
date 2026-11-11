import type { ReactNode } from 'react';
import { useLayout, type Side } from './layoutState';

const NAME: Record<Side, string> = { left: 'Tools', right: 'Details' };
const KEY: Record<Side, string> = { left: '[', right: ']' };

/**
 * Holds a side panel and its collapse button. Closed, it is a 48 px rail with just the
 * button (and the panel's name sideways); on a narrow screen an open panel floats over the plan.
 */
export function PanelSlot({ side, children }: { side: Side; children: ReactNode }) {
  const open = useLayout((s) => s[side]);
  const toggle = useLayout((s) => s.toggle);
  const name = NAME[side];
  // The chevron points the way the panel will go.
  const chevron = (side === 'left') === open ? '‹' : '›';
  const label = `${open ? 'Hide' : 'Show'} ${name.toLowerCase()}`;
  return (
    <div className={`panel-slot ${side} ${open ? 'open' : 'closed'}`} data-testid={`${side}-slot`}>
      <div className="panel-head">
        {side === 'right' && (
          <button className="icon-btn panel-toggle" aria-label={label} aria-expanded={open} title={`${label} (${KEY[side]})`} onClick={() => toggle(side)} data-testid={`${side}-toggle`}>
            {chevron}
          </button>
        )}
        {open ? <span className="panel-head-name">{name}</span> : <span className="panel-rail-name">{name}</span>}
        {side === 'left' && (
          <button className="icon-btn panel-toggle" aria-label={label} aria-expanded={open} title={`${label} (${KEY[side]})`} onClick={() => toggle(side)} data-testid={`${side}-toggle`}>
            {chevron}
          </button>
        )}
      </div>
      {open && children}
    </div>
  );
}
