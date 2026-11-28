// Shadow bias that follows the shadow map's texel size. A fixed bias is too small when the map
// covers a big area (coarse texels: stair-stepped acne on walls the sun just grazes) and too big
// when it covers a small one (shadows detach from the objects). The normal bias pushes the
// lookup point along the surface normal by a share of one texel, which removes the acne
// without lifting shadows off the floor.

export interface ShadowBias {
  /** Depth bias (small, negative). */
  bias: number;
  /** Normal offset in world units (metres). */
  normalBias: number;
}

/** World size of one shadow-map texel for an orthographic shadow frustum. */
export function texelSize(left: number, right: number, bottom: number, top: number, mapSize: number): number {
  const span = Math.max(Math.abs(right - left), Math.abs(top - bottom));
  return mapSize > 0 ? span / mapSize : 0;
}

/** Bias for a given texel size: the normal bias is about two texels, clamped to a sane range. */
export function biasForTexel(texel: number): ShadowBias {
  const normalBias = Math.min(0.12, Math.max(0.01, texel * 2));
  return { bias: -0.0002, normalBias };
}
