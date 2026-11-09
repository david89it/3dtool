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
};

export function planColor(token: string): string {
  return PLAN_COLORS[token] ?? '#cfcac2';
}
