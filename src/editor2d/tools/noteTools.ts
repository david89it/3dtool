// Notes on the plan. Note: click once to pin a text note. Measure and Arrow:
// click two points (the second follows the pointer, a measure shows its
// length live). Each placement is one undo step, then the tool goes back to
// Select so the new note can be typed into straight away.

import type { Level, Vec2 } from '../../model/types';
import { useStore } from '../../model/store';
import { snapPoint } from '../../geometry/snapping';
import { dist } from '../../geometry/vec';
import { addNote, makeNote, NOTE_KIND_LABEL, type NoteKind } from '../../model/notes';
import type { PointerInfo, ToolCtx, ToolHandler } from './types';

const round10 = (v: Vec2): Vec2 => ({ x: Math.round(v.x / 10) * 10, y: Math.round(v.y / 10) * 10 });

let first: Vec2 | null = null;

function pointFor(ctx: ToolCtx, p: PointerInfo, kind: NoteKind) {
  // Measures and arrows snap to corners, wall middles and walls (Alt turns it off).
  if (kind === 'note') return { point: round10(p.world), snap: undefined };
  const snap = snapPoint(ctx.level, p.world, { tol: 12 / ctx.view.scale, disabled: p.alt });
  return { point: snap.point, snap };
}

function finish(kind: NoteKind, pos: Vec2, to?: Vec2) {
  const store = useStore.getState();
  const note = makeNote(kind, pos, to);
  store.editLevel(`Add ${NOTE_KIND_LABEL[kind].toLowerCase()}`, (L) => addNote(L as Level, note));
  store.setTool('select');
  store.select({ kind: 'note', id: note.id });
}

function makeTool(kind: NoteKind): ToolHandler {
  return {
    down() {},
    move(ctx, p) {
      const { point, snap } = pointFor(ctx, p, kind);
      ctx.setOverlay({
        snap,
        notePreview: first && kind !== 'note' ? { kind, from: first, to: point } : undefined,
      });
    },
    up(ctx, p) {
      if (p.button !== 0) return;
      const { point, snap } = pointFor(ctx, p, kind);
      if (kind === 'note') {
        finish('note', point);
        return;
      }
      if (!first) {
        first = point;
        ctx.setOverlay({ snap, notePreview: { kind, from: point, to: point } });
        return;
      }
      if (dist(first, point) < 20) return; // second click of a double-click
      const from = first;
      first = null;
      finish(kind, from, point);
    },
    escape(ctx) {
      if (first) {
        first = null;
        ctx.setOverlay({});
        return;
      }
      useStore.getState().setTool('select');
    },
    reset() {
      first = null;
    },
  };
}

export const placeNoteTool = makeTool('note');
export const placeMeasureTool = makeTool('measure');
export const placeArrowTool = makeTool('arrow');
