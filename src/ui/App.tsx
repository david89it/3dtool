import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../model/store';
import { useLayout, watchWidth } from './layoutState';
import { PanelSlot } from './PanelSlot';
import { PlanCanvas } from '../editor2d/PlanCanvas';
import { canvasApi } from '../editor2d/canvasApi';
import { deleteWall } from '../geometry/wallGraph';
import type { Level } from '../model/types';
import { deleteSelected, duplicateSelected, turnSelected } from '../editor2d/selectionActions';
import { usePalette } from './paletteState';
import { toggleThreeD } from './modeToggle';
import { deleteOpening } from '../geometry/openingEdits';
import { deleteNote } from '../model/notes';
import { isStructural } from '../geometry/openings';
import { currentLevel } from '../model/store';
import { STRUCTURAL_DELETE_WARNING } from './Inspector';
import { TopBar } from './TopBar';
import { ModeBar } from './ModeBar';
import { LeftPanel } from './LeftPanel';
import { Inspector } from './Inspector';
import { Toasts } from './Toasts';
import { ErrorBoundary, SelectionBoundary } from './ErrorBoundary';
import { Tour } from './Tour';
import { Shortcuts } from './Shortcuts';
import { markTourSeen } from '../model/persistence';
import { useSiteMeasure } from '../sitemeasure/state';
import { useVersionsUi } from './versionsUi';
import { useBudgetUi } from './budgetUi';
import { EmptyStart, UnlockDialog } from './UnlockDialog';
import { ReportDialog } from './ReportDialog';
import { usePrint } from '../print/state';

// three.js only loads when she first opens 3D, so the plan editor starts fast.
const View3D = lazy(() => import('../view3d/View3D').then((m) => ({ default: m.View3D })));

// Everything that is not on screen at first paint loads the first time it is opened (each of these
// draws nothing while closed, so mounting it late changes nothing she can see).
const PrintPack = lazy(() => import('../print/PrintPack').then((m) => ({ default: m.PrintPack })));
const BudgetPanel = lazy(() => import('./BudgetPanel').then((m) => ({ default: m.BudgetPanel })));
const CommandPalette = lazy(() => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })));
const VersionsPanel = lazy(() => import('./VersionsPanel').then((m) => ({ default: m.VersionsPanel })));
const VersionImportPrompt = lazy(() => import('./VersionsPanel').then((m) => ({ default: m.VersionImportPrompt })));
const SiteMeasure = lazy(() => import('../sitemeasure/SiteMeasure').then((m) => ({ default: m.SiteMeasure })));
const ScanGuide = lazy(() => import('../sitemeasure/ScanGuide').then((m) => ({ default: m.ScanGuide })));
const ScanImport = lazy(() => import('../import/ScanImport').then((m) => ({ default: m.ScanImport })));

/** Mounts its children (and so loads their code) from the first time `when` is true, and keeps them mounted after. */
function Deferred({ when, children }: { when: boolean; children: ReactNode }) {
  const [seen, setSeen] = useState(when);
  if (when && !seen) setSeen(true);
  return seen ? <Suspense fallback={null}>{children}</Suspense> : null;
}

function DeferredPanels() {
  const measure = useSiteMeasure((s) => s.open);
  const guide = useSiteMeasure((s) => s.guideOpen);
  const scan = useSiteMeasure((s) => s.importOpen);
  const versions = useVersionsUi((s) => s.open);
  const offer = useVersionsUi((s) => !!s.offer);
  const budget = useBudgetUi((s) => s.open);
  return (
    <>
      <Deferred when={measure}>
        <SiteMeasure />
      </Deferred>
      <Deferred when={scan}>
        <ScanImport />
      </Deferred>
      <Deferred when={guide}>
        <ScanGuide />
      </Deferred>
      <Deferred when={versions}>
        <VersionsPanel />
      </Deferred>
      <Deferred when={offer}>
        <VersionImportPrompt />
      </Deferred>
      <Deferred when={budget}>
        <BudgetPanel />
      </Deferred>
    </>
  );
}

function DeferredPalette() {
  const open = usePalette((s) => s.open);
  return (
    <Deferred when={open}>
      <CommandPalette />
    </Deferred>
  );
}

