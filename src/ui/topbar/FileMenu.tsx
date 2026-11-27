import { useSiteMeasure } from '../../sitemeasure/state';
import { useRef, useState } from 'react';
import { useStore } from '../../model/store';
import { readPlanFile, downloadDataUrl, safeFileName, flushSave } from '../../model/persistence';
import { saveCopyToFile } from '../saveCopy';
import { useVersionsUi } from '../versionsUi';
import { createStartProject, PUBLIC_BUILD } from '../../model/firstRun';
import { useSeedAvailable, useUnlock } from '../UnlockDialog';
import { canvasApi } from '../../editor2d/canvasApi';
import { usePrint } from '../../print/state';
import { useBudgetUi } from '../budgetUi';
import { useDismiss } from '../useDialogEsc';
import { useReportUi } from '../../report/state';

export function FileMenu() {
  const levelId = useStore((s) => s.levelId);
  const [menu, setMenu] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasFlat = useSeedAvailable();
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menu, menuRef, () => {
    setMenu(false);
    setConfirmReset(false);
  });
  return (
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
  );
}
