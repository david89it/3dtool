// Which browser tab may edit the plan. Pure logic: no timers, no BroadcastChannel, no store.
// `tabLock.ts` feeds it messages and carries out the effects it asks for.
//
// Rules, in plain words:
// - A tab that starts up says hello. If an editor answers, this tab is a viewer. If nobody answers in time, it is the editor.
// - A viewer can ask to take over ("claim"). The current editor saves what it has, becomes a viewer and says it is done.
//   Only then does the claiming tab read the plan from storage and start editing, so nothing is written over newer work.
// - If two tabs both think they are the editor (they started at the same moment), the one with the later claim time
//   wins; a tie goes to the larger tab id. The loser becomes a viewer.

export type Role = 'starting' | 'editor' | 'viewer' | 'claiming';

export interface TabState {
  tab: string;
  role: Role;
  /** When this tab became (or asked to become) the editor, in ms. Later beats earlier. */
  epoch: number;
  /** Highest epoch seen from any tab, so a claim always beats the editor it is aimed at. */
  seen: number;
}

export type TabMsg =
  | { type: 'hello'; tab: string }
  | { type: 'owner'; tab: string; epoch: number }
  | { type: 'claim'; tab: string; epoch: number }
  | { type: 'released'; tab: string; to: string };

export type TabEvent =
  | { type: 'msg'; msg: TabMsg }
  | { type: 'startupTimeout'; now: number }
  | { type: 'takeOver'; now: number }
  | { type: 'claimGranted'; now: number };

export interface TabResult {
  state: TabState;
  /** Messages to broadcast. */
  send: TabMsg[];
  /** This tab just lost the editor role: save what it has, then tell `to` it is done. */
  yieldTo?: string;
  /** The editor we asked has let go (or did not answer): read the plan from storage, then send `claimGranted`. */
  acquire?: boolean;
}

export function newTabState(tab: string): TabState {
  return { tab, role: 'starting', epoch: 0, seen: 0 };
}

/** True when `a` should be the editor rather than `b`. */
export function beats(a: { epoch: number; tab: string }, b: { epoch: number; tab: string }): boolean {
  return a.epoch !== b.epoch ? a.epoch > b.epoch : a.tab > b.tab;
}

/** Can a tab in this role change and save the plan? */
export const canEdit = (role: Role): boolean => role === 'editor' || role === 'starting';

export function reduceTab(state: TabState, ev: TabEvent): TabResult {
  const none = (s: TabState = state): TabResult => ({ state: s, send: [] });
  if (ev.type === 'startupTimeout') {
    if (state.role !== 'starting') return none();
    const epoch = Math.max(ev.now, state.seen + 1);
    return { state: { ...state, role: 'editor', epoch, seen: Math.max(state.seen, epoch) }, send: [{ type: 'owner', tab: state.tab, epoch }] };
  }
  if (ev.type === 'takeOver') {
    if (state.role !== 'viewer') return none();
    const epoch = Math.max(ev.now, state.seen + 1);
    return { state: { ...state, role: 'claiming', epoch, seen: Math.max(state.seen, epoch) }, send: [{ type: 'claim', tab: state.tab, epoch }] };
  }
  if (ev.type === 'claimGranted') {
    if (state.role !== 'claiming') return none();
    const epoch = Math.max(ev.now, state.epoch);
    return { state: { ...state, role: 'editor', epoch, seen: Math.max(state.seen, epoch) }, send: [{ type: 'owner', tab: state.tab, epoch }] };
  }
  const m = ev.msg;
  if (m.tab === state.tab) return none();
  if (m.type === 'hello') {
    return state.role === 'editor' ? { state, send: [{ type: 'owner', tab: state.tab, epoch: state.epoch }] } : none();
  }
  if (m.type === 'released') {
    return m.to === state.tab && state.role === 'claiming' ? { state, send: [], acquire: true } : none();
  }
  const s: TabState = { ...state, seen: Math.max(state.seen, m.epoch) };
  if (m.type === 'owner') {
    if (s.role === 'starting') return none({ ...s, role: 'viewer' });
    if ((s.role === 'editor' || s.role === 'claiming') && beats(m, s)) {
      return { state: { ...s, role: 'viewer' }, send: [], yieldTo: s.role === 'editor' ? m.tab : undefined };
    }
    return none(s);
  }
  // claim
  if ((s.role === 'editor' || s.role === 'starting') && beats(m, s)) return { state: { ...s, role: 'viewer' }, send: [], yieldTo: m.tab };
  if (s.role === 'claiming' && beats(m, s)) return none({ ...s, role: 'viewer' });
  return none(s);
}
