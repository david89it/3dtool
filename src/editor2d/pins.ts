// Screen positions and hit tests for things drawn over the plan at a
// constant size: the amber structural pins and the notes she pins down.

import type { Id, Level, PlanNote, Vec2 } from '../model/types';
import type { WallDimension } from '../geometry/dimensions';
import { needsStructuralBadge } from '../geometry/openings';
import { dist, lerp, norm, perpL, projectOnSegment, sub } from '../geometry/vec';
import { toScreen, type View } from './view';

/** Structural pin: a 28 px circle with a 44 px target. */
export const PIN_RADIUS = 14;
export const PIN_HIT_RADIUS = 22;

export interface StructuralPin {
  wallId: Id;
  screen: Vec2;
}

/** One pin per wall with a new opening that may be structural, beside the first such opening. */
export function structuralPins(level: Level, dims: WallDimension[], view: View): StructuralPin[] {
  const out: StructuralPin[] = [];
  for (const w of level.walls.filter(needsStructuralBadge)) {
    const a = level.nodes.find((n) => n.id === w.a)?.pos;
    const b = level.nodes.find((n) => n.id === w.b)?.pos;
    if (!a || !b) continue;
    const firstNew = w.openings.find((o) => !o.existing)!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const mid = lerp(a, b, (firstNew.offset + firstNew.width / 2) / len);
    // Opposite side to the measurements, growing away from the wall.
    const dim = dims.find((d) => d.wallId === w.id);
    const base = dim ? { x: -dim.normal.x, y: -dim.normal.y } : perpL(norm(sub(b, a)));
    const p = toScreen(view, mid);
    const off = (w.thickness / 2) * view.scale + 8 + PIN_RADIUS;
    out.push({ wallId: w.id, screen: { x: p.x + base.x * off, y: p.y + base.y * off } });
  }
  return out;
}

export function hitStructuralPin(level: Level, dims: WallDimension[], view: View, screen: Vec2): Id | undefined {
  let best: Id | undefined;
  let bestD = PIN_HIT_RADIUS;
  for (const p of structuralPins(level, dims, view)) {
    const d = dist(p.screen, screen);
    if (d <= bestD) {
      bestD = d;
      best = p.wallId;
    }
  }
  return best;
}

// ---- notes ---------------------------------------------------------------

const CHAR_PX = 6.6;
const TAG_MAX_W = 190;
const TAG_PAD = 7;
export const NOTE_PLACEHOLDER = 'Type your note…';

/** Where a text note's label sits, in screen pixels (an estimate that matches the drawn size closely). */
export function noteTag(n: PlanNote, view: View): { x: number; y: number; w: number; h: number } {
  const p = toScreen(view, n.pos);
  const text = n.text || NOTE_PLACEHOLDER;
  const w = Math.min(TAG_MAX_W, Math.max(60, text.length * CHAR_PX + TAG_PAD * 2));
  const lines = Math.max(1, Math.ceil((text.length * CHAR_PX) / (w - TAG_PAD * 2)));
  const h = lines * 15 + TAG_PAD * 2;
  return { x: p.x + 12, y: p.y - 14, w, h };
}

/** Screen position and reading angle of a measure's label. */
export function measureLabelPos(n: PlanNote, view: View): { screen: Vec2; angleDeg: number } {
  const a = toScreen(view, n.pos);
  const b = toScreen(view, n.to ?? n.pos);
  let angleDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angleDeg > 90) angleDeg -= 180;
  if (angleDeg <= -90) angleDeg += 180;
  const rad = (angleDeg * Math.PI) / 180;
  // Float the label to the upper side of the line.
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return { screen: { x: mid.x + Math.sin(rad) * 13, y: mid.y - Math.cos(rad) * 13 }, angleDeg };
}

export interface NoteHit {
  id: Id;
  /** 'pos' or 'to' when an end of a selected measure or arrow is grabbed, otherwise the whole note. */
  part: 'all' | 'pos' | 'to';
}

/** The note under a screen point. Later notes sit on top, so they win. */
export function hitNote(level: Level, view: View, screen: Vec2, selectedId?: Id): NoteHit | undefined {
  const notes = level.notes ?? [];
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    const a = toScreen(view, n.pos);
    if (n.kind === 'note') {
      const t = noteTag(n, view);
      const inTag = screen.x >= t.x && screen.x <= t.x + t.w && screen.y >= t.y && screen.y <= t.y + t.h;
      if (inTag || dist(a, screen) <= 18) return { id: n.id, part: 'all' };
      continue;
    }
    const b = toScreen(view, n.to ?? n.pos);
    if (n.id === selectedId) {
      if (dist(a, screen) <= 18) return { id: n.id, part: 'pos' };
      if (dist(b, screen) <= 18) return { id: n.id, part: 'to' };
    }
    if (projectOnSegment(screen, a, b).dist <= 14) return { id: n.id, part: 'all' };
  }
  return undefined;
}
