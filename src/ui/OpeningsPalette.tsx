import { useRef } from 'react';
import type { OpeningType } from '../model/types';
import { useStore } from '../model/store';
import { canvasApi } from '../editor2d/canvasApi';
import { OPENING_DEFAULTS, OPENING_LABEL } from '../geometry/openings';
import { formatLength } from '../model/units';

const ITEMS: { type: OpeningType; desc: string }[] = [
  { type: 'door', desc: 'Hinged door with its swing' },
  { type: 'window', desc: 'Window with a sill' },
  { type: 'opening', desc: 'Gap in the wall, no door' },
  { type: 'bayWindow', desc: 'One face of a bay' },
];

function Icon({ type }: { type: OpeningType }) {
  const wall = '#464b53';
  return (
    <svg width="44" height="34" viewBox="0 0 44 34" aria-hidden>
      <rect x="0" y="22" width="9" height="8" fill={wall} />
      <rect x="35" y="22" width="9" height="8" fill={wall} />
      {type === 'door' && (
        <>
          <path d="M9 26 L9 4" stroke="#555b63" strokeWidth="2.5" />
          <path d="M9 4 A22 22 0 0 1 31 26" fill="none" stroke="#555b63" strokeWidth="1" strokeDasharray="3 2" />
        </>
      )}
      {(type === 'window' || type === 'bayWindow') && (
        <>
          <rect x="9" y="22" width="26" height="8" fill="none" stroke="#1f2328" strokeWidth="1" />
          <path d="M9 25 H35 M9 27 H35" stroke="#7fb4d9" strokeWidth="1.5" />
        </>
      )}
      {type === 'opening' && <path d="M9 22 H35 M9 30 H35" stroke="#5b6169" strokeWidth="1" strokeDasharray="3 3" />}
    </svg>
  );
}

/**
 * Press on an item and drag it onto a wall; or click it, then click a wall.
 * Pointer events (not HTML drag and drop) so it also works with a finger
 * or an Apple Pencil.
 */
export function OpeningsPalette() {
  const units = useStore((s) => s.units);
  const tool = useStore((s) => s.tool);
  const placeType = useStore((s) => s.placeType);
  const drag = useRef<{ type: OpeningType; x: number; y: number; moved: boolean } | null>(null);

  const onPointerDown = (type: OpeningType) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { type, x: e.clientX, y: e.clientY, moved: false };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 5) {
        d.moved = true;
        useStore.setState({ placeType: d.type, selection: null });
        document.body.classList.add('dragging-opening');
      }
      if (d.moved) canvasApi.ghostAt({ x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('dragging-opening');
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (!d.moved) {
        useStore.getState().armPlacement(d.type);
        return;
      }
      canvasApi.ghostAt({ x: ev.clientX, y: ev.clientY });
      const g = useStore.getState().ghost;
      if (!canvasApi.dropGhost()) {
        useStore.getState().setGhost(null);
        if (g && !g.ok && canvasApi.clientToWorld({ x: ev.clientX, y: ev.clientY })) {
          useStore.getState().toast(g.reason.endsWith(".") ? g.reason : `${g.reason}.`);
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <section className="panel-section" aria-label="Doors and windows">
      <h2>Doors and windows</h2>
      <p className="note">Drag one onto a wall. Or click it, then click a wall.</p>
      <div className="palette">
        {ITEMS.map((it) => {
          const armed = tool === 'placeOpening' && placeType === it.type;
          return (
            <button
              key={it.type}
              className={armed ? 'palette-item on' : 'palette-item'}
              aria-pressed={armed}
              data-testid={`palette-${it.type}`}
              onPointerDown={onPointerDown(it.type)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') useStore.getState().armPlacement(it.type);
              }}
            >
              <Icon type={it.type} />
              <span className="palette-text">
                <span className="tool-label">{OPENING_LABEL[it.type]}</span>
                <span className="tool-desc">
                  {it.desc} · {formatLength(OPENING_DEFAULTS[it.type].width, units)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="note">
        In a wall that may be load-bearing, at least 10 cm of wall is kept either side of an opening. You can
        change that for one opening in its details.
      </p>
    </section>
  );
}
