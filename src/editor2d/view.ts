import type { Level, Vec2 } from '../model/types';
import { imageToWorld } from '../geometry/calibration';

/** Screen = world (mm) * scale + offset. scale is pixels per millimetre. */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export const toScreen = (v: View, p: Vec2): Vec2 => ({ x: p.x * v.scale + v.x, y: p.y * v.scale + v.y });
export const toWorld = (v: View, p: Vec2): Vec2 => ({ x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale });

export const MIN_SCALE = 0.005;
export const MAX_SCALE = 2;

export function zoomAt(v: View, screen: Vec2, factor: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
  const w = toWorld(v, screen);
  return { scale, x: screen.x - w.x * scale, y: screen.y - w.y * scale };
}

export function levelBounds(level: Level): { min: Vec2; max: Vec2 } | null {
  const pts: Vec2[] = level.nodes.map((n) => n.pos);
  for (const m of level.markers ?? []) pts.push(m.pos);
  for (const n of level.notes ?? []) pts.push(...(n.to ? [n.pos, n.to] : [n.pos]));
  const u = level.underlay;
  if (u && level.nodes.length === 0) {
    const img = underlaySize.get(u.imageDataUrl);
    if (img) {
      pts.push(imageToWorld(u, { x: 0, y: 0 }), imageToWorld(u, { x: img.w, y: img.h }));
    } else pts.push(u.offset);
  }
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}

/** Natural size of underlay images, filled in as they load (used for fitting). */
export const underlaySize = new Map<string, { w: number; h: number }>();

export function fitView(level: Level | undefined, width: number, height: number): View {
  let b = level ? levelBounds(level) : null;
  if (!b || (b.max.x - b.min.x < 500 && b.max.y - b.min.y < 500)) {
    const c = b ? b.min : { x: 0, y: 0 };
    b = { min: { x: c.x - 4000, y: c.y - 3000 }, max: { x: c.x + 4000, y: c.y + 3000 } };
  }
  const pad = 70;
  const w = Math.max(1, b.max.x - b.min.x);
  const h = Math.max(1, b.max.y - b.min.y);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((width - pad * 2) / w, (height - pad * 2) / h)));
  return {
    scale,
    x: width / 2 - ((b.min.x + b.max.x) / 2) * scale,
    y: height / 2 - ((b.min.y + b.max.y) / 2) * scale,
  };
}
