// Small generated textures (no downloads): wood grain, woven fabric, stone
// speckle and plaster. Each is drawn once on a canvas with a seeded random
// generator, so the picture is the same every time. They are greyscale and
// are used as the colour multiplier and as the bump map, so one texture
// serves every tint of a material. UVs are in metres (see boxProjectUVs).

import * as THREE from 'three';

export type TextureKind = 'wood' | 'fabric' | 'stone' | 'plaster';

/** Metres of surface one texture covers. */
const TILE_M: Record<TextureKind, number> = { wood: 0.6, fabric: 0.12, stone: 0.5, plaster: 1 };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const grey = (v: number) => {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${c},${c},${c})`;
};

function drawWood(ctx: CanvasRenderingContext2D, n: number, r: () => number) {
  ctx.fillStyle = grey(232);
  ctx.fillRect(0, 0, n, n);
  // Long, slightly wavy grain lines of varying darkness.
  for (let i = 0; i < 150; i++) {
    const y = r() * n;
    const amp = 1 + r() * 3;
    const ph = r() * 6.28;
    ctx.strokeStyle = grey(185 + r() * 55);
    ctx.globalAlpha = 0.2 + r() * 0.3;
    ctx.lineWidth = 0.5 + r() * 1.2;
    ctx.beginPath();
    for (let x = 0; x <= n; x += 8) {
      const yy = y + Math.sin(((x / n) * 6.2832 * 3) + ph) * amp;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function speckle(ctx: CanvasRenderingContext2D, n: number, r: () => number, base: number, spread: number, count: number, size: number) {
  ctx.fillStyle = grey(base);
  ctx.fillRect(0, 0, n, n);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = grey(base + (r() - 0.5) * spread);
    const s = 0.6 + r() * size;
    ctx.fillRect(r() * n, r() * n, s, s);
  }
}

function drawFabric(ctx: CanvasRenderingContext2D, n: number, r: () => number) {
  ctx.fillStyle = grey(215);
  ctx.fillRect(0, 0, n, n);
  const step = 4;
  for (let y = 0; y < n; y += step) {
    for (let x = 0; x < n; x += step) {
      ctx.fillStyle = grey(((x / step + y / step) & 1 ? 190 : 235) + (r() - 0.5) * 20);
      ctx.fillRect(x, y, step - 1, step - 1);
    }
  }
}

function draw(kind: TextureKind, ctx: CanvasRenderingContext2D, n: number) {
  const r = rng(kind.length * 7919 + 11);
  if (kind === 'wood') drawWood(ctx, n, r);
  else if (kind === 'fabric') drawFabric(ctx, n, r);
  else if (kind === 'stone') speckle(ctx, n, r, 215, 90, 5000, 3);
  else speckle(ctx, n, r, 238, 30, 6000, 2);
}

const cache = new Map<TextureKind, THREE.CanvasTexture | null>();

/** A shared greyscale texture, or null where there is no canvas (unit tests). */
export function proceduralTexture(kind: TextureKind): THREE.CanvasTexture | null {
  if (cache.has(kind)) return cache.get(kind) ?? null;
  let tex: THREE.CanvasTexture | null = null;
  if (typeof document !== 'undefined') {
    const n = 256;
    const c = document.createElement('canvas');
    c.width = n;
    c.height = n;
    const ctx = c.getContext('2d');
    if (ctx) {
      draw(kind, ctx, n);
      tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1 / TILE_M[kind], 1 / TILE_M[kind]);
      tex.anisotropy = 4;
      tex.colorSpace = THREE.SRGBColorSpace;
    }
  }
  cache.set(kind, tex);
  return tex;
}
