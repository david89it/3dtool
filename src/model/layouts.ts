// Layouts: the plain-language side of "options" (see schemes.ts). A layout is a
// whole copy of a floor, so walls, items, notes and finishes all differ per
// layout, while the catalogue, prices and colour schemes are shared.
// Pure helpers that work on a project (inside an immer recipe or on a copy).

import type { Id, Level, Project } from './types';
import { activeOf, groupOf, optionsOf } from './schemes';

/** What she sees for a layout: its name, or "Layout A" for a floor that has only one. */
export function layoutName(level: Level): string {
  return level.scheme?.name ?? 'Layout A';
}

/** The main layout of a floor is the first one in the list. */
export function mainLayout(project: Pick<Project, 'levels'>, group: Id): Level | undefined {
  return optionsOf(project, group)[0];
}

export function isMainLayout(project: Pick<Project, 'levels'>, level: Level): boolean {
  return mainLayout(project, groupOf(level))?.id === level.id;
}

/** The layout after (or before, dir -1) the one showing, wrapping round. Null when there is only one. */
export function stepLayout(project: Pick<Project, 'levels' | 'activeSchemes'>, group: Id, dir: 1 | -1 = 1): Level | null {
  const opts = optionsOf(project, group);
  if (opts.length < 2) return null;
  const cur = opts.findIndex((o) => o.id === activeOf(project, group)?.id);
  return opts[(cur + dir + opts.length) % opts.length];
}

/** Rename a layout. Returns false for an empty name or a floor with a single layout. */
export function renameLayout(project: Project, levelId: Id, name: string): boolean {
  const l = project.levels.find((x) => x.id === levelId);
  const v = name.trim().slice(0, 60);
  if (!l?.scheme || !v) return false;
  l.scheme.name = v;
  return true;
}

/**
 * Make a layout the main one: it swaps places with the current main layout,
 * so the floors keep their order. Returns false if it already is the main one.
 */
export function makeMainLayout(project: Project, levelId: Id): boolean {
  const l = project.levels.find((x) => x.id === levelId);
  if (!l) return false;
  const main = mainLayout(project, groupOf(l));
  if (!main || main.id === levelId) return false;
  const i = project.levels.indexOf(main);
  const j = project.levels.indexOf(l);
  [project.levels[i], project.levels[j]] = [project.levels[j], project.levels[i]];
  return true;
}
