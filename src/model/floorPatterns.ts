// How wooden floors are laid: the patterns she can choose, which floor finishes count as
// wood, and what each pattern means for the budget. Pure data and small functions, no
// drawing (the 3D textures are in src/view3d/floorTextures.ts).

import type { FloorAngle, FloorPattern, Room } from './types';

export interface PatternInfo {
  id: FloorPattern;
  name: string;
  /** One line shown under the picker. */
  hint: string;
  /** Extra flooring to buy, in percentage points on top of the usual cutting allowance. */
  extraWastePct: number;
  /** Plain note for the budget when the pattern costs more to lay; undefined for plain boards. */
  labourNote?: string;
}

export const FLOOR_PATTERNS: PatternInfo[] = [
  { id: 'straight', name: 'Straight planks', hint: 'Long boards side by side, the usual way.', extraWastePct: 0 },
  { id: 'wide', name: 'Wide plank', hint: 'Fewer, wider and longer boards. Calm and modern.', extraWastePct: 0 },
  {
    id: 'herringbone',
    name: 'Herringbone',
    hint: 'Short blocks meeting at right angles in a zig-zag.',
    extraWastePct: 10,
    labourNote: 'Herringbone takes longer to lay, so fitters usually charge more. Ask for a quote.',
  },
  {
    id: 'chevron',
    name: 'Chevron',
    hint: 'Boards cut at an angle so the ends meet in neat arrows.',
    extraWastePct: 15,
    labourNote: 'Chevron takes the longest to lay and wastes the most wood, so it costs more. Ask for a quote.',
  },
  {
    id: 'parquet',
    name: 'Basket weave',
    hint: 'Square groups of short strips, turned a quarter each time.',
    extraWastePct: 5,
    labourNote: 'Basket weave parquet is laid block by block, so it takes a little longer than boards.',
  },
];

export const FLOOR_ANGLES: { id: FloorAngle; name: string }[] = [
  { id: 0, name: 'Along the room' },
  { id: 90, name: 'Across the room' },
  { id: 45, name: 'Diagonal' },
];

/** Floor finishes that are wooden, so the pattern picker applies. */
const WOOD_KINDS: readonly string[] = ['timber', 'herringbone', 'chevron'];

export const isWoodKind = (kind: string | undefined): boolean => !!kind && WOOD_KINDS.includes(kind);

/** The pattern a floor finish has by itself, before she chooses one. */
export function finishPattern(kind: string | undefined): FloorPattern {
  return kind === 'herringbone' ? 'herringbone' : kind === 'chevron' ? 'chevron' : 'straight';
}

export const patternInfo = (id: FloorPattern): PatternInfo => FLOOR_PATTERNS.find((p) => p.id === id) ?? FLOOR_PATTERNS[0];

/** The pattern a room's floor really has: her choice, else the finish's own. Undefined for floors that are not wood. */
export function effectivePattern(room: Pick<Room, 'floorPattern'> | undefined, kind: string | undefined): FloorPattern | undefined {
  if (!isWoodKind(kind)) return undefined;
  const p = room?.floorPattern;
  return p && FLOOR_PATTERNS.some((x) => x.id === p) ? p : finishPattern(kind);
}

/** The direction a room's boards run (0 when not chosen or invalid). */
export function effectiveAngle(room: Pick<Room, 'floorAngle'> | undefined): FloorAngle {
  const a = room?.floorAngle;
  return a === 45 || a === 90 ? a : 0;
}

/** Percentage points of extra flooring this pattern needs (0 for non-wood floors). */
export function patternWastePct(pattern: FloorPattern | undefined): number {
  return pattern ? patternInfo(pattern).extraWastePct : 0;
}

/** "Oak boards, herringbone" for lists; just the finish name when not wood, plain boards, or already named so. */
export function floorLabel(finishName: string, pattern: FloorPattern | undefined): string {
  if (!pattern || pattern === 'straight') return finishName;
  const name = patternInfo(pattern).name.toLowerCase();
  return finishName.toLowerCase().includes(name) ? finishName : `${finishName}, ${name}`;
}
