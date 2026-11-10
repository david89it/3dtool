import { useState } from 'react';
import type { Level, Project } from '../model/types';
import { useLevel, useStore } from '../model/store';
import { duplicateAsOption } from '../model/schemes';
import { importPlanFile } from '../editor2d/importUnderlay';
import { canvasApi } from '../editor2d/canvasApi';
import { toWorld } from '../editor2d/view';
import { useSiteMeasure } from '../sitemeasure/state';
import { readRoomPlan, type ScanSurface } from './roomplan';
import { buildFromScan, describeSummary, wallBounds } from './buildFromScan';
import { parseDxf } from './dxf';
import '../sitemeasure/sitemeasure.css';

type Pending = { name: string; surfaces: ScanSurface[] };

const ext = (name: string) => name.toLowerCase().split('.').pop() ?? '';

/** Put a DXF drawing's top-left on the plan's top-left (or the origin on an empty floor). */
function placeDxf(level: Level, segments: [number, number, number, number][]): [number, number, number, number][] {
  const xs = segments.flatMap((s) => [s[0], s[2]]);
  const ys = segments.flatMap((s) => [s[1], s[3]]);
  const target = wallBounds(level)?.min ?? { x: 0, y: 0 };
  const dx = target.x - Math.min(...xs);
  const dy = target.y - Math.min(...ys);
  return segments.map(([a, b, c, d]) => [Math.round(a + dx), Math.round(b + dy), Math.round(c + dx), Math.round(d + dy)]);
}

export function ScanImport() {
  const open = useSiteMeasure((s) => s.importOpen);
  const setOpen = useSiteMeasure((s) => s.setImportOpen);
  const level = useLevel();
  const [pending, setPending] = useState<Pending | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open || !level) return null;

  const close = () => {
    setOpen(false);
    setPending(null);
    setResult(null);
    setError(null);
  };

  const onFile = async (f: File) => {
    setError(null);
    setResult(null);
    setPending(null);
    setBusy(true);
    try {
      const e = ext(f.name);
      if (e === 'usdz' || e === 'usda' || e === 'usdc' || e === 'usd') {
        const surfaces = readRoomPlan(await f.arrayBuffer());
        if (!surfaces.some((s) => s.kind === 'wall')) throw new Error('No walls found in this scan. Was it exported from a room scan (RoomPlan)?');
        setPending({ name: f.name, surfaces });
      } else if (e === 'dxf') {
        const { segments, unitsLabel } = parseDxf(await f.text());
        useStore.getState().snapshotBefore('importing a drawing');
        useStore.getState().editLevel('Import a drawing', (L) => {
          L.vectorUnderlay = { name: f.name, segments: placeDxf(L as Level, segments) };
        });
        setResult(`Added the drawing under this floor: ${segments.length} lines, in ${unitsLabel}. Draw walls over it; corners snap to its line ends.`);
        setTimeout(() => canvasApi.fit(), 50);
      } else {
        const img = await importPlanFile(f);
        const v = canvasApi.getView();
        const el = document.querySelector('[data-testid="plan-canvas"]') as HTMLElement | null;
        const centre = toWorld(v, { x: (el?.clientWidth ?? 800) / 2, y: (el?.clientHeight ?? 600) / 2 });
        const scale = 10;
        useStore.getState().snapshotBefore('importing a plan picture');
        useStore.getState().editLevel('Import plan image', (L) => {
          L.underlay = {
            imageDataUrl: img.dataUrl,
            scaleMmPerPx: scale,
            offset: { x: centre.x - (img.width * scale) / 2, y: centre.y - (img.height * scale) / 2 },
            rotationDeg: 0,
            opacity: 0.5,
            locked: false,
          };
        });
        useStore.getState().setTool('calibrate');
        useStore.getState().toast('Plan imported. Now click two points whose real distance you know.');
        setTimeout(() => canvasApi.fit(), 50);
        close();
      }
    } catch (err) {
      setError((err as Error).message || 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const build = (asOption: boolean) => {
    if (!pending) return;
    const s = useStore.getState();
    const fromId = s.levelId;
    let summary = '';
    let newId: string | null = null;
    s.snapshotBefore('importing a scan');
    try {
      s.commit(asOption ? 'Add a scan as a new option' : 'Replace walls with a scan', (d) => {
        const p = d as Project;
        const src = p.levels.find((l) => l.id === fromId)!;
        const anchor = wallBounds(src)?.min ?? { x: 0, y: 0 };
        let target = src;
        if (asOption) {
          newId = duplicateAsOption(p, fromId);
          target = p.levels.find((l) => l.id === newId)!;
        }
        summary = describeSummary(buildFromScan(target, pending.surfaces, anchor));
      });
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    if (newId) s.setLevel(newId);
    setPending(null);
    setResult(summary);
    setTimeout(() => canvasApi.fit(), 50);
  };

  const counts = pending
    ? (['wall', 'door', 'window', 'opening'] as const).map((k) => [k, pending.surfaces.filter((x) => x.kind === k).length] as const)
    : [];

  return (
    <div className="modal-backdrop fixed sm-front" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal sm-import" role="dialog" aria-label="Import a scan">
        <h2>Import a scan into {level.name}</h2>
        <p className="note">
          A RoomPlan scan (.usdz) becomes walls, doors and windows. A drawing (.dxf) goes under the plan for tracing. An image or PDF
          becomes the plan picture.
        </p>
        <label className="btn wide sm-file">
          {busy ? 'Reading…' : 'Choose a file…'}
          <input
            type="file"
            accept=".usdz,.usda,.usdc,.usd,.dxf,image/png,image/jpeg,application/pdf,.pdf"
            hidden
            data-testid="scan-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onFile(f);
            }}
          />
        </label>
        {error && <p className="error">{error}</p>}
        {pending && (
          <div className="sm-choice">
            <p>
              <strong>{pending.name}</strong>: {counts.filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', ')}.
            </p>
            <button className="btn primary wide" onClick={() => build(true)}>
              Add as a new option (keeps your plan)
            </button>
            <button className="btn wide" onClick={() => build(false)}>
              Replace this floor’s walls
            </button>
            <p className="note">
              The scan is squared up and placed over your plan’s top-left corner. Furniture, pins and the plan picture stay. Undo puts
              everything back.
            </p>
          </div>
        )}
        {result && (
          <p className="sm-result" data-testid="scan-result">
            {result}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={() => useSiteMeasure.getState().setGuideOpen(true)}>
            How to scan
          </button>
          <button className="btn primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
