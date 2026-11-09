import { useEffect, useLayoutEffect, useState } from 'react';
import { useStore, type Mode } from '../model/store';
import { markTourSeen } from '../model/persistence';

interface Step {
  mode: Mode;
  /** CSS selector of the control the card points at. */
  target: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: Step[] = [
  {
    mode: 'trace',
    target: '[aria-label="Plan image"]',
    title: '1 · Set the scale',
    body: 'Your floorplan is already underneath. If you import a new one, click “Set scale”, then click two points whose real distance you know, such as a room width printed on the plan.',
  },
  {
    mode: 'trace',
    target: '[data-tour="draw-walls"]',
    title: '2 · Trace walls',
    body: 'Choose “Draw walls” and click to place corners. Lines snap straight and to existing corners. Click any measurement on the plan to type an exact length.',
  },
  {
    mode: 'openings',
    target: '[aria-label="Doors and windows"]',
    title: '3 · Open a wall',
    body: 'Drag a door, window or opening onto a wall. To open the kitchen into the reception, click that wall and choose “Open up this wall”.',
  },
  {
    mode: 'furnish',
    target: '[data-tour="furnish-search"]',
    title: '4 · Add furniture',
    body: 'Search for anything, like “wall bed” or “bike”, then drag it onto the plan. The shaded areas show the space it needs, and Advice tells you when things are too tight.',
  },
  {
    mode: '3d',
    target: '[data-tour="mode-3d"]',
    title: '5 · Walk through',
    body: 'Press Tab or 3D to see the flat in 3D. Choose “Walk” to look around at eye height, with W A S D or the arrow keys. Stairs take you up and down.',
  },
];

function useTargetRect(selector: string | undefined, tick: number) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!selector) return;
    let frame = 0;
    const update = () => {
      const el = document.querySelector(selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    update();
    // Panels can mount a moment after the mode switch.
    frame = window.setTimeout(update, 120);
    window.addEventListener('resize', update);
    return () => {
      window.clearTimeout(frame);
      window.removeEventListener('resize', update);
    };
  }, [selector, tick]);
  return rect;
}

/** First-run tour: five short cards pointing at the real controls. It never blocks the plan. */
export function Tour() {
  const step = useStore((s) => s.tourStep);
  const mode = useStore((s) => s.mode);
  const s = step === null ? undefined : TOUR_STEPS[step];
  const rect = useTargetRect(s?.target, (step ?? 0) * 10 + (mode === s?.mode ? 1 : 0));

  useEffect(() => {
    if (s && useStore.getState().mode !== s.mode) useStore.getState().setMode(s.mode);
  }, [s]);

  if (step === null || !s) return null;

  const close = () => {
    useStore.getState().setTourStep(null);
    void markTourSeen();
  };
  const last = step === TOUR_STEPS.length - 1;

  // Card beside the target if there is room, otherwise below it; always on screen.
  const W = 340;
  let left = 24;
  let top = 140;
  if (rect) {
    const roomRight = window.innerWidth - rect.right > W + 24;
    left = roomRight ? rect.right + 16 : Math.max(16, Math.min(rect.left, window.innerWidth - W - 16));
    top = roomRight ? Math.max(76, Math.min(rect.top, window.innerHeight - 260)) : Math.min(rect.bottom + 12, window.innerHeight - 260);
  }

  return (
    <div className="tour-layer" aria-live="polite">
      {rect && (
        <div
          className="tour-ring"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div className="tour-card" role="dialog" aria-label="Quick tour" style={{ left, top, width: W }} data-testid="tour">
        <div className="tour-progress" aria-hidden>
          {TOUR_STEPS.map((_, i) => (
            <span key={i} className={i === step ? 'dot on' : 'dot'} />
          ))}
        </div>
        <h2>{s.title}</h2>
        <p>{s.body}</p>
        <div className="modal-actions">
          <button className="btn" onClick={close}>
            Skip tour
          </button>
          {step > 0 && (
            <button className="btn" onClick={() => useStore.getState().setTourStep(step - 1)}>
              Back
            </button>
          )}
          <button
            className="btn primary"
            onClick={() => {
              if (last) {
                close();
                useStore.getState().setMode('trace');
              } else useStore.getState().setTourStep(step + 1);
            }}
          >
            {last ? 'Start planning' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
