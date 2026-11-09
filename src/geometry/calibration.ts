// Underlay image <-> plan transforms and two-point scale calibration.

import type { Underlay, Vec2 } from '../model/types';
import { add, dist, mul, rotate, sub } from './vec';

export function imageToWorld(u: Underlay, px: Vec2): Vec2 {
  return add(u.offset, rotate(mul(px, u.scaleMmPerPx), u.rotationDeg));
}

export function worldToImage(u: Underlay, p: Vec2): Vec2 {
  return mul(rotate(sub(p, u.offset), -u.rotationDeg), 1 / u.scaleMmPerPx);
}

/**
 * Two points she clicked on the image (in plan space) and the real distance
 * between them. Returns the underlay rescaled so that distance is true,
 * with the first point staying where it was on screen.
 */
export function calibrate(u: Underlay, p1: Vec2, p2: Vec2, realMm: number): Underlay {
  const i1 = worldToImage(u, p1);
  const i2 = worldToImage(u, p2);
  const px = dist(i1, i2);
  if (px < 1e-6 || realMm <= 0) return u;
  const scale = realMm / px;
  const offset = sub(p1, rotate(mul(i1, scale), u.rotationDeg));
  return { ...u, scaleMmPerPx: scale, offset };
}
