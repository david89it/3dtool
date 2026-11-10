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
  /** Page position of a selected opening's measurement (tests). */
  openingLabelPos: (_openingId: string, _field: 'width' | 'before' | 'after'): Vec2 | null => null,
  /** Page position of a wall's amber structural pin (tests). */
  structuralPinPos: (_wallId: string): Vec2 | null => null,
  /** Plan position under a page point, or null when it is outside the canvas. */
  clientToWorld: (_client: Vec2): Vec2 | null => null,
  /** Update the placement preview for a palette drag at a page point. */
  ghostAt: (_client: Vec2) => {},
  /** Place the opening being dragged from the palette. */
  dropGhost: (): boolean => false,
  /** Update the furniture placement preview for a catalogue drag at a page point. */
  itemGhostAt: (_client: Vec2, _catalogueId: string, _alt?: boolean) => {},
  /** Place the furniture item being dragged from the catalogue. */
  dropItemGhost: (): boolean => false,
  /**
   * Draw one floor on its own, fitted to width x height (logical pixels), with no selection or
   * hover, and return a PNG data URL (pixelRatio times larger for print). Null if the floor has
   * nothing to draw. Works in any mode, even while 3D is showing.
   */
  renderLevelImage: async (
    _levelId: string,
    _opts: { width: number; height: number; pixelRatio?: number },
  ): Promise<string | null> => null,
  /** Zoom and pan so these plan points fill the view, with room around them. */
  fitPoints: (_pts: Vec2[]) => {},
};
