// The 3D quality setting: "Fast" keeps the view smooth on an iPad, "Beautiful"
// adds the effects that cost the most (ambient occlusion, bigger and softer
// shadows, rounded furniture edges, sharper pixels). It is a viewing
// preference, so it lives outside the project (never saved with the flat or
// undone) and is remembered in this browser only.

import { create } from 'zustand';

export type Quality = 'fast' | 'beautiful';

export interface QualityProfile {
  /** Sun shadow map size in pixels. */
  shadowMap: number;
  /** Soft shadow blur radius. */
  shadowRadius: number;
  /** Screen-space ambient occlusion: contact shadows in corners and under furniture. */
  ao: boolean;
  /** Corner radius of furniture parts in mm (0 = sharp boxes). */
  bevelMm: number;
  /** Highest pixel ratio the canvas may use. */
  maxDpr: number;
  /** Multisampling for the post-processed picture. */
  msaa: number;
}

export const PROFILES: Record<Quality, QualityProfile> = {
  fast: { shadowMap: 1024, shadowRadius: 2, ao: false, bevelMm: 0, maxDpr: 1.5, msaa: 0 },
  beautiful: { shadowMap: 4096, shadowRadius: 5, ao: true, bevelMm: 6, maxDpr: 2, msaa: 4 },
};

const KEY = 'flatplan.quality3d';

/** Beautiful on a desktop with a mouse; Fast on a touch device (iPad) or under test automation. */
export function defaultQuality(): Quality {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'fast' || stored === 'beautiful') return stored;
  } catch {
    /* private window: fall through */
  }
  if (typeof navigator !== 'undefined' && navigator.webdriver) return 'fast';
  const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  return touch ? 'fast' : 'beautiful';
}

interface QualityState {
  quality: Quality;
  set: (q: Quality) => void;
}

export const useQuality = create<QualityState>((set) => ({
  quality: defaultQuality(),
  set: (quality) => {
    try {
      localStorage.setItem(KEY, quality);
    } catch {
      /* not remembered */
    }
    set({ quality });
  },
}));

export const useProfile = (): QualityProfile => PROFILES[useQuality((s) => s.quality)];
