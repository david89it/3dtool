// Browser-only part of the seed: lay the agent's floorplan under each level.

import floorplanUrl from '../../assets/floorplan-bleuplan.png';
import type { Project } from './types';
import { buildSeedProject, SEED_SCALE_MM_PER_PX, SEED_UNDERLAYS } from './seed';

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
    for (const spec of SEED_UNDERLAYS) {
      const level = project.levels.find((l) => l.id === spec.levelId);
      if (!level) continue;
      const c = document.createElement('canvas');
      c.width = spec.crop.w;
      c.height = spec.crop.h;
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, spec.crop.x, spec.crop.y, spec.crop.w, spec.crop.h, 0, 0, spec.crop.w, spec.crop.h);
      level.underlay = {
        imageDataUrl: c.toDataURL('image/png'),
        scaleMmPerPx: SEED_SCALE_MM_PER_PX,
        offset: {
          x: (spec.crop.x - spec.originPx.x) * SEED_SCALE_MM_PER_PX,
          y: (spec.crop.y - spec.originPx.y) * SEED_SCALE_MM_PER_PX,
        },
        rotationDeg: 0,
        opacity: 0.45,
        locked: true,
      };
    }
  } catch {
    // The plan still works without the picture underneath.
  }
  return project;
}
