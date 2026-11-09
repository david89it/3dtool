import { SettingsDialog } from './SettingsDialog';
import { useRef, useState } from 'react';
import { useStore } from '../model/store';
import { exportProjectFile, readProjectFile, downloadDataUrl, safeFileName, flushSave } from '../model/persistence';
import { createSeedProject } from '../model/seedAssets';
import { canvasApi } from '../editor2d/canvasApi';

export function TopBar() {
  const project = useStore((s) => s.project);
  const levelId = useStore((s) => s.levelId);
  const setLevel = useStore((s) => s.setLevel);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const units = useStore((s) => s.units);
  const setUnits = useStore((s) => s.setUnits);
  const [menu, setMenu] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const lastUndo = past[past.length - 1];
  const lastRedo = future[future.length - 1];

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" aria-hidden>
          ▣
        </span>
        <span className="project-name">{project.name}</span>
      </div>

      <nav className="levels" aria-label="Floors">
        {project.levels.map((l) => (
          <button
            key={l.id}
            className={l.id === levelId ? 'level-tab on' : 'level-tab'}
            aria-pressed={l.id === levelId}
            onClick={() => setLevel(l.id)}
          >
            {l.name}
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        <div className="undo-group">
          <button
            className="btn"
            onClick={undo}
            disabled={!lastUndo}
            title={lastUndo ? `Undo: ${lastUndo.label} (Ctrl/⌘ Z)` : 'Nothing to undo'}
            aria-label="Undo"
          >
            ↶ Undo
          </button>
          <button
            className="btn"
            onClick={redo}
            disabled={!lastRedo}
            title={lastRedo ? `Redo: ${lastRedo.label} (Ctrl/⌘ Shift Z)` : 'Nothing to redo'}
            aria-label="Redo"
          >
            ↷ Redo
          </button>
        </div>
        <div className="segmented small" role="radiogroup" aria-label="Units">
          <button role="radio" aria-checked={units === 'metric'} className={units === 'metric' ? 'on' : ''} onClick={() => setUnits('metric')}>
            m
          </button>
          <button role="radio" aria-checked={units === 'imperial'} className={units === 'imperial' ? 'on' : ''} onClick={() => setUnits('imperial')}>
            ft
          </button>
        </div>
        <button className="btn" onClick={() => useStore.getState().setSettingsOpen(true)}>
          Settings
        </button>
        <SettingsDialog />
        <div className="menu-wrap">
          <button className="btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            File ▾
          </button>
          {menu && (
            <div
              className="menu"
              role="menu"
              onMouseLeave={() => {
                setMenu(false);
                setConfirmReset(false);
              }}
            >
              <button
                role="menuitem"
                onClick={() => {
                  exportProjectFile(useStore.getState().project);
                  setMenu(false);
                }}
              >
                Save a copy to my computer
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
              <button
                role="menuitem"
                onClick={() => {
                  const url = canvasApi.exportPng();
                  const L = project.levels.find((l) => l.id === levelId);
                  if (url) downloadDataUrl(url, `${safeFileName(project.name)}-${safeFileName(L?.name ?? 'plan')}.png`);
                  setMenu(false);
                }}
              >
                Export this floor as a picture (PNG)
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
                  const seed = await createSeedProject();
                  useStore.getState().loadProject(seed);
                  await flushSave();
                }}
              >
                {confirmReset ? 'Click again: your changes will be lost' : "Start again from the agent's plan"}
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
                const p = await readProjectFile(f);
                useStore.getState().loadProject(p);
                useStore.getState().toast(`Opened “${p.name}”.`);
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
