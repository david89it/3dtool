// Doing what a search result says: go to a room, find a placed piece, start placing a
// catalogue item, or run a command.

import { useStore } from '../model/store';
import { findCatalogueItem, footprint } from '../catalogue/catalogue';
import { canvasApi } from '../editor2d/canvasApi';
import { detectedFor, frameRoom } from './roomViews';
import { paletteCommands } from './paletteCommands';
import type { SearchEntry } from './searchIndex';

/** Frame now, and again once the plan has drawn the new floor (it fits itself to a floor it has not shown yet). */
function frameSoon(frame: () => void): void {
  frame();
  setTimeout(frame, 120);
}

function goToLevel(levelId: string): void {
  if (useStore.getState().levelId !== levelId) useStore.getState().setLevel(levelId);
}

export function runEntry(e: SearchEntry): void {
  const s = useStore.getState();
  if (e.kind === 'command') {
    paletteCommands()
      .find((c) => c.id === e.commandId)
      ?.run();
    return;
  }
  if (e.kind === 'catalogue' && e.catalogueId) {
    if (s.mode !== 'furnish') s.setMode('furnish');
    useStore.getState().armItem(e.catalogueId);
    return;
  }
  if (e.kind === 'room' && e.levelId && e.roomId) {
    goToLevel(e.levelId);
    const level = useStore.getState().project.levels.find((l) => l.id === e.levelId);
    const det = level && detectedFor(level, e.roomId);
    if (!level || !det) return;
    useStore.getState().select({ kind: 'room', id: e.roomId });
    frameSoon(() => frameRoom(level, det));
    return;
  }
  if (e.kind === 'item' && e.levelId && e.itemId) {
    // Placed pieces live in Furnish mode.
    if (s.mode !== 'furnish') s.setMode('furnish');
    goToLevel(e.levelId);
    const st = useStore.getState();
    const item = st.project.levels.find((l) => l.id === e.levelId)?.items.find((i) => i.id === e.itemId);
    const cat = item && findCatalogueItem(st.project, item.catalogueId);
    if (!item || !cat) return;
    st.select({ kind: 'item', id: item.id });
    frameSoon(() => canvasApi.fitPoints(footprint(item, cat), 1500));
  }
}
