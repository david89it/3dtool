import { lazy, Suspense, useEffect } from 'react';
import { useStore, type Mode } from '../model/store';
import { PlanCanvas } from '../editor2d/PlanCanvas';
import { canvasApi } from '../editor2d/canvasApi';
import { deleteWall } from '../geometry/wallGraph';
import type { Level, PlacedItem } from '../model/types';
import { duplicateItem, rotateBy } from '../editor2d/itemOps';
import { deleteOpening } from '../geometry/openingEdits';
import { isStructural } from '../geometry/openings';
import { currentLevel } from '../model/store';
import { STRUCTURAL_DELETE_WARNING } from './Inspector';
import { TopBar } from './TopBar';
import { ModeBar } from './ModeBar';
import { LeftPanel } from './LeftPanel';
import { Inspector } from './Inspector';
import { Toasts } from './Toasts';
import { Tour } from './Tour';
import { Shortcuts } from './Shortcuts';
import { markTourSeen } from '../model/persistence';
import { SiteMeasure } from '../sitemeasure/SiteMeasure';
import { ScanGuide } from '../sitemeasure/ScanGuide';
import { ScanImport } from '../import/ScanImport';
import { EmptyStart, UnlockDialog } from './UnlockDialog';

// three.js only loads when she first opens 3D, so the plan editor starts fast.
const View3D = lazy(() => import('../view3d/View3D').then((m) => ({ default: m.View3D })));

/** The 2D mode to return to when Tab leaves 3D. */
let last2DMode: Mode = 'trace';

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd' && s.selection?.kind === 'item') {
        e.preventDefault();
        const it = currentLevel()?.items.find((i) => i.id === s.selection!.id);
        if (it) {
          const copy = duplicateItem(it);
          s.editLevel('Duplicate item', (L) => void L.items.push(copy));
          s.select({ kind: 'item', id: copy.id });
        }
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
        if (s.mode === '3d') s.setMode(last2DMode);
        else {
          last2DMode = s.mode;
          s.setMode('3d');
        }
        return;
      }
      if (s.mode === '3d') return;
      if (e.key === 'Escape') {
        canvasApi.escape();
        s.setHighlight(null);
      }
      else if (e.key === 'Enter' && s.tool === 'draw') canvasApi.finishTrace();
      else if (e.key === 'v' || e.key === 'V') s.setTool('select');
      else if ((e.key === 'w' || e.key === 'W') && s.mode === 'trace') s.setTool('draw');
      else if (e.key === 'f' || e.key === 'F') canvasApi.fit();
      else if ((e.key === 'r' || e.key === 'R') && s.selection?.kind === 'item') {
        const id = s.selection.id;
        const it = currentLevel()?.items.find((i) => i.id === id);
        if (it && !it.locked) {
          s.editLevel('Turn item', (L) => {
            const idx = L.items.findIndex((x) => x.id === id);
            if (idx >= 0) L.items[idx] = rotateBy(L.items[idx] as PlacedItem, e.shiftKey ? -90 : 90);
          });
        }
      }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection) {
        const sel = s.selection;
        if (sel.kind === 'wall') {
          e.preventDefault();
          const w = currentLevel()?.walls.find((x) => x.id === sel.id);
          s.editLevel('Delete wall', (L) => deleteWall(L as Level, sel.id));
          s.select(null);
          if (w && isStructural(w)) s.toast(STRUCTURAL_DELETE_WARNING, 'warn');
        } else if (sel.kind === 'item') {
          e.preventDefault();
          s.editLevel('Remove item', (L) => void (L.items = L.items.filter((i) => i.id !== sel.id)));
          s.select(null);
        } else if (sel.kind === 'opening') {
          e.preventDefault();
          s.editLevel('Remove opening', (L) => deleteOpening(L as Level, sel.id));
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
  useShortcuts();
  if (!ready) return <div className="loading">Opening your plan…</div>;
  return (
    <div className="app">
      <TopBar />
      <ModeBar />
      {mode === '3d' ? (
        <main className="workspace three">
          <Suspense fallback={<div className="loading">Building the 3D view…</div>}>
            <View3D />
          </Suspense>
        </main>
      ) : (
        <main className="workspace">
          <LeftPanel />
          <PlanCanvas />
          <Inspector />
        </main>
      )}
      <Toasts />
      <Tour />
      <Shortcuts />
      <SiteMeasure />
      <ScanImport />
      <ScanGuide />
      <EmptyStart />
      <UnlockDialog />
    </div>
  );
}
