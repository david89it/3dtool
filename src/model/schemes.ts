// Compare mode: a floor can have several options ("Option A", "Option B").
// Each option is a full Level with `scheme.group` = the id of the original
// floor. Exactly one option per group is active: it is what the floor tabs,
// the 3D view, stairs and walking use. Levels without `scheme` are their
// own one-option group.

import type { Id, Level, Project } from './types';
import { uid } from './ids';

export function groupOf(level: Level): Id {
  return level.scheme?.group ?? level.id;
}

/** All options of a group, in project order. */
export function optionsOf(project: Pick<Project, 'levels'>, group: Id): Level[] {
  return project.levels.filter((l) => groupOf(l) === group);
}

/** The active option of a group (the stored choice, or the first option). */
export function activeOf(project: Pick<Project, 'levels' | 'activeSchemes'>, group: Id): Level | undefined {
  const opts = optionsOf(project, group);
  const chosen = project.activeSchemes?.[group];
  return opts.find((l) => l.id === chosen) ?? opts[0];
}

/** Level id -> the active option of its group (used for stair destinations). */
export function resolveLevel(project: Pick<Project, 'levels' | 'activeSchemes'>, levelId: Id): Level | undefined {
  const l = project.levels.find((x) => x.id === levelId);
  if (!l) return undefined;
  return activeOf(project, groupOf(l));
}

/** One level per floor: the active options, in the order floors first appear. */
export function activeLevels(project: Pick<Project, 'levels' | 'activeSchemes'>): Level[] {
  const seen = new Set<Id>();
  const out: Level[] = [];
  for (const l of project.levels) {
    const g = groupOf(l);
    if (seen.has(g)) continue;
    seen.add(g);
    const a = activeOf(project, g);
    if (a) out.push(a);
  }
  return out;
}

/**
 * Active levels with each stair pointing at the active option of its
 * destination floor. Level objects are only copied when a stair changes,
 * so memoised geometry for unchanged floors stays valid.
 */
export function activeLevelsResolved(project: Pick<Project, 'levels' | 'activeSchemes'>): Level[] {
  return activeLevels(project).map((l) => {
    if (!l.stairs.some((s) => resolveLevel(project, s.toLevelId)?.id !== s.toLevelId)) return l;
    return {
      ...l,
      stairs: l.stairs.map((s) => {
        const to = resolveLevel(project, s.toLevelId);
        return to && to.id !== s.toLevelId ? { ...s, toLevelId: to.id } : s;
      }),
    };
  });
}

export function optionName(i: number): string {
  return `Option ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) + 1 : ''}`;
}

function nextOptionName(opts: Level[]): string {
  const used = new Set(opts.map((o) => o.scheme?.name));
  for (let i = 0; ; i++) if (!used.has(optionName(i))) return optionName(i);
}

/** Deep copy of a level with fresh ids everywhere and every reference remapped. */
export function cloneLevel(src: Level): Level {
  const map = new Map<Id, Id>();
  const re = (id: Id, prefix: string) => {
    if (!map.has(id)) map.set(id, uid(prefix));
    return map.get(id)!;
  };
  const copy: Level = JSON.parse(JSON.stringify(src));
  copy.id = uid('lvl');
  for (const n of copy.nodes) n.id = re(n.id, 'n');
  for (const w of copy.walls) {
    w.id = re(w.id, 'w');
    w.a = map.get(w.a) ?? w.a;
    w.b = map.get(w.b) ?? w.b;
    for (const o of w.openings) o.id = uid('o');
  }
  for (const r of copy.rooms) {
    r.id = uid('r');
    r.boundary = r.boundary.map((id) => map.get(id) ?? id);
  }
  const items = new Map<Id, Id>();
  for (const it of copy.items) {
    const old = it.id;
    it.id = uid('i');
    items.set(old, it.id);
    if (it.mountedTo) it.mountedTo.wallId = map.get(it.mountedTo.wallId) ?? it.mountedTo.wallId;
  }
  // Groups of furniture follow their pieces to the copy.
  for (const g of copy.groups ?? []) {
    g.id = uid('g');
    g.itemIds = g.itemIds.map((id) => items.get(id) ?? id);
  }
  for (const s of copy.stairs) s.id = uid('s');
  for (const m of copy.markers ?? []) m.id = uid('m');
  return copy;
}

/**
 * Duplicate a floor as a new option (mutates the project, e.g. inside an
 * immer recipe). The first duplicate names the original "Option A".
 * Returns the new level's id; it becomes the active option.
 */
export function duplicateAsOption(project: Project, levelId: Id): Id | null {
  const src = project.levels.find((l) => l.id === levelId);
  if (!src) return null;
  const group = groupOf(src);
  let opts = optionsOf(project, group);
  for (const o of opts) if (!o.scheme) o.scheme = { group, name: nextOptionName(opts) };
  opts = optionsOf(project, group);
  const copy = cloneLevel(src);
  copy.scheme = { group, name: nextOptionName(opts) };
  const lastIdx = project.levels.indexOf(opts[opts.length - 1]);
  project.levels.splice(lastIdx + 1, 0, copy);
  project.activeSchemes = { ...(project.activeSchemes ?? {}), [group]: copy.id };
  return copy.id;
}

/** Delete an option (never the last one of a floor). Returns the option now active. */
export function deleteOption(project: Project, levelId: Id): Id | null {
  const l = project.levels.find((x) => x.id === levelId);
  if (!l) return null;
  const group = groupOf(l);
  const opts = optionsOf(project, group);
  if (opts.length < 2) return null;
  project.levels = project.levels.filter((x) => x.id !== levelId);
  const rest = optionsOf(project, group);
  if (rest.length === 1) delete rest[0].scheme; // back to a plain floor
  const active = project.activeSchemes?.[group] === levelId || !project.activeSchemes?.[group] ? rest[0].id : project.activeSchemes[group];
  project.activeSchemes = { ...(project.activeSchemes ?? {}), [group]: active };
  if (rest.length === 1) delete project.activeSchemes[group];
  return active;
}

/** Project with `levelId` made the active option of its floor (no copy if already). */
export function withActive<P extends Pick<Project, 'levels' | 'activeSchemes'>>(project: P, levelId: Id): P {
  const l = project.levels.find((x) => x.id === levelId);
  if (!l?.scheme) return project;
  const group = groupOf(l);
  if (activeOf(project, group)?.id === levelId) return project;
  return { ...project, activeSchemes: { ...(project.activeSchemes ?? {}), [group]: levelId } };
}