function DeferredPrint() {
  const open = usePrint((s) => s.open);
  return (
    <Deferred when={open}>
      <PrintPack />
    </Deferred>
  );
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Search works from anywhere, even while typing in a field.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        usePalette.getState().toggle();
        return;
      }
      if (isTyping(e)) return;
      // The print view is on top: it handles its own keys (Esc closes it) and the plan must not react.
      if (usePrint.getState().open) return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd' && (s.selection?.kind === 'item' || s.selection?.kind === 'items')) {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod) return;
      if (e.key === '?') {
        e.preventDefault();
        s.setShortcutsOpen(!s.shortcutsOpen);
        return;
      }
      if (e.key === 'Escape' && s.shortcutsOpen) {
        s.setShortcutsOpen(false);
        return;
      }
      if (e.key === 'Escape' && s.tourStep !== null) {
        s.setTourStep(null);
        void markTourSeen();
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleThreeD();
        return;
      }
      if (s.mode === '3d') return;
      if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        useLayout.getState().toggle(e.key === '[' ? 'left' : 'right');
        return;
      }
      if (e.key === 'Escape') {
        canvasApi.escape();
        s.setHighlight(null);
      }
      else if (e.key === 'Enter' && s.tool === 'draw') canvasApi.finishTrace();
      else if (e.key === 'v' || e.key === 'V') s.setTool('select');
      else if ((e.key === 'w' || e.key === 'W') && s.mode === 'trace') s.setTool('draw');
      else if (e.key === 'f' || e.key === 'F') canvasApi.fit();
      else if ((e.key === 'r' || e.key === 'R' || e.code === 'KeyR') && (s.selection?.kind === 'item' || s.selection?.kind === 'items')) {
        // Alt (Option on a Mac, where e.key becomes "®") turns in 15° steps.
        e.preventDefault();
        const step = e.altKey ? 15 : 90;
        turnSelected(e.shiftKey ? -step : step);
      }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection) {
        const sel = s.selection;
        if (sel.kind === 'wall') {
          e.preventDefault();
          const w = currentLevel()?.walls.find((x) => x.id === sel.id);
          s.snapshotBefore('deleting a wall');
          s.editLevel('Delete wall', (L) => deleteWall(L as Level, sel.id));
          s.select(null);
          if (w && isStructural(w)) s.toast(STRUCTURAL_DELETE_WARNING, 'warn');
        } else if (sel.kind === 'item' || sel.kind === 'items') {
          e.preventDefault();
          deleteSelected();
        } else if (sel.kind === 'opening') {
          e.preventDefault();
          s.editLevel('Remove opening', (L) => deleteOpening(L as Level, sel.id));
          s.select(null);
        } else if (sel.kind === 'note') {
          e.preventDefault();
          s.editLevel('Remove note', (L) => deleteNote(L as Level, sel.id));
          s.select(null);
        } else if (sel.kind === 'marker') {
          e.preventDefault();
          s.editLevel('Remove pin', (L) => void (L.markers = (L.markers ?? []).filter((m) => m.id !== sel.id)));
          s.select(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const ready = useStore((s) => s.ready);
  const mode = useStore((s) => s.mode);
  const left = useLayout((s) => s.left);
  const right = useLayout((s) => s.right);
  const narrow = useLayout((s) => s.narrow);
  useShortcuts();
  useEffect(() => watchWidth(), []);
  if (!ready) return <div className="loading">Opening your plan…</div>;
  return (
    <>
    <div className="app">
      <TopBar />
      <ModeBar />
      {mode === '3d' ? (
        <main className="workspace three">
          <ErrorBoundary scope="view">
            <Suspense fallback={<div className="loading">Building the 3D view…</div>}>
              <View3D />
            </Suspense>
          </ErrorBoundary>
        </main>
      ) : (
        <main className={`workspace${left ? '' : ' left-collapsed'}${right ? '' : ' right-collapsed'}${narrow ? ' narrow' : ''}`}>
          <PanelSlot side="left">
            <ErrorBoundary scope="panel">
              <LeftPanel />
            </ErrorBoundary>
          </PanelSlot>
          <PlanCanvas />
          <PanelSlot side="right">
            <SelectionBoundary>
              <Inspector />
            </SelectionBoundary>
          </PanelSlot>
          {narrow && (left || right) && <div className="panel-scrim" data-testid="panel-scrim" onPointerDown={() => useLayout.getState().closeAll()} />}
        </main>
      )}
      <Toasts />
      <Tour />
      <Shortcuts />
      <EmptyStart />
      <UnlockDialog />
      <ReportDialog />
      <DeferredPanels />
      <DeferredPalette />
    </div>
    <DeferredPrint />
    </>
  );
}
