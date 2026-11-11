// The engineer and landlord pack: a full-screen view laid out as A4
// landscape pages, with print styles so "Print / Save as PDF" gives a clean
// document. It sits outside the editor layout and shares nothing with the
// canvas except canvasApi.renderLevelImage (the plan pictures).

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../model/store';
import { canvasApi } from '../editor2d/canvasApi';
import { formatLength } from '../model/units';
import { noteLength, NOTE_KIND_LABEL } from '../model/notes';
import { STRUCTURAL_BADGE_TEXT } from '../geometry/openings';
import { get3dSnapshot } from '../view3d/captureBridge';
import { buildBudget, formatGBP, sizeText, STATUSES, STATUS_LABEL } from '../model/costs';
import { buildFloors, buildStructuralRows, engineerChecklist, type StructuralRow } from './pack';
import { usePrint } from './state';
import './print.css';

/** Logical size of each plan picture; sharpened by PIXEL_RATIO. Matches the page's picture area. */
const IMG_W = 1040;
const IMG_H = 560;
const PIXEL_RATIO = 2.5;

export function PrintPack() {
  const open = usePrint((s) => s.open);
  if (!open) return null;
  return createPortal(<PackView />, document.body);
}

function Blank({ label }: { label: string }) {
  return (
    <p className="print-blank">
      <span>{label}:</span>
      <span className="print-line" aria-hidden />
    </p>
  );
}

function pier(r: StructuralRow, side: 'before' | 'after', units: 'metric' | 'imperial'): string {
  const mm = side === 'before' ? r.pierBefore : r.pierAfter;
  const where = side === 'before' ? r.sideBefore : r.sideAfter;
  return `${formatLength(mm, units)} on the ${where}`;
}

