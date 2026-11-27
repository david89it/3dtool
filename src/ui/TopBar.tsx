import { FloorTabs } from './topbar/FloorTabs';
import { WideButtons } from './topbar/WideButtons';
import { MoreMenu } from './topbar/MoreMenu';
import { FileMenu } from './topbar/FileMenu';
import { countRender } from '../perf';
import { SettingsDialog } from './SettingsDialog';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../model/store';
import { useVersionsUi } from './versionsUi';
import { activeLevels, groupOf } from '../model/schemes';
import type { Project } from '../model/types';
import { UndoButton } from './UndoHistory';
import { usePalette } from './paletteState';

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
  const future = useStore((s) => s.future);
  const redo = useStore((s) => s.redo);
  const compact = useMaxWidth(COMPACT_BAR_PX);

  const lastRedo = future[future.length - 1];

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" aria-hidden>
          ▣
        </span>
        <span className="project-name">{project.name}</span>
      </div>

      <FloorTabs project={project} />

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
        {!compact && <WideButtons />}
        <SettingsDialog />
        {compact && <MoreMenu />}
        <FileMenu />
      </div>
    </header>
  );
}
