import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { CrashGate, ErrorBoundary, installGlobalErrorToasts } from './ui/ErrorBoundary';
import { useStore } from './model/store';
import { flushSave, loadForBoot, loadSettings, markTourSeen, startAutosave } from './model/persistence';
import { createEmptyProject, createStartProject } from './model/firstRun';
import { loadAdviceEnabled, loadApiKey } from './advice/keyStore';
import { canvasApi } from './editor2d/canvasApi';
import './ui/styles.css';

async function boot() {
  const settings = await loadSettings();
  if (settings.units) useStore.getState().setUnits(settings.units);
  if (settings.showMarkers !== undefined) useStore.getState().setShowMarkers(settings.showMarkers);
  if (settings.showAllClearances !== undefined) useStore.getState().setShowAllClearances(settings.showAllClearances);
  try {
    const [adviceOn, key] = await Promise.all([loadAdviceEnabled(), loadApiKey()]);
    useStore.getState().setAdviceState({ enabled: adviceOn, keySaved: !!key });
  } catch {
    // Ask Claude is optional; the plan opens without it.
  }
  // A start that fails (the seed cannot load) still opens an empty plan rather than the loading message forever.
  const { project, notices } = await loadForBoot(() => createStartProject().catch(() => createEmptyProject()));
  useStore.getState().loadProject(project);
  // Writes the starting plan on a first visit; does nothing when saving is paused or the plan came from storage.
  await flushSave();
  startAutosave();
  for (const n of notices) useStore.getState().toast(n.text, n.tone);
  // First run: a short tour. `?notour` in the address skips it (tests, demos).
  if (!settings.tourSeen && !/[?&]notour\b/.test(window.location.search)) useStore.getState().setTourStep(0);
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

installGlobalErrorToasts();
createRoot(document.getElementById('root') ?? document.body).render(
  <StrictMode>
    <ErrorBoundary>
      <CrashGate>
        <App />
      </CrashGate>
    </ErrorBoundary>
  </StrictMode>,
);
boot().catch((e) => {
  // Last resort: never leave "Opening your plan…" on screen for good.
  console.error('Flat Planner could not start', e);
  if (!useStore.getState().ready) useStore.getState().loadProject(createEmptyProject());
  useStore.getState().toast('Flat Planner had trouble starting. Your saved plan has not been changed.', 'warn');
});
