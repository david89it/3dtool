// What the layout pill, the L key and the compare view do. Each one goes
// through the store, so it can be undone, except switching (which only changes
// what is showing).

import type { Project } from '../../model/types';
import { useStore, currentLevel } from '../../model/store';
import { deleteOption, duplicateAsOption, groupOf } from '../../model/schemes';
import { layoutName, makeMainLayout, renameLayout, stepLayout } from '../../model/layouts';

const s = () => useStore.getState();

/** Show another layout of the floor. */
export function showLayout(levelId: string): void {
  s().setLevel(levelId);
}

/** Copy the layout on screen into a new one and switch to it. */
export function tryAlternative(): void {
  const level = currentLevel();
  if (!level) return;
  let newId: string | null = null;
  s().commit(`Try an alternative to ${layoutName(level)}`, (d) => void (newId = duplicateAsOption(d as Project, level.id)));
  if (!newId) return;
  s().setLevel(newId);
  const name = s().project.levels.find((l) => l.id === newId)?.scheme?.name;
  s().toast(`${name} is a copy of ${layoutName(level)}. Change it freely: ${layoutName(level)} stays as it was.`);
}

export function deleteCurrentLayout(): void {
  const level = currentLevel();
  if (!level?.scheme) return;
  const name = layoutName(level);
  let next: string | null = null;
  s().commit(`Delete ${name}`, (d) => void (next = deleteOption(d as Project, level.id)));
  if (next) s().setLevel(next);
}

export function renameCurrentLayout(name: string): void {
  const level = currentLevel();
  if (!level) return;
  s().commit('Rename layout', (d) => void renameLayout(d as Project, level.id, name));
}

export function makeCurrentMain(): void {
  const level = currentLevel();
  if (!level) return;
  s().commit(`Make ${layoutName(level)} the main layout`, (d) => void makeMainLayout(d as Project, level.id));
  s().toast(`${layoutName(level)} is now the main layout.`);
}

/** The L key: flip to the next layout of this floor (Shift for the previous one). */
export function cycleLayout(dir: 1 | -1 = 1): void {
  const level = currentLevel();
  if (!level) return;
  const next = stepLayout(s().project, groupOf(level), dir);
  if (!next) {
    s().toast('This floor has one layout. Use "Try an alternative" in the layout pill to make another.');
    return;
  }
  s().setLevel(next.id);
  s().toast(`Showing ${layoutName(next)}`);
}
