import { countRender } from '../perf';
import { SettingsDialog } from './SettingsDialog';
import { useSiteMeasure } from '../sitemeasure/state';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../model/store';
import { readPlanFile, downloadDataUrl, safeFileName, flushSave } from '../model/persistence';
import { saveCopyToFile } from './saveCopy';
import { useVersionsUi } from './versionsUi';
import { createStartProject, PUBLIC_BUILD } from '../model/firstRun';
import { useSeedAvailable, useUnlock } from './UnlockDialog';
import { canvasApi } from '../editor2d/canvasApi';
import { activeLevels, groupOf } from '../model/schemes';
import type { Project } from '../model/types';
import { OptionSwitcher } from './OptionSwitcher';
import { usePrint } from '../print/state';
import { useBudgetUi } from './budgetUi';
import { UndoButton } from './UndoHistory';
import { usePalette } from './paletteState';
import { useDismiss } from './useDialogEsc';
import { useReportUi } from '../report/state';

/** Everything the floor tabs show, as one string, so a drag that changes nothing there changes nothing here. */
function tabsSignature(p: Project): string {
  return activeLevels(p)
    .map((l) => `${l.id}|${l.name}|${groupOf(l)}|${l.scheme?.name ?? ''}`)
    .join('\n');
}

/** True while the window is at most `px` wide (follows resizing and turning the iPad). */
function useMaxWidth(px: number): boolean {
  const query = `(max-width: ${px}px)`;
  const [on, setOn] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      const mq = window.matchMedia(query);
      const fn = () => setOn(mq.matches);
      mq.addEventListener('change', fn);
      fn();
      return () => mq.removeEventListener('change', fn);
    } catch {
      return undefined;
    }
  }, [query]);
  return on;
}

/** At this width (an iPad, either way up) the bar keeps only the everyday buttons; the rest sit under "More". */
const COMPACT_BAR_PX = 1100;

