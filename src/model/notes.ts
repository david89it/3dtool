// Notes pinned to the plan (Level.notes): pure helpers for making, editing
// and measuring them. The store does the undo; these only change a level.

import type { Id, Level, PlanNote, Vec2 } from './types';
import { uid } from './ids';

export type NoteKind = PlanNote['kind'];

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  note: 'Note',
  measure: 'Measurement',
  arrow: 'Arrow',
};

/** Colours she can pick for a note (hex), with plain names. */
export const NOTE_COLORS: { value: string; label: string }[] = [
  { value: '#b45309', label: 'Amber' },
  { value: '#2563eb', label: 'Blue' },
  { value: '#047857', label: 'Green' },
  { value: '#be123c', label: 'Red' },
];

export const DEFAULT_NOTE_COLOR: Record<NoteKind, string> = {
  note: '#b45309',
  measure: '#7c3aed',
  arrow: '#be123c',
};

export function noteColor(n: PlanNote): string {
  return n.color ?? DEFAULT_NOTE_COLOR[n.kind];
}

/** Measures and arrows need two points; a plain note has one. */
export function makeNote(kind: NoteKind, pos: Vec2, to?: Vec2): PlanNote {
  const n: PlanNote = { id: uid('n'), kind, pos: { x: pos.x, y: pos.y } };
  if (kind !== 'note') n.to = to ? { x: to.x, y: to.y } : { x: pos.x + 1000, y: pos.y };
  return n;
}

export function addNote(level: Level, note: PlanNote): void {
  (level.notes ??= []).push(note);
}

export function findNote(level: Pick<Level, 'notes'>, id: Id): PlanNote | undefined {
  return (level.notes ?? []).find((n) => n.id === id);
}

/** Empty text removes the field, so saved plans stay tidy. */
export function setNoteText(level: Level, id: Id, text: string): void {
  const n = findNote(level, id);
  if (!n) return;
  const t = text.trim();
  if (t) n.text = t;
  else delete n.text;
}

export function setNoteColor(level: Level, id: Id, color: string | undefined): void {
  const n = findNote(level, id);
  if (!n) return;
  if (color) n.color = color;
  else delete n.color;
}

export function deleteNote(level: Level, id: Id): void {
  if (!level.notes) return;
  level.notes = level.notes.filter((n) => n.id !== id);
  if (level.notes.length === 0) delete level.notes;
}

export type NotePart = 'all' | 'pos' | 'to';

/**
 * Move a note from where it started (`base`) by `delta`: the whole note, or
 * just one end of a measure or arrow. Used by drags, so it always works from
 * the start position and never accumulates.
 */
export function moveNote(level: Level, id: Id, base: PlanNote, delta: Vec2, part: NotePart = 'all'): void {
  const n = findNote(level, id);
  if (!n) return;
  if (part === 'all' || part === 'pos') n.pos = { x: base.pos.x + delta.x, y: base.pos.y + delta.y };
  if (base.to && (part === 'all' || part === 'to')) n.to = { x: base.to.x + delta.x, y: base.to.y + delta.y };
}

/** Length of a measure or arrow in mm (0 for a plain note). */
export function noteLength(n: PlanNote): number {
  return n.to ? Math.hypot(n.to.x - n.pos.x, n.to.y - n.pos.y) : 0;
}

/** Points that belong to a note, for fitting the view and the print. */
export function notePoints(n: PlanNote): Vec2[] {
  return n.to ? [n.pos, n.to] : [n.pos];
}

/** Notes with something to say, in the order she placed them (for the print list). */
export function notesWithText(level: Pick<Level, 'notes'>): PlanNote[] {
  return (level.notes ?? []).filter((n) => !!n.text?.trim());
}
