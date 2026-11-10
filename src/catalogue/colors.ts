// Colour tokens used by catalogue parts. One palette for the plan view;
// the 3D view keeps its own material table keyed by the same tokens.

export const PLAN_COLORS: Record<string, string> = {
  wood: '#c9a57d',
  fabric: '#9ba7b4',
  linen: '#eef0f3',
  white: '#f5f4f1',
  dark: '#4b4f56',
  metal: '#b8bdc3',
  cabinet: '#e8e2d8',
  worktop: '#d6d0c6',
  ceramic: '#fcfcfc',
  water: '#c3e2f3',
  glass: '#cfe7f5',
  screen: '#2b2f36',
  mirror: '#d9e8ef',
  green: '#7fa86b',
  stone: '#bcb4a7',
  rug: '#dccbb4',
  shade: '#f3ebd9',
  plaster: '#e6e1d8',
  art: '#c8a39f',
  custom: '#c7d5ea',
  joinery: '#e7e1d6', // painted built-in joinery (her finish colour overrides it)
  hinoki: '#e2c9a0', // pale warm cedar
};

export function planColor(token: string): string {
  return PLAN_COLORS[token] ?? '#cfcac2';
}

/** Tokens that take a piece's chosen paint or timber finish. */
export const FINISHABLE = new Set(['joinery', 'cabinet', 'wood', 'white']);

/** Colour of a part in plan, with the piece's finish applied. */
export function partColor(token: string, finish?: string): string {
  return finish && FINISHABLE.has(token) ? finish : planColor(token);
}

/** Classic joinery colours offered in the item panel. */
export const FINISH_SWATCHES: { name: string; hex: string }[] = [
  { name: 'Aubergine', hex: '#5a2a3a' },
  { name: 'Off-black', hex: '#2b2a29' },
  { name: 'Deep green', hex: '#2f4a3a' },
  { name: 'Navy', hex: '#24324a' },
  { name: 'Warm grey', hex: '#9a938a' },
  { name: 'White', hex: '#f3f1ec' },
  { name: 'Natural oak', hex: '#c49a6c' },
];
