import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { useStore } from './model/store';
import { flushSave, loadSavedProject, loadSettings, markTourSeen, startAutosave } from './model/persistence';
import { createStartProject } from './model/firstRun';
import { loadAdviceEnabled, loadApiKey } from './advice/keyStore';
import { canvasApi } from './editor2d/canvasApi';
import './ui/styles.css';

async function boot() {
  const settings = await loadSettings();
  if (settings.units) useStore.getState().setUnits(settings.units);
  if (settings.showMarkers !== undefined) useStore.getState().setShowMarkers(settings.showMarkers);
  if (settings.showAllClearances !== undefined) useStore.getState().setShowAllClearances(settings.showAllClearances);
  const [adviceOn, key] = await Promise.all([loadAdviceEnabled(), loadApiKey()]);
  useStore.getState().setAdviceState({ enabled: adviceOn, keySaved: !!key });
  const saved = await loadSavedProject();
  const project = saved ?? (await createStartProject());
  useStore.getState().loadProject(project);
  if (!saved) await flushSave();
  startAutosave();
  // First run: a short tour. `?notour` in the address skips it (tests, demos).
  if (!settings.tourSeen && !/[?&]notour\b/.test(window.location.search)) useStore.getState().setTourStep(0);
  window.addEventListener('pagehide', () => void flushSave());
}

if (import.meta.env.DEV) {
  // Test and debugging hooks.
  (window as unknown as Record<string, unknown>).__flatplan = {
    store: useStore,
    canvas: canvasApi,
    flushSave,
    skipTour: () => {
      useStore.getState().setTourStep(null);
      return markTourSeen();
    },
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
void boot();