export function TopBar() {
  countRender('TopBar');
  // The bar only changes when the plan's name or its floor tabs do, not on every drag; re-read the plan then.
  useStore(useShallow((s) => ({ name: s.project.name, tabs: tabsSignature(s.project) })));
  const project = useStore.getState().project;
  const levelId = useStore((s) => s.levelId);
  const setLevel = useStore((s) => s.setLevel);
  const future = useStore((s) => s.future);
  const redo = useStore((s) => s.redo);
  const units = useStore((s) => s.units);
  const setUnits = useStore((s) => s.setUnits);
  const compact = useMaxWidth(COMPACT_BAR_PX);
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useDismiss(more, moreRef, () => setMore(false));
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasFlat = useSeedAvailable();
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menu, menuRef, () => {
    setMenu(false);
    setConfirmReset(false);
  });

  const current = project.levels.find((l) => l.id === levelId);
  const currentGroup = current ? groupOf(current) : '';
  const lastRedo = future[future.length - 1];

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" aria-hidden>
          ▣
        </span>
        <span className="project-name">{project.name}</span>
      </div>

      <div className="topbar-floors">
      <nav className="levels" aria-label="Floors">
        {activeLevels(project).map((l) => {
          const on = groupOf(l) === currentGroup;
          return (
            <button
              key={groupOf(l)}
              className={on ? 'level-tab on' : 'level-tab'}
              aria-pressed={on}
              title={`Show ${l.name}`}
              onClick={() => setLevel(l.id)}
            >
              {l.name}
              {l.scheme && <span className="tab-option"> · {l.scheme.name}</span>}
            </button>
          );
        })}
      </nav>
      <OptionSwitcher />
      </div>

      <div className="topbar-right">
        <button
          className="icon-btn"
          onClick={() => usePalette.getState().setOpen(true)}
          aria-label="Search"
          title="Search rooms, furniture and actions (Ctrl/⌘ K)"
          data-testid="search-button"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M12.8 12.8L17 17" />
          </svg>
        </button>
        <div className="undo-group">
          <UndoButton />
          <button
            className="btn"
            onClick={redo}
            disabled={!lastRedo}
            title={lastRedo ? `Redo: ${lastRedo.label} (Ctrl/⌘ Shift Z)` : 'Nothing to redo'}
            aria-label="Redo"
          >
            ↷ <span className="btn-text">Redo</span>
          </button>
          {!compact && (
            <button
              className="icon-btn"
              onClick={() => useVersionsUi.getState().setOpen(true)}
              aria-label="Versions"
              title="Versions: save and restore copies of your plan"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <circle cx="10" cy="10" r="7.5" />
                <path d="M10 5.5V10l3 2" />
              </svg>
            </button>
          )}
        </div>
        {!compact && (
          <>
          <button
            className="icon-btn"
            onClick={() => useBudgetUi.getState().setOpen(true)}
            aria-label="Budget and shopping list"
            title="Budget and shopping list"
            data-testid="budget-button"
          >
            £
          </button>
          <div className="segmented small" role="radiogroup" aria-label="Units">
            <button
              role="radio"
              aria-checked={units === 'metric'}
              aria-label="Metres and millimetres"
              title="Show lengths in metres and millimetres"
              className={units === 'metric' ? 'on' : ''}
              onClick={() => setUnits('metric')}
            >
              m
            </button>
            <button
              role="radio"
              aria-checked={units === 'imperial'}
              aria-label="Feet and inches"
              title="Show lengths in feet and inches"
              className={units === 'imperial' ? 'on' : ''}
              onClick={() => setUnits('imperial')}
            >
              ft
            </button>
          </div>
          <button
            className="icon-btn"
            onClick={() => useReportUi.getState().setOpen(true)}
            aria-label="Report a problem"
            title="Report a problem"
            data-testid="report-button"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 4.5h14v9H9l-3.5 3v-3H3z" />
              <path d="M10 7.2v3" />
              <path d="M10 12.2v.1" />
            </svg>
          </button>
          <button
            className="icon-btn"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={() => useStore.getState().setShortcutsOpen(true)}
          >
            ?
          </button>
          <button className="btn" title="Settings: on-site measuring, Ask Claude and layout rules" onClick={() => useStore.getState().setSettingsOpen(true)}>
            Settings
          </button>
          </>
        )}
        <SettingsDialog />
        {compact && (
          <div className="menu-wrap" ref={moreRef}>
            <button className="btn" aria-haspopup="menu" aria-expanded={more} title="More: versions, budget, units, report a problem, shortcuts and settings" onClick={() => setMore(!more)} data-testid="more-button">
              More ▾
            </button>
            {more && (
              <div className="menu" role="menu" aria-label="More">
                <button role="menuitem" title="Versions: save and restore copies of your plan" aria-label="Versions" onClick={() => { setMore(false); useVersionsUi.getState().setOpen(true); }}>
                  Versions
                </button>
                <button role="menuitem" title="Budget and shopping list" aria-label="Budget and shopping list" onClick={() => { setMore(false); useBudgetUi.getState().setOpen(true); }}>
                  Budget and shopping list
                </button>
                <button role="menuitemradio" aria-checked={units === 'metric'} title="Show lengths in metres and millimetres" aria-label="Metres and millimetres" className={units === 'metric' ? 'on' : ''} onClick={() => { setUnits('metric'); setMore(false); }}>
                  {units === 'metric' ? '● ' : '○ '}Metres and millimetres
                </button>
                <button role="menuitemradio" aria-checked={units === 'imperial'} title="Show lengths in feet and inches" aria-label="Feet and inches" className={units === 'imperial' ? 'on' : ''} onClick={() => { setUnits('imperial'); setMore(false); }}>
                  {units === 'imperial' ? '● ' : '○ '}Feet and inches
                </button>
                <button role="menuitem" title="Report a problem" aria-label="Report a problem" onClick={() => { setMore(false); useReportUi.getState().setOpen(true); }}>
                  Report a problem
                </button>
                <button role="menuitem" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => { setMore(false); useStore.getState().setShortcutsOpen(true); }}>
                  Keyboard shortcuts
                </button>
                <button role="menuitem" title="Settings: on-site measuring, Ask Claude and layout rules" aria-label="Settings" onClick={() => { setMore(false); useStore.getState().setSettingsOpen(true); }}>
                  Settings
                </button>
              </div>
            )}
          </div>
        )}
        <div className="menu-wrap" ref={menuRef}>
          <button className="btn" aria-haspopup="menu" aria-expanded={menu} title="File: save, open, print and measure" onClick={() => setMenu(!menu)}>
            File ▾
          </button>
          {menu && (
            <div
              className="menu"
              role="menu"
              aria-label="File"
            >
              <button
                role="menuitem"
                onClick={async () => {
                  setMenu(false);
                  await saveCopyToFile();
                }}
              >
                Save a copy to my computer
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  useVersionsUi.getState().setOpen(true);
                }}
              >
                Versions…
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  fileRef.current?.click();
                  setMenu(false);
                }}
              >
                Open a saved plan…
              </button>
              {hasFlat && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    useUnlock.getState().setOpen(true);
                  }}
                >
                  Open our flat…
                </button>
              )}
              <button
                role="menuitem"
                onClick={() => {
                  const url = canvasApi.exportPng();
                  const now = useStore.getState().project;
                  const L = now.levels.find((l) => l.id === levelId);
                  if (url) downloadDataUrl(url, `${safeFileName(now.name)}-${safeFileName(L?.name ?? 'plan')}.png`);
                  setMenu(false);
                }}
              >
                Export this floor as a picture (PNG)
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  useBudgetUi.getState().setOpen(true);
                }}
              >
                Budget and shopping list…
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  usePrint.getState().setOpen(true);
                }}
              >
                Print or save as PDF…
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  useStore.getState().setTourStep(0);
                }}
              >
                Show the tour again
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  useReportUi.getState().setOpen(true);
                }}
              >
                Report a problem…
              </button>
              <hr />
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  useSiteMeasure.getState().setOpen(true);
                }}
              >
                Measure on site
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  useSiteMeasure.getState().setImportOpen(true);
                }}
              >
                Import a scan…
              </button>
              <hr />
              <button
                role="menuitem"
                className="danger"
                onClick={async () => {
                  if (!confirmReset) {
                    setConfirmReset(true);
                    return;
                  }
                  setConfirmReset(false);
                  setMenu(false);
                  const fresh = await createStartProject();
                  useStore.getState().snapshotBefore('starting again');
                  useStore.getState().loadProject(fresh);
                  await flushSave();
                }}
              >
                {confirmReset
                  ? 'Click again: your changes will be lost'
                  : PUBLIC_BUILD
                    ? 'Start a new empty plan'
                    : "Start again from the agent's plan"}
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".json,.flatplan.json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const { project: p, history } = await readPlanFile(f);
                useStore.getState().snapshotBefore('opening a saved plan');
                useStore.getState().loadProject(p);
                useStore.getState().toast(`Opened “${p.name}”.`);
                if (history) useVersionsUi.getState().setOffer({ history, planName: p.name });
              } catch (err) {
                useStore.getState().toast((err as Error).message, 'warn');
              }
            }}
          />
        </div>
      </div>
    </header>
  );
}
