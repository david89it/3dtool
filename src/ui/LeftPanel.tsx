import { AdviceLeftPanel } from './AdvicePanel';
import { useRef, useState } from 'react';
import type { WallKind } from '../model/types';
import { useLevel, useStore, type Tool } from '../model/store';
import { importPlanFile } from '../editor2d/importUnderlay';
import { formatScale } from '../model/units';
import { canvasApi } from '../editor2d/canvasApi';
import { toWorld } from '../editor2d/view';
import { OpeningsPalette } from './OpeningsPalette';
import { FurnishPanel } from './FurnishPanel';

function ToolButton({ tool, label, keyHint, desc }: { tool: Tool; label: string; keyHint: string; desc: string }) {
  const current = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  return (
    <button
      className={current === tool ? 'tool-btn on' : 'tool-btn'}
      aria-pressed={current === tool}
      onClick={() => setTool(tool)}
      title={`${label} (${keyHint})`}
      data-tour={tool === 'draw' ? 'draw-walls' : undefined}
    >
      <span className="tool-label">{label}</span>
      <span className="tool-desc">{desc}</span>
      <kbd>{keyHint}</kbd>
    </button>
  );
}

const KINDS: { value: WallKind; label: string }[] = [
  { value: 'internal', label: 'Inside' },
  { value: 'external', label: 'Outside' },
  { value: 'party', label: 'Shared' },
];

function UnderlayPanel() {
  const level = useLevel();
  const editLevel = useStore((s) => s.editLevel);
  const setTool = useStore((s) => s.setTool);
  const tool = useStore((s) => s.tool);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (!level) return null;
  const u = level.underlay;

  const onFile = async (f: File) => {
    setBusy(true);
    try {
      const img = await importPlanFile(f);
      // Start at 10 mm per pixel, centred in the view, then she calibrates.
      const v = canvasApi.getView();
      const el = document.querySelector('[data-testid="plan-canvas"]') as HTMLElement | null;
      const centre = toWorld(v, { x: (el?.clientWidth ?? 800) / 2, y: (el?.clientHeight ?? 600) / 2 });
      const scale = 10;
      editLevel('Import plan image', (L) => {
        L.underlay = {
          imageDataUrl: img.dataUrl,
          scaleMmPerPx: scale,
          offset: { x: centre.x - (img.width * scale) / 2, y: centre.y - (img.height * scale) / 2 },
          rotationDeg: 0,
          opacity: 0.5,
          locked: false,
        };
      });
      setTool('calibrate');
      useStore.getState().toast('Plan imported. Now click two points whose real distance you know.');
      setTimeout(() => canvasApi.fit(), 50);
    } catch (e) {
      useStore.getState().toast((e as Error).message, 'warn');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel-section" aria-label="Plan image">
      <h2>Plan image</h2>
      {!u && <p className="note">Trace over a floorplan: import a picture or PDF, then set its scale.</p>}
      <button className="btn wide" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? 'Opening…' : u ? 'Replace image…' : 'Import PNG, JPG or PDF…'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,application/pdf,.pdf"
        hidden
        data-testid="underlay-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void onFile(f);
        }}
      />
      {u && (
        <>
          <div className="field">
            <span className="field-label">Scale</span>
            <span className="value small">{formatScale(u.scaleMmPerPx)}</span>
          </div>
          <button className={tool === 'calibrate' ? 'btn wide on' : 'btn wide'} onClick={() => setTool('calibrate')}>
            {tool === 'calibrate' ? 'Click two points on the image…' : 'Set scale (redo)'}
          </button>
          <label className="slider">
            <span className="field-label">See-through</span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={u.opacity}
              aria-label="Image opacity"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                editLevel('Image opacity', (L) => void (L.underlay && (L.underlay.opacity = v)));
              }}
            />
          </label>
          <label className="slider">
            <span className="field-label">Rotate {Math.round(u.rotationDeg)}°</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={0.5}
              value={u.rotationDeg}
              aria-label="Image rotation"
              disabled={u.locked}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                editLevel('Rotate image', (L) => void (L.underlay && (L.underlay.rotationDeg = v)));
              }}
            />
          </label>
          <div className="row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={u.locked}
                onChange={(e) => {
                  const v = e.target.checked;
                  editLevel(v ? 'Lock image' : 'Unlock image', (L) => void (L.underlay && (L.underlay.locked = v)));
                  if (v && tool === 'moveImage') setTool('select');
                }}
              />
              Locked
            </label>
            <button
              className={tool === 'moveImage' ? 'btn small on' : 'btn small'}
              disabled={u.locked}
              onClick={() => setTool(tool === 'moveImage' ? 'select' : 'moveImage')}
            >
              Move image
            </button>
          </div>
          <button
            className="btn small danger-text"
            onBlur={() => setConfirmRemove(false)}
            onClick={() => {
              if (!confirmRemove) {
                setConfirmRemove(true);
                return;
              }
              setConfirmRemove(false);
              editLevel('Remove plan image', (L) => void delete L.underlay);
              if (tool === 'calibrate' || tool === 'moveImage') setTool('select');
            }}
          >
            {confirmRemove ? 'Click again to remove (walls stay)' : 'Remove image'}
          </button>
        </>
      )}
    </section>
  );
}

export function LeftPanel() {
  const mode = useStore((s) => s.mode);
  if (mode === 'advice') return <AdviceLeftPanel />;
  if (mode === 'furnish') {
    return (
      <aside className="leftpanel" aria-label="Tools">
        <FurnishPanel />
      </aside>
    );
  }
  if (mode === 'openings') {
    return (
      <aside className="leftpanel" aria-label="Tools">
        <OpeningsPalette />
      </aside>
    );
  }
  return <TracePanel />;
}

function TracePanel() {
  const tool = useStore((s) => s.tool);
  const drawKind = useStore((s) => s.drawKind);
  const setDrawKind = useStore((s) => s.setDrawKind);
  return (
    <aside className="leftpanel" aria-label="Tools">
      <section className="panel-section">
        <h2>Walls</h2>
        <ToolButton tool="select" label="Select & edit" keyHint="V" desc="Click, drag, or type a length" />
        <ToolButton tool="draw" label="Draw walls" keyHint="W" desc="Click to place corners" />
        {tool === 'draw' && (
          <div className="field column">
            <span className="field-label">New walls are</span>
            <div className="segmented" role="radiogroup" aria-label="New wall type">
              {KINDS.map((k) => (
                <button key={k.value} role="radio" aria-checked={drawKind === k.value} className={drawKind === k.value ? 'on' : ''} onClick={() => setDrawKind(k.value)}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      <UnderlayPanel />
    </aside>
  );
}
