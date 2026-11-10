import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../model/types';
import { useStore } from '../model/store';
import { formatLength, parseLength } from '../model/units';
import { applyStep, buildSteps, parseStepId, viewStep, type StepView } from './steps';
import { countStatus, loadSession, useSiteMeasure, type Session, type StepStatus } from './state';
import { MiniPlan } from './MiniPlan';
import './sitemeasure.css';

/** Start a session, or carry on the saved one with anything new added at the end. */
function merge(project: Project, saved: Session | null): Session {
  const ids = buildSteps(project).map((s) => s.id);
  if (!saved) return { stepIds: ids, status: {}, index: 0 };
  const known = new Set(saved.stepIds);
  return { ...saved, stepIds: [...saved.stepIds, ...ids.filter((id) => !known.has(id))] };
}

export function SiteMeasure() {
  const open = useSiteMeasure((s) => s.open);
  const session = useSiteMeasure((s) => s.session);
  const setSession = useSiteMeasure((s) => s.setSession);
  const setOpen = useSiteMeasure((s) => s.setOpen);
  const setGuideOpen = useSiteMeasure((s) => s.setGuideOpen);
  const project = useStore((s) => s.project);
  const units = useStore((s) => s.units);
  const canUndo = useStore((s) => s.past.length > 0);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load or start the checklist when opened.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadSession().then((saved) => {
      if (!cancelled) setSession(merge(useStore.getState().project, saved));
    });
    return () => {
      cancelled = true;
    };
  }, [open, setSession]);

  // The current step, skipping things that no longer exist.
  const view: StepView | null = useMemo(() => {
    if (!session) return null;
    for (let i = session.index; i < session.stepIds.length; i++) {
      const v = viewStep(project, parseStepId(session.stepIds[i]));
      if (v) return v;
    }
    return null;
  }, [project, session]);

  // Keep the main plan on the floor being measured, so undo lands there too.
  useEffect(() => {
    if (open && view && useStore.getState().levelId !== view.levelId) useStore.getState().setLevel(view.levelId);
  }, [open, view]);

  useEffect(() => {
    setText('');
    setError(null);
    if (view && view.kind !== 'pin') inputRef.current?.focus();
  }, [view?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const fmt = (mm: number) => formatLength(mm, units);
  const total = session?.stepIds.length ?? 0;
  const measured = session ? countStatus(session, 'done') : 0;

  const go = (status: StepStatus | null, delta = 1) => {
    if (!session || !view) return;
    const at = session.stepIds.indexOf(view.id);
    const nextStatus = { ...session.status };
    if (status) nextStatus[view.id] = status;
    setSession({ ...session, status: nextStatus, index: Math.max(0, Math.min(session.stepIds.length, at + delta)) });
  };
  const back = () => {
    if (!session) return;
    const at = view ? session.stepIds.indexOf(view.id) : session.stepIds.length;
    setSession({ ...session, index: Math.max(0, at - 1) });
  };

  const save = () => {
    if (!view) return;
    const mm = parseLength(text, units, view.kind === 'wallThickness' ? 'small' : 'length');
    if (mm === null) {
      setError(units === 'metric' ? 'Type a size, for example 3.32 m or 332 cm' : 'Type a size, for example 10′ 11″');
      return;
    }
    // Check on a copy first so a refused value leaves nothing to undo.
    const problem = applyStep(structuredClone(useStore.getState().project) as Project, view, mm, fmt);
    if (problem) {
      setError(problem);
      return;
    }
    useStore.getState().commit(`Measured: ${view.question.replace(/\?$/, '')}`, (d) => void applyStep(d as Project, view, mm, fmt));
    go('done');
  };

  const removePin = () => {
    if (!view) return;
    useStore.getState().commit('Remove pin', (d) => void applyStep(d as Project, view, 0, fmt));
    go('done');
  };

  const level = view ? project.levels.find((l) => l.id === view.levelId) : undefined;

  return (
    <div className="sm-overlay" role="dialog" aria-label="Measure on site">
      <header className="sm-head">
        <button className="btn" onClick={() => setOpen(false)}>
          Close
        </button>
        <div className="sm-progress" aria-live="polite">
          <strong data-testid="sm-progress">
            {measured} of {total} measured
          </strong>
          <div className="sm-bar" aria-hidden>
            <span style={{ width: `${total ? (measured / total) * 100 : 0}%` }} />
          </div>
        </div>
        <button className="btn" aria-label="Undo last change" onClick={() => useStore.getState().undo()} disabled={!canUndo}>
          Undo
        </button>
      </header>

      {view && level ? (
        <main className="sm-body">
          <div className="sm-floor">{view.floor}</div>
          <MiniPlan level={level} highlight={view.highlight} />
          <h2 className="sm-question" data-testid="sm-question">
            {view.question}
          </h2>
          {view.hint && <p className="sm-hint">{view.hint}</p>}
          {view.kind === 'pin' ? (
            <div className="sm-actions">
              <button className="btn primary big" onClick={removePin}>
                Done, remove pin
              </button>
            </div>
          ) : (
            <form
              className="sm-form"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              {view.current !== undefined && <div className="sm-current">Now ≈ {fmt(view.current)}</div>}
              <input
                ref={inputRef}
                className="sm-input"
                inputMode="decimal"
                autoComplete="off"
                aria-label="Measurement"
                placeholder={units === 'metric' ? 'e.g. 3.32 m' : 'e.g. 10′ 11″'}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => e.stopPropagation()}
              />
              {error && <p className="error">{error}</p>}
              <button type="submit" className="btn primary big">
                Save
              </button>
            </form>
          )}
          <div className="sm-nav">
            <button className="btn" onClick={back} disabled={!session || session.stepIds.indexOf(view.id) === 0}>
              Back
            </button>
            <button className="btn" onClick={() => go('skipped')}>
              Skip
            </button>
            <button className="btn" onClick={() => go('cant')}>
              Can’t measure
            </button>
          </div>
        </main>
      ) : (
        <main className="sm-body sm-done">
          <h2>{total === 0 ? 'Nothing left to measure' : 'All through the list'}</h2>
          {session && total > 0 && (
            <p>
              {measured} measured, {countStatus(session, 'skipped')} skipped, {countStatus(session, 'cant')} couldn’t be measured.
            </p>
          )}
          <div className="sm-actions">
            {session && total > 0 && (
              <button className="btn" onClick={back}>
                Go back through the list
              </button>
            )}
            <button className="btn" onClick={() => setSession({ stepIds: buildSteps(useStore.getState().project).map((s) => s.id), status: {}, index: 0 })}>
              Start again with what is still estimated
            </button>
            <button className="btn primary" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </main>
      )}

      <footer className="sm-foot">
        <button className="btn link" onClick={() => setGuideOpen(true)}>
          Scan with an iPhone or iPad Pro (LiDAR) instead
        </button>
      </footer>
    </div>
  );
}
