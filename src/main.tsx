import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { useStore } from './model/store';
import { flushSave, loadSavedProject, loadSettings, startAutosave } from './model/persistence';
import { createSeedProject } from './model/seedAssets';
import { canvasApi } from './editor2d/canvasApi';
import './ui/styles.css';

async function boot() {
  const settings = await loadSettings();
  if (settings.units) useStore.getState().setUnits(settings.units);
  if (settings.showMarkers !== undefined) useStore.getState().setShowMarkers(settings.showMarkers);
  const saved = await loadSavedProject();
  const project = saved ?? (await createSeedProject());
  useStore.getState().loadProject(project);
  if (!saved) await flushSave();
  startAutosave();
  window.addEventListener('pagehide', () => void flushSave());
}

if (import.meta.env.DEV) {
  // Test and debugging hooks.
  (window as unknown as Record<string, unknown>).__flatplan = { store: useStore, canvas: canvasApi, flushSave };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
void boot();
