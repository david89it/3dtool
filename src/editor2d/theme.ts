import type { WallKind } from '../model/types';

export const COLORS = {
  paper: '#f7f5f0',
  wall: { external: '#2e3136', party: '#464b53', internal: '#666c75' } satisfies Record<WallKind, string>,
  wallSelected: '#2563eb',
  wallHover: '#3b82f6',
  solid: '#464b53',
  gap: '#f7f5f0',
  glass: '#7fb4d9',
  door: '#555b63',
  roomFills: ['#e7eee3', '#e4ebf3', '#f3eadf', '#eee5ee', '#e2efec', '#f1eedc', '#e9e6f3'],
  roomSelected: '#cfe0fb',
  label: '#1f2328',
  labelMuted: '#5b6169',
  accent: '#2563eb',
  amber: '#d97706',
  amberBg: '#fff4dc',
  snap: '#e11d48',
  stair: '#8a8f97',
};

export function roomFill(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS.roomFills[h % COLORS.roomFills.length];
}

export const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
