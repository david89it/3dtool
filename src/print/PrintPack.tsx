// The engineer and landlord pack: a full-screen view laid out as A4
// landscape pages, with print styles so "Print / Save as PDF" gives a clean
// document. It sits outside the editor layout and shares nothing with the
// canvas except canvasApi.renderLevelImage (the plan pictures).

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../model/store';
import { canvasApi } from '../editor2d/canvasApi';
import { formatLength } from '../model/units';
import { noteLength, NOTE_KIND_LABEL } from '../model/notes';
import { STRUCTURAL_BADGE_TEXT } from '../geometry/openings';
import { renderOverview3D } from '../view3d/captureBridge';
import { readIndex, getResolvedVersion, relativeTime, type VersionMeta, runJob } from '../model/versions';
import { validateProject } from '../model/persistence';
import type { Project } from '../model/types';
import { buildBudget, formatGBP, sizeText, STATUSES, STATUS_LABEL } from '../model/costs';
import {
  compareProjects,
  defaultVersionId,
  describeOpeningChange,
  ghostOutlines,
  orderVersions,
  engineerLine,
  removedWallChecklist,
  removedWallLine,
} from './compare';
import { buildFloors, buildStructuralRows, engineerChecklist, KIND_LABEL, type StructuralRow } from './pack';
import { usePrint } from './state';

