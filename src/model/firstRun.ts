// What a first-time visitor starts with.
//
// Normal builds open the owners' seed project. A public build
// (VITE_PUBLIC_BUILD=1, used for GitHub Pages) starts empty and never
// contains the seed: the dynamic import below is dead code there, so the
// bundler drops the seed, its address strings and the floorplan picture.

import type { Project } from './types';

/** True in the build published for everyone. */
export const PUBLIC_BUILD: boolean = import.meta.env.VITE_PUBLIC_BUILD === '1';

export function createEmptyProject(): Project {
  return {
    version: 1,
    name: 'My flat',
    levels: [
      {
        id: 'lvl-ground',
        name: 'Ground floor',
        elevation: 0,
        ceilingHeight: 2400,
        nodes: [],
        walls: [],
        rooms: [],
        items: [],
        stairs: [],
        markers: [],
      },
    ],
    catalogueOverrides: [],
  };
}

/** The project a first visit opens on, and what "Start again" goes back to. */
export async function createStartProject(): Promise<Project> {
  if (import.meta.env.VITE_PUBLIC_BUILD === '1') return createEmptyProject();
  const { createSeedProject } = await import('./seedAssets');
  return createSeedProject();
}

/** True when the project has nothing drawn on any floor. */
export function isBlankProject(p: Project): boolean {
  return p.levels.every((l) => l.walls.length === 0 && l.items.length === 0 && l.stairs.length === 0);
}
