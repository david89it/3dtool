// Browser-only part of the seed: lay the agent's floorplan under each level.
// Only reachable from non-public builds (see firstRun.ts).

import floorplanUrl from '../../assets/floorplan-bleuplan.png';
import type { Project } from './types';
import { applySeedUnderlays, buildSeedProject } from './seed';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the floorplan image'));
    img.src = src;
  });
}

export async function createSeedProject(): Promise<Project> {
  const project = buildSeedProject();
  try {
    const img = await loadImage(floorplanUrl);
    applySeedUnderlays(project, (spec) => {
      const c = document.createElement('canvas');
      c.width = spec.crop.w;
      c.height = spec.crop.h;
      const ctx = c.getContext('2d');
      if (!ctx) return undefined;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, spec.crop.x, spec.crop.y, spec.crop.w, spec.crop.h, 0, 0, spec.crop.w, spec.crop.h);
      return c.toDataURL('image/png');
    });
  } catch {
    // The plan still works without the picture underneath.
  }
  return project;
}
