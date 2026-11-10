// One-click fixes: nudge (and if needed turn) ONLY the items named in an
// issue to the nearest position where that issue goes away, without
// pushing them into walls, other furniture, a door's swing or another room.

import type { Id, Level, PlacedItem, Project, Vec2 } from '../model/types';
import { convexOverlap } from './poly';
import { makeContext, runInContext, SEVERITY_RANK, type Issue, type RunOptions } from './engine';
import { RULES_BY_ID } from './registry';
import type { RuleContext } from './context';

export interface FixMove {
  itemId: Id;
  pos: Vec2;
  rotationDeg: number;
}

export interface Fix {
  moves: FixMove[];
}

export const FIX_STEP = 50;
export const FIX_MAX = 1500;

function resolved(ctx: RuleContext, issue: Issue, itemId: Id): boolean {
  const after = runInContext(ctx, new Set([issue.ruleId])).filter(
    (i) => i.itemIds.includes(itemId) && issue.itemIds.every((x) => i.itemIds.includes(x) || x === itemId),
  );
  const rank = SEVERITY_RANK[issue.severity];
  // Same rule, same items: must be gone, or at least drop below the original severity.
  return !after.some((i) => SEVERITY_RANK[i.severity] >= rank);
}

function valid(ctx: RuleContext, itemId: Id, roomKey: string | undefined): boolean {
  const p = ctx.byId.get(itemId);
  if (!p) return false;
  if (ctx.roomOf(p).detected?.key !== roomKey) return false;
  if (p.obstacle) {
    if (ctx.overlapsSomething(p.solids, new Set([itemId]))) return false;
    for (const d of ctx.geo.doors) if (p.solids.some((sp) => convexOverlap(d.sector, sp, 1))) return false;
  }
  return true;
}

/**
 * Find the smallest move of one of the issue's items that clears it.
 * Tries each named item in order (the first is the main one), the current
 * rotation before turning by 90°, and rings of positions 50 mm apart out
 * to 1.5 m. Locked items never move. Returns null if nothing works.
 */
export function fixIssue(level: Level, project: Pick<Project, 'catalogueOverrides'>, issue: Issue, opts: RunOptions = {}): Fix | null {
  const rule = RULES_BY_ID.get(issue.ruleId);
  if (!rule || !rule.fixable || issue.itemIds.length === 0) return null;
  const base = makeContext(level, project, opts);

  for (const itemId of issue.itemIds) {
    const item = level.items.find((i) => i.id === itemId);
    if (!item || item.locked) continue;
    const p0 = base.byId.get(itemId);
    if (!p0) continue;
    const roomKey = base.roomOf(p0).detected?.key;
    const tryAt = (pos: Vec2, rotationDeg: number): FixMove | null => {
      const moved: PlacedItem = { ...item, pos, rotationDeg };
      const ctx = base.withItems(level.items.map((i) => (i.id === itemId ? moved : i)));
      if (!valid(ctx, itemId, roomKey)) return null;
      if (!resolved(ctx, issue, itemId)) return null;
      return { itemId, pos, rotationDeg };
    };
    for (const turn of [0, 90, 270, 180]) {
      const rot = (((item.rotationDeg + turn) % 360) + 360) % 360;
      if (turn !== 0) {
        const m = tryAt(item.pos, rot);
        if (m) return { moves: [m] };
      }
      for (let r = FIX_STEP; r <= FIX_MAX; r += FIX_STEP) {
        const n = Math.max(8, Math.ceil((2 * Math.PI * r) / 100));
        for (let k = 0; k < n; k++) {
          const a = (2 * Math.PI * k) / n;
          const pos = { x: Math.round((item.pos.x + Math.cos(a) * r) / 10) * 10, y: Math.round((item.pos.y + Math.sin(a) * r) / 10) * 10 };
          const m = tryAt(pos, rot);
          if (m) return { moves: [m] };
        }
      }
    }
  }
  return null;
}

/** Apply a fix to a level (inside an immer recipe in the app). */
export function applyFix(level: Level, fix: Fix): void {
  for (const m of fix.moves) {
    const it = level.items.find((i) => i.id === m.itemId);
    if (!it) continue;
    it.pos = { x: m.pos.x, y: m.pos.y };
    it.rotationDeg = m.rotationDeg;
    delete it.mountedTo;
  }
}
