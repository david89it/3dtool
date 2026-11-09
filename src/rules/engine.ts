// Runs the rules registry over a level and turns findings into issues she
// can read: grouped by room, worst first.

import type { Id, Level, Project } from '../model/types';
import { buildGeometry, RuleContext, type Fmt, type LevelGeometry, type RuleOverrides } from './context';
import { RULES, type Finding, type Rule, type Severity } from './registry';

export interface Issue {
  /** Stable id: rule, items and detail. */
  id: string;
  ruleId: string;
  ruleTitle: string;
  severity: Severity;
  roomId?: Id;
  roomName: string;
  itemIds: Id[];
  wallIds: Id[];
  measured: number;
  required: number;
  ideal?: number;
  message: string;
  /** A one-click nudge may fix it (fixIssue can still return null). */
  fixable: boolean;
}

export interface RunOptions {
  overrides?: RuleOverrides;
  fmt?: Fmt;
}

export const SEVERITY_RANK: Record<Severity, number> = { error: 3, warning: 2, tip: 1 };

// Wall geometry only changes when nodes or walls change; immer keeps those
// arrays identical when only furniture moves, so cache on them.
const geoCache = new WeakMap<object, WeakMap<object, LevelGeometry>>();

export function levelGeometry(level: Level): LevelGeometry {
  let inner = geoCache.get(level.walls);
  if (!inner) {
    inner = new WeakMap();
    geoCache.set(level.walls, inner);
  }
  let g = inner.get(level.nodes);
  if (!g) {
    g = buildGeometry(level);
    inner.set(level.nodes, g);
  }
  return g;
}

export function makeContext(level: Level, project: Pick<Project, 'catalogueOverrides'>, opts: RunOptions = {}): RuleContext {
  return new RuleContext(level, project, levelGeometry(level), opts.overrides ?? {}, opts.fmt);
}

function toIssue(rule: Rule, f: Finding, ctx: RuleContext): Issue | null {
  let severity: Severity;
  let message: string;
  if (f.severity) {
    severity = f.severity;
    message = f.message ?? rule.title;
  } else if (f.measured < f.required - 0.5) {
    severity = rule.severity;
    message = `${f.subject}: ${ctx.fmt(f.measured)}. Needs ${ctx.fmt(f.required)} ${f.need}.`;
  } else if (f.ideal !== undefined && f.measured < f.ideal - 0.5) {
    severity = 'tip';
    message = `${f.subject}: ${ctx.fmt(f.measured)}. ${ctx.fmt(f.ideal)} would be more comfortable ${f.need}.`;
  } else {
    return null;
  }
  const room = f.roomItem ? ctx.roomOf(f.roomItem) : undefined;
  return {
    id: [rule.id, [...f.itemIds].sort().join(','), (f.wallIds ?? []).join(','), f.key ?? ''].join('|'),
    ruleId: rule.id,
    ruleTitle: rule.title,
    severity,
    roomId: room?.room?.id ?? f.roomId,
    roomName: room?.name ?? f.roomName ?? 'Not in a room',
    itemIds: f.itemIds,
    wallIds: f.wallIds ?? [],
    measured: Math.round(f.measured),
    required: Math.round(f.required),
    ideal: f.ideal !== undefined ? Math.round(f.ideal) : undefined,
    message,
    fixable: rule.fixable && f.itemIds.length > 0,
  };
}

/** Run some or all rules in a prepared context. */
export function runInContext(ctx: RuleContext, only?: Set<string>): Issue[] {
  const out = new Map<string, Issue>();
  for (const rule of RULES) {
    if (only && !only.has(rule.id)) continue;
    const params = ctx.params(rule.id, rule.params);
    const findings: Finding[] = [];
    if (rule.scope === 'level') findings.push(...rule.measureLevel(ctx, params));
    else for (const p of ctx.placed) if (rule.applies(p, ctx)) findings.push(...rule.measure(p, ctx, params));
    for (const f of findings) {
      const issue = toIssue(rule, f, ctx);
      if (!issue) continue;
      const prev = out.get(issue.id);
      if (!prev || SEVERITY_RANK[issue.severity] > SEVERITY_RANK[prev.severity]) out.set(issue.id, issue);
    }
  }
  return sortIssues([...out.values()]);
}

const memo = new WeakMap<Level, { project: unknown; overrides: unknown; fmt: unknown; issues: Issue[] }>();

/** All issues on a level, worst first. Memoised per level object. */
export function runRules(level: Level, project: Pick<Project, 'catalogueOverrides'>, opts: RunOptions = {}): Issue[] {
  const hit = memo.get(level);
  if (hit && hit.project === project.catalogueOverrides && hit.overrides === opts.overrides && hit.fmt === opts.fmt) return hit.issues;
  const issues = runInContext(makeContext(level, project, opts));
  memo.set(level, { project: project.catalogueOverrides, overrides: opts.overrides, fmt: opts.fmt, issues });
  return issues;
}

export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) =>
      a.roomName.localeCompare(b.roomName) ||
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.message.localeCompare(b.message),
  );
}

export interface IssueGroup {
  roomName: string;
  roomId?: Id;
  issues: Issue[];
  worst: Severity;
}

/** Group by room; rooms with errors come first, then warnings, then tips. */
export function groupByRoom(issues: Issue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const i of sortIssues(issues)) {
    const g = groups.get(i.roomName) ?? { roomName: i.roomName, roomId: i.roomId, issues: [], worst: 'tip' as Severity };
    g.issues.push(i);
    if (SEVERITY_RANK[i.severity] > SEVERITY_RANK[g.worst]) g.worst = i.severity;
    groups.set(i.roomName, g);
  }
  return [...groups.values()].sort((a, b) => SEVERITY_RANK[b.worst] - SEVERITY_RANK[a.worst] || a.roomName.localeCompare(b.roomName));
}

export function countBySeverity(issues: Issue[]): Record<Severity, number> {
  const c: Record<Severity, number> = { error: 0, warning: 0, tip: 0 };
  for (const i of issues) c[i.severity]++;
  return c;
}
