// Data model from the brief, section 2. Implemented exactly; every extension
// is marked EXTENSION with the reason.

export type Id = string;
export type Vec2 = { x: number; y: number }; // mm, plan space, y down

export interface Project {
  version: 1;
  name: string;
  levels: Level[];
  catalogueOverrides: CatalogueItem[]; // user-created items
}

export interface Level {
  id: Id;
  name: string; // "First floor", "Second floor", "Loft"
  elevation: number; // mm, floor level relative to the entrance
  ceilingHeight: number; // mm, default per room can override
  underlay?: Underlay;
  nodes: WallNode[];
  walls: Wall[];
  rooms: Room[]; // derived from the wall graph, user can name
  items: PlacedItem[];
  stairs: Stair[];
  // EXTENSION: "measure me" pins (brief §6 asks for a visible marker on every
  // unknown: chimney breast depth, radiator positions, the loft note...).
  // Free-floating pins are the simplest way to show them without inventing
  // fields on every object.
  markers?: Marker[];
  // EXTENSION: true while elevation/ceilingHeight are seed guesses (§6).
  // Cleared as soon as she types a value.
  estimated?: boolean;
}

// EXTENSION: see Level.markers.
export interface Marker {
  id: Id;
  pos: Vec2;
  text: string;
}

export interface Underlay {
  imageDataUrl: string;
  scaleMmPerPx: number; // from two-point calibration
  offset: Vec2;
  rotationDeg: number;
  opacity: number; // 0..1
  locked: boolean;
}

export interface WallNode {
  id: Id;
  pos: Vec2;
}

export type WallKind = 'external' | 'internal' | 'party';
export type Structural = 'unknown' | 'loadBearing' | 'nonLoadBearing';

export interface Wall {
  id: Id;
  a: Id;
  b: Id; // node ids; walls form a graph, shared nodes move together
  thickness: number; // mm; default 100 internal, 330 external solid brick
  height?: number; // falls back to level ceiling height
  kind: WallKind;
  structural: Structural; // user-set, never inferred as safe
  openings: Opening[];
  // EXTENSION: true while position/length/thickness come from the agent's
  // not-to-scale plan. Shown as "≈" on the dimension label until she edits
  // or confirms it.
  estimated?: boolean;
}

export type OpeningType = 'door' | 'window' | 'bayWindow' | 'opening';

export interface Opening {
  id: Id;
  type: OpeningType; // 'opening' = cased opening, no leaf
  offset: number; // mm from node a along the wall to the opening's near edge
  width: number; // mm
  height: number; // mm
  sill: number; // mm, 0 for doors and openings
  swing?: { hinge: 'start' | 'end'; side: 'left' | 'right'; angle: number }; // doors only
  // EXTENSION: same meaning as Wall.estimated.
  estimated?: boolean;
  // EXTENSION: true for openings already in the flat (from the seed). The
  // structural badge (brief §3 phase 2) is about openings she cuts, so it
  // needs to tell new from existing. Moving or enlarging one clears it.
  existing?: boolean;
  // EXTENSION: she chose to allow piers under 100 mm in a structural wall
  // (brief: "with an override and a warning").
  nibOverride?: boolean;
}

export interface Room {
  id: Id;
  name: string;
  boundary: Id[];
  ceilingHeight?: number;
  floorFinish?: string; // swatch id from src/view3d/finishes.ts
  // EXTENSION: brief phase 5 asks for a finish per room for floor AND walls;
  // the model only had floorFinish. Swatch id from src/view3d/finishes.ts.
  wallFinish?: string;
}

export interface PlacedItem {
  id: Id;
  catalogueId: string;
  pos: Vec2; // centre
  rotationDeg: number; // snaps to 90 by default, free with a modifier
  dims: { w: number; d: number; h: number }; // copied from catalogue, editable
  state?: string; // e.g. Murphy bed 'folded' | 'deployed'
  mountedTo?: { wallId: Id; offset: number }; // wall-hung items
  // EXTENSION: "lock" (brief phase 3): a locked item can't be moved, resized
  // or rotated by drag or by a rule fix until unlocked.
  locked?: boolean;
}

// Convention (not specified in the brief, recorded in DECISIONS.md):
// pos is the centre; `length` runs along the stair's local x axis and the
// arrow (direction of travel, up or down) points towards local +x before
// rotation. rotationDeg is clockwise on screen, like everything else.
export interface Stair {
  id: Id;
  pos: Vec2;
  rotationDeg: number;
  width: number;
  length: number;
  toLevelId: Id;
  direction: 'up' | 'down';
}

export interface CatalogueItem {
  id: string;
  name: string;
  aliases: string[];
  category:
    | 'sleep'
    | 'sit'
    | 'table'
    | 'storage'
    | 'kitchen'
    | 'bath'
    | 'utility'
    | 'lighting'
    | 'decor'
    | 'structure';
  defaultDims: { w: number; d: number; h: number };
  resizable: { w?: [number, number]; d?: [number, number]; h?: [number, number] };
  mount: 'floor' | 'wall' | 'ceiling';
  geometry: PrimitivePart[];
  states?: Record<string, { dims: { w: number; d: number; h: number }; geometry: PrimitivePart[] }>;
  clearance: Clearance[];
  rules?: RuleRef[];
}

export interface PrimitivePart {
  shape: 'box' | 'cylinder';
  pos: [number, number, number];
  size: [number, number, number];
  colorToken: string;
}

export interface Clearance {
  side: 'front' | 'back' | 'left' | 'right' | 'all';
  min: number;
  ideal: number;
  reason: string;
  dynamic?: 'doorSwing' | 'drawerPull' | 'deploy';
}

export type RuleRef = string;
