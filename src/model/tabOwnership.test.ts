import { describe, expect, it } from 'vitest';
import { beats, canEdit, newTabState, reduceTab, type TabEvent, type TabMsg, type TabState } from './tabOwnership';

const msg = (m: TabMsg): TabEvent => ({ type: 'msg', msg: m });

function editor(tab: string, epoch: number): TabState {
  return { tab, role: 'editor', epoch, seen: epoch };
}

describe('tab ownership', () => {
  it('a lone tab becomes the editor when nobody answers', () => {
    const r = reduceTab(newTabState('a'), { type: 'startupTimeout', now: 1000 });
    expect(r.state.role).toBe('editor');
    expect(r.send).toEqual([{ type: 'owner', tab: 'a', epoch: 1000 }]);
  });

  it('an editor answers hello, a viewer does not', () => {
    expect(reduceTab(editor('a', 5), msg({ type: 'hello', tab: 'b' })).send).toEqual([{ type: 'owner', tab: 'a', epoch: 5 }]);
    expect(reduceTab({ ...editor('a', 5), role: 'viewer' }, msg({ type: 'hello', tab: 'b' })).send).toEqual([]);
  });

  it('a starting tab that hears from an editor becomes a viewer, and then stays one', () => {
    const r = reduceTab(newTabState('b'), msg({ type: 'owner', tab: 'a', epoch: 5 }));
    expect(r.state.role).toBe('viewer');
    expect(reduceTab(r.state, { type: 'startupTimeout', now: 9999 }).state.role).toBe('viewer');
  });

  it('ignores its own messages', () => {
    const r = reduceTab(editor('a', 5), msg({ type: 'claim', tab: 'a', epoch: 99 }));
    expect(r.state.role).toBe('editor');
    expect(r.yieldTo).toBeUndefined();
  });

  it('taking over: claim, the editor yields, then the claimant acquires and becomes the editor', () => {
    let viewer = reduceTab(newTabState('b'), msg({ type: 'owner', tab: 'a', epoch: 5 })).state;
    const claim = reduceTab(viewer, { type: 'takeOver', now: 2000 });
    viewer = claim.state;
    expect(viewer.role).toBe('claiming');
    const claimMsg = claim.send[0];
    expect(claimMsg).toEqual({ type: 'claim', tab: 'b', epoch: 2000 });

    const old = reduceTab(editor('a', 5), msg(claimMsg));
    expect(old.state.role).toBe('viewer');
    expect(old.yieldTo).toBe('b');

    const released = reduceTab(viewer, msg({ type: 'released', tab: 'a', to: 'b' }));
    expect(released.acquire).toBe(true);
    const done = reduceTab(released.state, { type: 'claimGranted', now: 2100 });
    expect(done.state.role).toBe('editor');
    expect(done.send[0]).toMatchObject({ type: 'owner', tab: 'b' });
  });

  it('a claim always beats the editor, even if clocks are behind', () => {
    const viewer: TabState = { tab: 'b', role: 'viewer', epoch: 0, seen: 5000 };
    const claim = reduceTab(viewer, { type: 'takeOver', now: 10 });
    expect((claim.send[0] as { epoch: number }).epoch).toBe(5001);
  });

  it('only the tab that was asked reacts to "released"', () => {
    const claiming: TabState = { tab: 'b', role: 'claiming', epoch: 2, seen: 2 };
    expect(reduceTab(claiming, msg({ type: 'released', tab: 'a', to: 'c' })).acquire).toBeUndefined();
    expect(reduceTab({ ...claiming, role: 'viewer' }, msg({ type: 'released', tab: 'a', to: 'b' })).acquire).toBeUndefined();
  });

  it('two editors that started together: the later one wins, ties go to the larger id', () => {
    expect(beats({ epoch: 2, tab: 'a' }, { epoch: 1, tab: 'z' })).toBe(true);
    expect(beats({ epoch: 1, tab: 'b' }, { epoch: 1, tab: 'a' })).toBe(true);
    expect(beats({ epoch: 1, tab: 'a' }, { epoch: 1, tab: 'b' })).toBe(false);
    const loser = reduceTab(editor('a', 1), msg({ type: 'owner', tab: 'b', epoch: 1 }));
    expect(loser.state.role).toBe('viewer');
    const winner = reduceTab(editor('b', 1), msg({ type: 'owner', tab: 'a', epoch: 1 }));
    expect(winner.state.role).toBe('editor');
  });

  it('a viewer ignores claims between other tabs', () => {
    const v: TabState = { tab: 'c', role: 'viewer', epoch: 0, seen: 0 };
    const r = reduceTab(v, msg({ type: 'claim', tab: 'b', epoch: 50 }));
    expect(r.state.role).toBe('viewer');
    expect(r.state.seen).toBe(50);
    expect(r.yieldTo).toBeUndefined();
  });

  it('only editing roles may edit', () => {
    expect(canEdit('editor')).toBe(true);
    expect(canEdit('starting')).toBe(true);
    expect(canEdit('viewer')).toBe(false);
    expect(canEdit('claiming')).toBe(false);
  });
});