const Offscreen3D = lazy(() => import('../view3d/Offscreen3D').then((m) => ({ default: m.Offscreen3D })));
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
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    };
  });
  const { project, units, floors, rows, budget } = data;
  const printableFloors = useMemo(() => floors.filter((f) => f.hasWalls), [floors]);

  // ---- which saved version to compare with ----
  const compareId = usePrint((s) => s.compareId);
  const setCompareId = usePrint((s) => s.setCompareId);
  const [metas, setMetas] = useState<VersionMeta[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void runJob('Could not read your versions.', (kv) => readIndex(kv), { quiet: true }).then((m) => {
      if (!cancelled) setMetas(m ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const ordered = useMemo(() => orderVersions(metas ?? []), [metas]);
  const chosenId = useMemo(() => {
    if (!metas) return null;
    const want = compareId === undefined ? defaultVersionId(metas) : compareId;
    return want && metas.some((m) => m.id === want) ? want : null;
  }, [metas, compareId]);
  const chosenMeta = metas?.find((m) => m.id === chosenId) ?? null;

  // The chosen version's plan, loaded when the choice changes. `loaded` says which choice it answers.
  const [before, setBefore] = useState<{ id: string | null; project: Project | null }>({ id: null, project: null });
  useEffect(() => {
    if (!chosenId) {
      setBefore({ id: null, project: null });
      return;
    }
    let cancelled = false;
    void runJob('Could not read that version.', (kv) => getResolvedVersion(kv, chosenId), { quiet: true }).then((found) => {
      if (cancelled) return;
      let p: Project | null = null;
      try {
        p = found ? validateProject(found.version.project) : null;
      } catch {
        p = null;
      }
      setBefore({ id: chosenId, project: p });
    });
    return () => {
      cancelled = true;
    };
  }, [chosenId]);
  const beforeProject = before.id === chosenId ? before.project : null;
  const comparing = !!chosenId && !!beforeProject;
  const comparison = useMemo(() => (beforeProject ? compareProjects(beforeProject, project) : null), [beforeProject, project]);
  const loadingCompare = !metas || (!!chosenId && before.id !== chosenId);
  const ghostKey = comparison ? comparison.removedWalls.map((w) => w.wallId).join(',') : '';

  // ---- plan pictures (2D), drawn one after another so the page stays responsive ----
  const [images, setImages] = useState<Record<string, string | null>>({});
  const ready = printableFloors.every((f) => f.levelId in images) && !loadingCompare;
  useEffect(() => {
    if (loadingCompare) return;
    let cancelled = false;
    setImages({});
    (async () => {
      for (const f of printableFloors) {
        const url = await canvasApi.renderLevelImage(f.levelId, {
          width: IMG_W,
          height: IMG_H,
          pixelRatio: PIXEL_RATIO,
          ghostWalls: ghostOutlines(comparison, f.levelId),
        });
        if (cancelled) return;
        setImages((prev) => ({ ...prev, [f.levelId]: url }));
      }
    })().catch(() => {
      if (!cancelled) setImages(Object.fromEntries(printableFloors.map((f) => [f.levelId, null])));
    });
    return () => {
      cancelled = true;
    };
    // comparison is summarised by ghostKey so a new object with the same walls does not redraw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printableFloors, ghostKey, loadingCompare]);

  // ---- 3D pictures: the plan now for every floor, and the version for floors that changed ----
  // Drawn by an offscreen renderer (Offscreen3D), one at a time. A failure leaves a short note, never blocks printing.
  const [shots, setShots] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const f of printableFloors) {
        const url = await renderOverview3D({ project, levelId: f.levelId });
        if (cancelled) return;
        setShots((prev) => ({ ...prev, [`after:${f.levelId}`]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [printableFloors, project]);
  const changedKey = comparison ? comparison.changedLevelIds.join(',') : '';
  useEffect(() => {
    if (!beforeProject || !comparison) return;
    let cancelled = false;
    (async () => {
      for (const f of printableFloors) {
        if (!comparison.changedLevelIds.includes(f.levelId)) continue;
        const url = await renderOverview3D({ project: beforeProject, levelId: f.levelId });
        if (cancelled) return;
        setShots((prev) => ({ ...prev, [`before:${chosenId}:${f.levelId}`]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printableFloors, beforeProject, changedKey]);
  const shotsPending =
    printableFloors.some((f) => !(`after:${f.levelId}` in shots)) ||
    (comparison?.changedLevelIds ?? []).some(
      (id) => printableFloors.some((f) => f.levelId === id) && !(`before:${chosenId}:${id}` in shots),
    );

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
  const removed = comparison?.removedWalls ?? [];
  const anyChange = allChanges.length > 0 || (!!comparison && (removed.length > 0 || comparison.openedUp.length > 0 || comparison.removedOpenings.length > 0));
  const checklist = [...data.checklist, ...removedWallChecklist(comparison)];
  const versionLabel = chosenMeta ? `${chosenMeta.name} (${relativeTime(chosenMeta.createdAt, Date.now())})` : '';
  const withNotes = floors.filter((f) => f.notes.length > 0);
  const hasStructural = rows.length > 0;

  return (
    <div className="print-root" role="dialog" aria-label="Print or save as PDF" data-testid="print-view">
      <div className="print-toolbar">
        <div>
          <strong>Print or save as PDF</strong>
          <span className="print-status" role="status">
            {!ready
              ? 'Drawing the plans…'
              : shotsPending
                ? 'Preparing 3D views… You can print now; any 3D picture still missing will show a short note.'
                : 'Ready. In the print window, choose “Save as PDF” as the printer.'}
          </span>
        </div>
        <div className="print-toolbar-actions">
          <label className="print-compare">
            Compare with
            <select
              data-testid="compare-select"
              value={chosenId ?? 'none'}
              onChange={(e) => setCompareId(e.target.value === 'none' ? null : e.target.value)}
              disabled={!metas}
            >
              <option value="none">Nothing (no comparison)</option>
              {ordered.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({relativeTime(m.createdAt, Date.now())})
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary" disabled={!ready} onClick={() => window.print()}>
            Print / Save as PDF
          </button>
          <button className="btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>

      {printableFloors.length > 0 && (
        <Suspense fallback={null}>
          <Offscreen3D />
        </Suspense>
      )}

      <div className="print-pages">
        {/* 1. Cover */}
        <section className="print-page cover" data-testid="print-cover">
          <p className="print-kicker">Plans for the structural engineer and the landlord</p>
          <h1>{project.name}</h1>
          <p className="print-date">{data.date}</p>
          <h2>What we propose to change</h2>
          {!anyChange ? (
            <p>
              {comparing
                ? `Nothing has changed since ${versionLabel}. This pack shows the plans as they are.`
                : 'No new openings have been drawn yet. This pack shows the plans as they are.'}
            </p>
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
          {comparison && (
            <div data-testid="print-comparison">
              <p className="print-small">Compared with {versionLabel}.</p>
              <h3>Walls removed</h3>
              {removed.length === 0 ? (
                <p>No walls are removed.</p>
              ) : (
                <ul data-testid="print-walls-removed">
                  {removed.map((w) => (
                    <li key={w.levelId + w.wallId}>{removedWallLine(w, units)}</li>
                  ))}
                </ul>
              )}
              <h3>New or widened openings</h3>
              {comparison.openedUp.length === 0 ? (
                <p>None.</p>
              ) : (
                <ul>
                  {comparison.openedUp.map((c, i) => (
                    <li key={i}>
                      {c.floor}: {describeOpeningChange(c, units)}
                    </li>
                  ))}
                </ul>
              )}
              <h3>Openings removed</h3>
              {comparison.removedOpenings.length === 0 ? (
                <p>None.</p>
              ) : (
                <ul>
                  {comparison.removedOpenings.map((c, i) => (
                    <li key={i}>
                      {c.floor}: {describeOpeningChange(c, units)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
              Lengths are inside faces of the walls. A ⚠ pin marks an opening that may be structural.
              {comparing && ' Dashed red outlines show walls that are taken out.'} The scale bar is correct at any print size.
            </p>
          </section>
        ))}

        {/* 3. Structural */}
        <section className="print-page flow" data-testid="print-structural">
          <h2>Structural</h2>
          <p className="print-callout">⚠ {STRUCTURAL_BADGE_TEXT}</p>
          {comparison && (
            <div data-testid="print-removed-table">
              <h3>Walls removed</h3>
              {removed.length === 0 ? (
                <p>No walls are removed compared with {versionLabel}.</p>
              ) : (
                <table className="print-table">
                  <thead>
                    <tr>
                      <th>Floor</th>
                      <th>Where</th>
                      <th>Wall</th>
                      <th>Length</th>
                      <th>Thickness</th>
                      <th>Structural note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {removed.map((w) => (
                      <tr key={w.levelId + w.wallId} data-testid="removed-wall-row">
                        <td>{w.floor}</td>
                        <td>{w.location}</td>
                        <td>{KIND_LABEL[w.kind]}</td>
                        <td>{formatLength(w.length, units)}</td>
                        <td>{formatLength(w.thickness, units)}</td>
                        <td>
                          {w.note}
                          <br />
                          <strong>{engineerLine(w)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <h3>New openings</h3>
            </div>
          )}
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
            {checklist.map((t, i) => (
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
          {!anyChange ? (
            <p>No changes to walls have been drawn yet.</p>
          ) : (
            <ul>
              {removed.map((w) => (
                <li key={w.levelId + w.wallId}>
                  <strong>{w.floor}:</strong> Remove the {w.location.charAt(0).toLowerCase() + w.location.slice(1)} ({formatLength(w.length, units)} long).
                </li>
              ))}
              {allChanges.map((c, i) => (
                <li key={i}>
                  <strong>{c.floor}:</strong> {c.text}
                </li>
              ))}
            </ul>
          )}
          {(hasStructural || removed.some((w) => w.needsEngineer)) && (
            <p>
              Some of this work may involve load-bearing walls. A structural engineer will check them, and Building
              Control will be told before work starts. The engineer’s page is attached.
            </p>
          )}
          <div className="print-blanks">
            <Blank label="Freeholder / landlord" />
            <Blank label="Lease reference" />
            <Blank label="Contractor" />
          </div>
        </section>

        {/* 5. 3D views: one page per floor; before and after side by side for floors that changed */}
        {printableFloors.map((f) => {
          const afterKey = `after:${f.levelId}`;
          const beforeKey = `before:${chosenId}:${f.levelId}`;
          const pair = !!comparison && comparison.changedLevelIds.includes(f.levelId);
          const pic = (key: string, label: string) => (
            <figure className="print-shot">
              <div className="print-plan print-3d">
                {shots[key] ? (
                  <img src={shots[key]!} alt={label} />
                ) : (
                  <p className="print-wait">{key in shots ? 'The 3D picture could not be drawn.' : 'Preparing 3D views…'}</p>
                )}
              </div>
              <figcaption className="print-legend">{label}</figcaption>
            </figure>
          );
          return (
            <section key={f.levelId} className="print-page floor" data-testid="print-3d">
              <h2>3D view: {f.name}</h2>
              {pair ? (
                <div className="print-pair">
                  {pic(beforeKey, `Before (${chosenMeta?.name ?? 'saved version'})`)}
                  {pic(afterKey, 'After (the plan now)')}
                </div>
              ) : (
                pic(afterKey, `The ${f.name}, seen from above with the walls cut away.`)
              )}
            </section>
          );
        })}

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
