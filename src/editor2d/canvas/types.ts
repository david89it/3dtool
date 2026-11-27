// Small state shapes shared by the canvas pieces.
import type { Vec2 } from '../../model/types';
import type { ContextHit } from '../contextMenu';
import type { OpeningLabel } from '../openingLabels';

export interface LabelEdit {
  /** Set when editing an opening's measurement instead of a wall length. */
  opening?: { id: string; field: OpeningLabel['field'] };
  wallId: string;
  screen: Vec2;
  angle: number;
  current: number;
  text: string;
  error?: string;
}

export interface CalibState {
  p1: Vec2;
  p2: Vec2;
  text: string;
  error?: string;
}

export interface MenuState {
  hit: ContextHit;
  at: Vec2;
  touch: boolean;
}
