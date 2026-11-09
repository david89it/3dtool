import { useEffect } from 'react';
import { useStore } from '../model/store';
import { PlanCanvas } from '../editor2d/PlanCanvas';
import { canvasApi } from '../editor2d/canvasApi';
import { deleteWall } from '../geometry/wallGraph';
import type { Level } from '../model/types';
import { TopBar } from './TopBar';
import { ModeBar } from './ModeBar';
import { LeftPanel } from './LeftPanel';
import { Inspector } from './Inspector';
import { Toasts } from './Toasts';

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
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod) return;
      if (e.key === 'Escape') canvasApi.escape();
      else if (e.key === 'Enter' && s.tool === 'draw') canvasApi.finishTrace();
      else if (e.key === 'v' || e.key === 'V') s.setTool('select');
      else if (e.key === 'w' || e.key === 'W') s.setTool('draw');
      else if (e.key === 'f' || e.key === 'F') canvasApi.fit();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection) {
        const sel = s.selection;
        if (sel.kind === 'wall') {
          e.preventDefault();
          s.editLevel('Delete wall', (L) => deleteWall(L as Level, sel.id));
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
  useShortcuts();
  if (!ready) return <div className="loading">Opening your plan…</div>;
  return (
    <div className="app">
      <TopBar />
      <ModeBar />
      <main className="workspace">
        <LeftPanel />
        <PlanCanvas />
        <Inspector />
      </main>
      <Toasts />
    </div>
  );
}