function PackView() {
  const setOpen = usePrint((s) => s.setOpen);
  // The pack shows the plan as it was when she opened it.
  const [data] = useState(() => {
    const s = useStore.getState();
    const project = s.project;
    const units = s.units;
    const rows = buildStructuralRows(project);
    return {
      project,
      units,
      floors: buildFloors(project, units),
      budget: buildBudget(project),
      rows,
      checklist: engineerChecklist(rows, units),
      snapshot3d: get3dSnapshot(),
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    };
  });
  const { project, units, floors, rows, budget } = data;
  const [images, setImages] = useState<Record<string, string | null>>({});
  const printableFloors = useMemo(() => floors.filter((f) => f.hasWalls), [floors]);
  const ready = printableFloors.every((f) => f.levelId in images);

  // Draw each floor's plan, one after another so the page stays responsive.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const f of printableFloors) {
        const url = await canvasApi.renderLevelImage(f.levelId, { width: IMG_W, height: IMG_H, pixelRatio: PIXEL_RATIO });
        if (cancelled) return;
        setImages((prev) => ({ ...prev, [f.levelId]: url }));
      }
    })().catch(() => {
      if (!cancelled) setImages(Object.fromEntries(printableFloors.map((f) => [f.levelId, null])));
    });
    return () => {
      cancelled = true;
    };
  }, [printableFloors]);

  // The page behind must not scroll or react while this is open; Esc closes it.
  useEffect(() => {
    document.body.classList.add('print-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('print-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [setOpen]);

  const allChanges = floors.flatMap((f) => f.changes.map((c) => ({ floor: f.name, text: c })));
  const withNotes = floors.filter((f) => f.notes.length > 0);
  const hasStructural = rows.length > 0;

  return (
    <div className="print-root" role="dialog" aria-label="Print or save as PDF" data-testid="print-view">
      <div className="print-toolbar">
        <div>
          <strong>Print or save as PDF</strong>
          <span className="print-status" role="status">
            {ready ? 'Ready. In the print window, choose “Save as PDF” as the printer.' : 'Drawing the plans…'}
          </span>
        </div>
        <div className="print-toolbar-actions">
          <button className="btn primary" disabled={!ready} onClick={() => window.print()}>
            Print / Save as PDF
          </button>
          <button className="btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>

      <div className="print-pages">
        {/* 1. Cover */}
        <section className="print-page cover" data-testid="print-cover">
          <p className="print-kicker">Plans for the structural engineer and the landlord</p>
          <h1>{project.name}</h1>
          <p className="print-date">{data.date}</p>
          <h2>What we propose to change</h2>
          {allChanges.length === 0 ? (
            <p>No new openings have been drawn yet. This pack shows the plans as they are.</p>
          ) : (
            floors
              .filter((f) => f.changes.length > 0)
              .map((f) => (
                <div key={f.levelId}>
                  <h3>{f.name}</h3>
                  <ul>
                    {f.changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              ))
          )}
          <Blank label="Prepared for" />
        </section>

        {/* 2. One page per floor */}
        {printableFloors.map((f) => (
          <section key={f.levelId} className="print-page floor" data-testid="print-floor-page">
            <h2>{f.name}</h2>
            <div className="print-plan" style={{ aspectRatio: `${IMG_W} / ${IMG_H}` }}>
              {images[f.levelId] ? (
                <img src={images[f.levelId]!} alt={`Plan of the ${f.name}`} />
              ) : (
                <p className="print-wait">{f.levelId in images ? 'This floor could not be drawn.' : 'Drawing the plan…'}</p>
              )}
            </div>
            <p className="print-legend">
              Lengths are inside faces of the walls. A ⚠ pin marks an opening that may be structural. The scale bar is
              correct at any print size.
            </p>
          </section>
        ))}

        {/* 3. Structural */}
        <section className="print-page flow" data-testid="print-structural">
          <h2>Structural</h2>
          <p className="print-callout">⚠ {STRUCTURAL_BADGE_TEXT}</p>
          {hasStructural ? (
            <table className="print-table">
              <thead>
                <tr>
                  <th>Floor</th>
                  <th>Where</th>
                  <th>Wall</th>
                  <th>Thickness</th>
                  <th>Opening</th>
                  <th>Pier, first side</th>
                  <th>Pier, second side</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.openingId}>
                    <td>{r.floor}</td>
                    <td>{r.location}</td>
                    <td>
                      {r.wallType}
                      <br />
                      <span className="print-small">{r.structuralLabel}</span>
                    </td>
                    <td>{formatLength(r.thickness, units)}</td>
                    <td>
                      {r.openingType}: {formatLength(r.openingWidth, units)} wide, {formatLength(r.openingHeight, units)} high
                    </td>
                    <td>{pier(r, 'before', units)}</td>
                    <td>{pier(r, 'after', units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No structural openings are marked on the plan yet. Open up a wall in Openings mode and it will be listed here.</p>
          )}
          {hasStructural && <p className="print-small">A pier is the wall left standing beside an opening.</p>}
          <h3>Things the engineer should confirm</h3>
          <ul>
            {data.checklist.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>

        {/* 4. Landlord's licence */}
        <section className="print-page flow" data-testid="print-landlord">
          <h2>Landlord’s licence for alterations</h2>
          <p>
            We are asking for the landlord’s licence to carry out the work below at <strong>{project.name}</strong>.
          </p>
          <h3>Summary of the works</h3>
          {allChanges.length === 0 ? (
            <p>No changes to walls have been drawn yet.</p>
          ) : (
            <ul>
              {allChanges.map((c, i) => (
                <li key={i}>
                  <strong>{c.floor}:</strong> {c.text}
                </li>
              ))}
            </ul>
          )}
          {hasStructural && (
            <p>
              Some of these openings may be in load-bearing walls. A structural engineer will check them, and Building
              Control will be told before work starts. The engineer’s page is attached.
            </p>
          )}
          <div className="print-blanks">
            <Blank label="Freeholder / landlord" />
            <Blank label="Lease reference" />
            <Blank label="Contractor" />
          </div>
        </section>

        {/* 5. 3D views (only if the 3D view was opened) */}
        {data.snapshot3d && (
          <section className="print-page floor" data-testid="print-3d">
            <h2>3D view</h2>
            <div className="print-plan print-3d">
              <img src={data.snapshot3d.dataUrl} alt={`3D overview of the ${data.snapshot3d.floor}`} />
            </div>
            <p className="print-legend">Overview of the {data.snapshot3d.floor}, as it was when the 3D view was last open.</p>
          </section>
        )}

        {/* 6. Notes list */}
        <section className="print-page flow" data-testid="print-notes">
          <h2>Notes</h2>
          {withNotes.length === 0 ? (
            <p>No notes have been added to the plan.</p>
          ) : (
            withNotes.map((f) => (
              <div key={f.levelId}>
                <h3>{f.name}</h3>
                <ol>
                  {f.notes.map((n) => (
                    <li key={n.id}>
                      {n.kind === 'measure' ? `${NOTE_KIND_LABEL.measure} ${formatLength(noteLength(n), units)}: ` : ''}
                      {n.text}
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}
        </section>
        {/* 7. Budget */}
        <section className="print-page flow" data-testid="print-budget">
          <h2>Budget</h2>
          <h3>Summary</h3>
          <table className="print-table">
            <tbody>
              {STATUSES.map((st) => (
                <tr key={st}>
                  <td>
                    Furniture: {STATUS_LABEL[st].toLowerCase()} ({budget.summary.byStatus[st].count})
                  </td>
                  <td className="num">{formatGBP(budget.summary.byStatus[st].total)}</td>
                </tr>
              ))}
              <tr>
                <td>Furniture total</td>
                <td className="num">{formatGBP(budget.summary.furnitureTotal)}</td>
              </tr>
              <tr>
                <td>Decorating: wall paint, ceiling paint and flooring</td>
                <td className="num">{formatGBP(budget.summary.decoratingTotal)}</td>
              </tr>
              <tr>
                <td>Spare money ({budget.summary.contingencyPct}%)</td>
                <td className="num">{formatGBP(budget.summary.contingency)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Grand total</strong>
                </td>
                <td className="num">
                  <strong>{formatGBP(budget.summary.grandTotal)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <h3>Furniture list</h3>
          {budget.furniture.length === 0 ? (
            <p>No furniture has been placed yet.</p>
          ) : (
            <table className="print-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Supplier</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {budget.furniture.flatMap((f) =>
                  f.rooms.flatMap((g) => [
                    <tr key={`${f.levelId}-${g.room}`}>
                      <th colSpan={4}>
                        {f.floor}: {g.room}
                      </th>
                      <th className="num">{formatGBP(g.total)}</th>
                    </tr>,
                    ...g.rows.map((r) => (
                      <tr key={r.itemId}>
                        <td>{r.name}</td>
                        <td>{sizeText(r.dims, units)}</td>
                        <td>{STATUS_LABEL[r.status]}</td>
                        <td>{r.supplier ?? ''}</td>
                        <td className="num">{r.price !== undefined ? formatGBP(r.price) : 'not set'}</td>
                      </tr>
                    )),
                  ]),
                )}
              </tbody>
            </table>
          )}
          <p className="print-small">Prices are in pounds. Paint and flooring are rough estimates from room sizes.</p>
        </section>
      </div>
    </div>
  );
}
