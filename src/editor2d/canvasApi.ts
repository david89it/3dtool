// A small bridge so panels, keyboard shortcuts and tests can reach the
// canvas without prop drilling. Filled in by PlanCanvas when it mounts.

import type { Vec2 } from '../model/types';
import type { View } from './view';

export const canvasApi = {
  escape: () => {},
  finishTrace: () => {},
  fit: () => {},
  zoom: (_factor: number) => {},
  exportPng: (): string | null => null,
  worldToScreen: (p: Vec2): Vec2 => p,
  getView: (): View => ({ scale: 1, x: 0, y: 0 }),
  /** Page position of a wall's dimension label (tests). */
  dimLabelPos: (_wallId: string): Vec2 | null => null,
};
