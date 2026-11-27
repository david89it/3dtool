// Shared three.js materials. Created once and reused by every mesh, so
// switching floors or editing a wall never piles up GPU objects.

import * as THREE from 'three';
import { drawFinish, findSurface, surfaceColor, type Finish } from './finishes';
import { proceduralTexture, type TextureKind } from './proceduralTextures';

interface Token {
  color: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  emissive?: string;
  /** Generated surface texture (grain, weave, speckle) and how strongly it bumps. */
  tex?: TextureKind;
  bump?: number;
  /** A clear glossy layer on top, for glazed ceramic and varnish. */
  clearcoat?: number;
}

const TOKENS: Record<string, Token> = {
  wood: { color: '#b58a58', roughness: 0.55, tex: 'wood', bump: 0.25, clearcoat: 0.25 },
  fabric: { color: '#b4ada1', roughness: 1, tex: 'fabric', bump: 1.2 },
  linen: { color: '#f1eee7', roughness: 1, tex: 'fabric', bump: 0.8 },
  white: { color: '#f2f2ef', roughness: 0.7 },
  metal: { color: '#c3c6cb', roughness: 0.28, metalness: 0.95 },
  dark: { color: '#3a3d42', roughness: 0.6 },
  stone: { color: '#a39d92', roughness: 0.75, tex: 'stone', bump: 0.5 },
  glass: { color: '#d6e8f2', roughness: 0.02, opacity: 0.16, clearcoat: 1 },
  green: { color: '#5b8a4b', roughness: 0.9 },
  ceramic: { color: '#fafafa', roughness: 0.15, clearcoat: 1 },
  worktop: { color: '#e8e5de', roughness: 0.3, tex: 'stone', bump: 0.15, clearcoat: 0.6 },
  cabinet: { color: '#e5e2da', roughness: 0.45, clearcoat: 0.3 },
  mirror: { color: '#e8eef2', roughness: 0.02, metalness: 1 },
  screen: { color: '#0e1014', roughness: 0.12, clearcoat: 1 },
  shade: { color: '#f3eadb', roughness: 0.9, emissive: '#3a3226' },
  rug: { color: '#9a8e7e', roughness: 1, tex: 'fabric', bump: 1.6 },
  plaster: { color: '#efede8', roughness: 0.95, tex: 'plaster', bump: 0.3 },
  water: { color: '#9fcbe3', roughness: 0.05, opacity: 0.6, clearcoat: 1 },
  art: { color: '#c46a4a', roughness: 0.8 },
  custom: { color: '#9fb3c8', roughness: 0.7 },
  door: { color: '#f6f5f1', roughness: 0.55 },
  frame: { color: '#f4f4f1', roughness: 0.5 },
  stair: { color: '#c9b08a', roughness: 0.6, tex: 'wood', bump: 0.25 },
  masonry: { color: '#e9e6df', roughness: 0.95, tex: 'plaster', bump: 0.4 },
  joinery: { color: '#e7e1d6', roughness: 0.45, clearcoat: 0.2 },
  hinoki: { color: '#dcc092', roughness: 0.6, tex: 'wood', bump: 0.25 },
};

const tokenCache = new Map<string, THREE.Material>();

/** One physically based material from a token, optionally repainted in `hex`. */
function buildMaterial(t: Token, hex?: string): THREE.MeshStandardMaterial {
  const glassy = t.opacity !== undefined;
  const params = {
    color: hex ?? t.color,
    roughness: hex ? Math.min(0.6, t.roughness ?? 0.6) : (t.roughness ?? 0.8),
    metalness: hex ? 0 : (t.metalness ?? 0),
    transparent: glassy,
    opacity: t.opacity ?? 1,
    emissive: t.emissive ?? '#000000',
    depthWrite: !glassy,
  };
  const m = t.clearcoat ? new THREE.MeshPhysicalMaterial({ ...params, clearcoat: t.clearcoat, clearcoatRoughness: 0.08 }) : new THREE.MeshStandardMaterial(params);
  const tex = t.tex ? proceduralTexture(t.tex) : null;
  if (tex) {
    m.map = tex;
    m.bumpMap = tex;
    m.bumpScale = t.bump ?? 0.5;
  }
  return m;
}

export function tokenMaterial(token: string): THREE.Material {
  const hit = tokenCache.get(token);
  if (hit) return hit;
  const m = buildMaterial(TOKENS[token] ?? { color: '#999999', roughness: 0.8 });
  tokenCache.set(token, m);
  return m;
}

const tintCache = new Map<string, THREE.Material>();

/** A token's material repainted in a piece's chosen finish colour. */
export function tintedMaterial(token: string, hex: string): THREE.Material {
  const key = `${token}|${hex}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const m = buildMaterial(TOKENS[token] ?? { color: hex, roughness: 0.6 }, hex);
  tintCache.set(key, m);
  return m;
}

const finishCache = new Map<string, THREE.MeshStandardMaterial>();
const woodCache = new Map<string, THREE.MeshStandardMaterial>();
const ceilingCache = new Map<string, THREE.MeshStandardMaterial>();

function finishTexture(f: Finish): THREE.Texture | null {
  if (f.kind === 'paint' || typeof document === 'undefined') return null;
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  drawFinish(ctx, f, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Geometry UVs are in metres; one texture covers tileM metres.
  tex.repeat.set(1 / f.tileM, 1 / f.tileM);
  if (f.rotation) {
    tex.center.set(0.5, 0.5);
    tex.rotation = f.rotation;
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function finishMaterial(id: string, fallback: string): THREE.MeshStandardMaterial {
  const key = id || fallback;
  const hit = finishCache.get(key);
  if (hit) return hit;
  // Paint ids and hex colours are shared too: one material per colour.
  const f = findSurface(key) ?? findSurface(fallback)!;
  const map = finishTexture(f);
  const m = new THREE.MeshStandardMaterial({
    color: map ? '#ffffff' : f.color,
    map,
    roughness: f.roughness,
  });
  finishCache.set(key, m);
  return m;
}

/** Ceilings: plain white, seen only from below. */
export const ceilingMaterial = new THREE.MeshStandardMaterial({ color: '#fbfbf9', roughness: 1, side: THREE.FrontSide });

/** Ceiling in a room's own paint (a paint id or hex), shared by colour. White or unknown gives the plain ceiling. */
export function ceilingMaterialFor(id: string | undefined): THREE.Material {
  const hex = surfaceColor(id);
  if (!id || !hex || id === 'paint-chalk-white') return ceilingMaterial;
  const hit = ceilingCache.get(hex);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 1, side: THREE.FrontSide });
  ceilingCache.set(hex, m);
  return m;
}

/** Painted woodwork (skirting, door leaves and frames, window frames): one material per colour. */
export function woodworkMaterial(hex: string): THREE.Material {
  const hit = woodCache.get(hex);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.5, metalness: 0 });
  woodCache.set(hex, m);
  return m;
}
