// Data model from the brief, section 2. Implemented exactly; every extension
// is marked EXTENSION with the reason.

export type Id = string;
export type Vec2 = { x: number; y: number }; // mm, plan space, y down

export interface Project {
  version: 1;
  name: string;
  levels: Level[];
  catalogueOverrides: CatalogueItem[]; // user-created items
  // EXTENSION: her own values for the layout rules (brief §5: "every value is
  // editable in settings"), keyed by rule id then param name, in mm (or a
  // plain factor where the rule says so). Saved with the project so undo
  // and file export include them. Missing = UK default from the registry.
  ruleOverrides?: Record<string, Partial<Record<string, number>>>;
  // EXTENSION (phase 6, compare mode): which option of each floor is shown,
  // keyed by Level.scheme.group. Missing means the first option.
  activeSchemes?: Record<Id, Id>;
  // EXTENSION (materials and paint): saved colour schemes ("finish schemes", not
  // the floor "options" above). Each keeps a room's floor, wall, ceiling and
  // woodwork finish, keyed by ROOM NAME so a scheme saved on one option can be
  // applied to any other option or floor with the same room names.
  schemes?: FinishScheme[];
  // EXTENSION (costs): her own prices for the budget and shopping list. Any
  // missing value uses a rough UK default from src/model/costs.ts.
  costSettings?: Partial<CostSettings>;
}

// EXTENSION: see Project.costSettings. Money is in pounds.
export interface CostSettings {
  paintPerLitre: number; // £ per litre of paint
  coverage: number; // m² one litre covers, for one coat
  coats: number; // coats on walls and ceilings
  flooringWastagePct: number; // extra flooring to buy for cuts, in %
  contingencyPct: number; // spare money on top of the total, in %
  floorPerM2: Record<string, number>; // £ per m² for each floor finish id
}

// EXTENSION: see PlacedItem.status.
export type ItemStatus = 'idea' | 'shortlisted' | 'bought';

// EXTENSION: see Project.schemes. A missing field means "the default", so
// applying the scheme clears that override in the target room.
export interface FinishScheme {
  id: Id;
  name: string;
  rooms: Record<string, RoomFinishes>;
}

export interface RoomFinishes {
  floor?: string;
  walls?: string;
  ceiling?: string;
  woodwork?: string;
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
  // EXTENSION (phase 6, compare mode): set when this floor has several
  // options. `group` is the id of the original floor; `name` is "Option A"...
  scheme?: { group: Id; name: string };
  // EXTENSION (scan import): line drawing from a DXF export (a LiDAR scan
  // app's floor plan, or a surveyor's CAD file), in plan mm. Drawn faintly
  // under the walls; wall drawing snaps to its line ends. Walls are not
  // built from it automatically: CAD lines are not a wall graph.
  vectorUnderlay?: VectorUnderlay;
  // EXTENSION (engineer and landlord pack): notes pinned to the plan, so the
  // owners can brief the structural engineer ("is this a chimney breast?",
  // a measured length, an arrow to a wall). Drawn at a constant screen size
  // over the plan and listed in the print pack.
  notes?: PlanNote[];
  // EXTENSION (multi-select and groups): named sets of furniture ("Dining
  // set") that select, move, turn, duplicate and delete as one. An item is in
  // at most one group; a group has at least two members (a smaller one is
  // dissolved by src/model/groups.ts `pruneGroups`, which every edit runs).
  groups?: ItemGroup[];
}

// EXTENSION: see Level.groups.
export interface ItemGroup {
  id: Id;
  name: string;
  itemIds: Id[];
}

// EXTENSION: see Level.notes. `pos` is the note's anchor (a text note's pin,
// the start of a measure or arrow), `to` is the far end of a measure or an
// arrow. A measure shows its own length, so `text` is an optional comment.
export interface PlanNote {
  id: Id;
  kind: 'note' | 'measure' | 'arrow';
  pos: Vec2;
  to?: Vec2;
  text?: string;
  color?: string; // hex; each kind has its own default colour
}

// EXTENSION: see Level.vectorUnderlay.
export interface VectorUnderlay {
  name: string;
  /** Line segments [x1, y1, x2, y2] in plan mm. */
  segments: [number, number, number, number][];
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
  // EXTENSION (materials and paint): paint or finish for each face of the
  // wall, overriding the room's wall finish on that face only (a feature
  // wall). A value is a finish id (src/view3d/finishes.ts), a paint id
  // (src/model/palette.ts) or a hex colour. L and R are the left and right
  // of the wall as drawn from node a to node b.
  faces?: { L?: string; R?: string };
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
  // EXTENSION (materials and paint): ceiling paint (paint id or hex); white
  // when missing.
  ceilingFinish?: string;
  // EXTENSION: colour (paint id or hex) for the skirting, door leaves and
  // frames and window frames in this room; the standard white when missing.
  woodworkColor?: string;
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
  // EXTENSION: numbers for parametric items (catalogue `builder`), e.g. the
  // opening a bookcase surround frames: { gapW, gapH } in mm.
  params?: Record<string, number>;
  // EXTENSION: painted finish colour (hex) chosen for this piece; applies to
  // its painted/timber parts (tokens joinery, cabinet, wood, white).
  finish?: string;
  // EXTENSION (costs): what it costs and where to get it, for the budget and
  // shopping list. `price` is £ for one; `status` is missing while it is an idea.
  price?: number;
  supplier?: string;
  link?: string;
  status?: ItemStatus;
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
  // EXTENSION: name of a parametric shape builder (src/catalogue/builders.ts)
  // for items whose parts must not simply stretch when resized, such as a
  // bookcase surround whose middle gap must stay the size of the opening.
  builder?: string;
  // EXTENSION: a colour (hex) for the item's main body materials (fabric, wood,
  // joinery, cabinet, rug...), set for items made from a description such as
  // "tan leather". A piece's own `finish` still wins. See colors.ts `overrideColor`.
  tint?: string;
  // EXTENSION: where an item made from a description or an image link came
  // from, so the item panel can show the link and say how sure the size is.
  source?: { kind: 'description' | 'image'; text?: string; url?: string; sizeConfidence: string };
  // EXTENSION (costs): a default price in £ for her own items, copied onto a
  // piece when she places it.
  price?: number;
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
