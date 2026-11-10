import { describe, expect, it } from 'vitest';
import { blankLevel } from '../geometry/testUtils';
import {
  addNote,
  deleteNote,
  makeNote,
  moveNote,
  noteColor,
  noteLength,
  notesWithText,
  setNoteColor,
  setNoteText,
} from './notes';

describe('notes on the plan', () => {
  it('makes a one-point note and two-point measures and arrows', () => {
    const n = makeNote('note', { x: 10, y: 20 });
    expect(n.to).toBeUndefined();
    const m = makeNote('measure', { x: 0, y: 0 }, { x: 3000, y: 4000 });
    expect(noteLength(m)).toBe(5000);
    expect(makeNote('arrow', { x: 0, y: 0 }).to).toBeDefined();
  });

  it('adds, edits and removes a note', () => {
    const L = blankLevel();
    const n = makeNote('note', { x: 0, y: 0 });
    addNote(L, n);
    setNoteText(L, n.id, '  Chimney breast here?  ');
    expect(L.notes![0].text).toBe('Chimney breast here?');
    setNoteText(L, n.id, '   ');
    expect(L.notes![0].text).toBeUndefined();
    deleteNote(L, n.id);
    expect(L.notes).toBeUndefined();
  });

  it('ignores edits to a note that is gone', () => {
    const L = blankLevel();
    setNoteText(L, 'nope', 'x');
    moveNote(L, 'nope', makeNote('note', { x: 0, y: 0 }), { x: 5, y: 5 });
    expect(L.notes).toBeUndefined();
  });

  it('moves from the start position, not cumulatively', () => {
    const L = blankLevel();
    const m = makeNote('measure', { x: 100, y: 100 }, { x: 600, y: 100 });
    addNote(L, m);
    const base = structuredClone(m);
    moveNote(L, m.id, base, { x: 10, y: 10 });
    moveNote(L, m.id, base, { x: 50, y: -20 });
    expect(L.notes![0].pos).toEqual({ x: 150, y: 80 });
    expect(L.notes![0].to).toEqual({ x: 650, y: 80 });
  });

  it('can move one end of a measure', () => {
    const L = blankLevel();
    const m = makeNote('measure', { x: 0, y: 0 }, { x: 1000, y: 0 });
    addNote(L, m);
    moveNote(L, m.id, structuredClone(m), { x: 0, y: 500 }, 'to');
    expect(L.notes![0].pos).toEqual({ x: 0, y: 0 });
    expect(L.notes![0].to).toEqual({ x: 1000, y: 500 });
    expect(noteLength(L.notes![0])).toBeCloseTo(Math.hypot(1000, 500));
  });

  it('uses a default colour per kind until one is chosen', () => {
    const L = blankLevel();
    const n = makeNote('arrow', { x: 0, y: 0 });
    addNote(L, n);
    const def = noteColor(n);
    setNoteColor(L, n.id, '#2563eb');
    expect(noteColor(L.notes![0])).toBe('#2563eb');
    setNoteColor(L, n.id, undefined);
    expect(noteColor(L.notes![0])).toBe(def);
  });

  it('lists only notes that have text', () => {
    const L = blankLevel();
    const a = makeNote('note', { x: 0, y: 0 });
    const b = makeNote('note', { x: 5, y: 5 });
    addNote(L, a);
    addNote(L, b);
    setNoteText(L, b.id, 'Check beam');
    expect(notesWithText(L).map((n) => n.id)).toEqual([b.id]);
  });
});
