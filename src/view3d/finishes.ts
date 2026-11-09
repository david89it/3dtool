// Floor and wall finishes: a small palette of swatches, each drawn as a
// procedural canvas texture (no image files to ship).

export type FinishKind = 'timber' | 'carpet' | 'tile' | 'cork' | 'concrete' | 'paint' | 'panel';

export interface Finish {
  id: string;
  name: string;
  kind: FinishKind;
  color: string; // swatch chip and base colour
  /** Metres of floor or wall that one copy of the texture covers. */
  tileM: number;
  roughness: number;
}

export const FLOOR_FINISHES: Finish[] = [
  { id: 'floor-oak', name: 'Oak boards', kind: 'timber', color: '#b98f5e', tileM: 1.2, roughness: 0.6 },
  { id: 'floor-pale-oak', name: 'Pale oak', kind: 'timber', color: '#d9bf98', tileM: 1.2, roughness: 0.6 },
  { id: 'floor-walnut', name: 'Walnut', kind: 'timber', color: '#6e4b33', tileM: 1.2, roughness: 0.55 },
  { id: 'floor-carpet-grey', name: 'Grey carpet', kind: 'carpet', color: '#8e8f8d', tileM: 0.5, roughness: 1 },
  { id: 'floor-carpet-oatmeal', name: 'Oatmeal carpet', kind: 'carpet', color: '#cbbfa8', tileM: 0.5, roughness: 1 },
  { id: 'floor-tile-white', name: 'White tile', kind: 'tile', color: '#ecebe7', tileM: 1.2, roughness: 0.3 },
  { id: 'floor-tile-grey', name: 'Grey tile', kind: 'tile', color: '#a19f9a', tileM: 1.2, roughness: 0.35 },
  { id: 'floor-cork', name: 'Cork', kind: 'cork', color: '#b98a5a', tileM: 0.6, roughness: 0.9 },
  { id: 'floor-concrete', name: 'Painted concrete', kind: 'concrete', color: '#b4b2ad', tileM: 2, roughness: 0.8 },
];

export const WALL_FINISHES: Finish[] = [
  { id: 'wall-white', name: 'White', kind: 'paint', color: '#f4f3ef', tileM: 1, roughness: 0.95 },
  { id: 'wall-warm-white', name: 'Warm white', kind: 'paint', color: '#efe7d8', tileM: 1, roughness: 0.95 },
  { id: 'wall-sage', name: 'Sage', kind: 'paint', color: '#b7c2a7', tileM: 1, roughness: 0.95 },
  { id: 'wall-blue-grey', name: 'Blue-grey', kind: 'paint', color: '#a9b4bd', tileM: 1, roughness: 0.95 },
  { id: 'wall-plaster-pink', name: 'Plaster pink', kind: 'paint', color: '#e2c1b3', tileM: 1, roughness: 0.95 },
  { id: 'wall-tile-white', name: 'White tile', kind: 'tile', color: '#f2f1ee', tileM: 1.2, roughness: 0.25 },
  { id: 'wall-timber-panel', name: 'Timber panelling', kind: 'panel', color: '#c49a6c', tileM: 1.2, roughness: 0.6 },
];

const WET = /kitchen|bath|shower|wc|toilet|utility|cloak/i;

/** Defaults that match the listing photos: pale oak everywhere, grey tile in the bathroom. */
export function defaultFloorId(roomName: string): string {
  return /bath|shower|wc/i.test(roomName) ? 'floor-tile-grey' : 'floor-pale-oak';
}

export function defaultWallId(roomName: string): string {
  return /bath|shower/i.test(roomName) ? 'wall-tile-white' : 'wall-white';
}

export function findFinish(id: string | undefined, list: Finish[]): Finish | undefined {
  return list.find((f) => f.id === id);
}

/**
 * The lease (brochure) asks for carpet everywhere except the kitchen and
 * bathroom, where cork or rubber is allowed. Returns a plain-language hint,
 * or null when the choice is fine.
 */
export function leaseHint(roomName: string, floor: Finish): string | null {
  if (floor.kind === 'carpet') return null;
  if (WET.test(roomName)) {
    return floor.kind === 'cork'
      ? null
      : 'The lease allows cork or rubber in the kitchen and bathroom. Check with the landlord before laying anything else.';
  }
  return 'The lease asks for carpet in this room (to stop noise reaching the flat below). Check with the landlord before laying a hard floor.';
}

/** Deterministic noise so textures look the same every time. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Paint one tile of a finish onto a square canvas. */
export function drawFinish(ctx: CanvasRenderingContext2D, f: Finish, size: number): void {
  const r = rng(f.id);
  ctx.fillStyle = f.color;
  ctx.fillRect(0, 0, size, size);
  switch (f.kind) {
    case 'timber': {
      const boards = 6;
      const bh = size / boards;
      for (let i = 0; i < boards; i++) {
        const offset = r() * size;
        for (const x0 of [offset - size, offset]) {
          ctx.fillStyle = shade(f.color, 0.9 + r() * 0.2);
          ctx.fillRect(x0, i * bh, size, bh);
          for (let g = 0; g < 7; g++) {
            ctx.strokeStyle = shade(f.color, 0.82 + r() * 0.1);
            ctx.lineWidth = 1;
            ctx.beginPath();
            const y = i * bh + r() * bh;
            ctx.moveTo(x0, y);
            ctx.bezierCurveTo(x0 + size * 0.3, y + (r() - 0.5) * 6, x0 + size * 0.6, y + (r() - 0.5) * 6, x0 + size, y);
            ctx.stroke();
          }
          ctx.fillStyle = shade(f.color, 0.6);
          ctx.fillRect(x0 + size - 1, i * bh, 2, bh);
        }
        ctx.fillStyle = shade(f.color, 0.65);
        ctx.fillRect(0, i * bh, size, 1.5);
      }
      break;
    }
    case 'carpet':
    case 'cork':
    case 'concrete': {
      const n = f.kind === 'cork' ? 2500 : 9000;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = shade(f.color, (f.kind === 'cork' ? 0.7 : 0.88) + r() * (f.kind === 'cork' ? 0.6 : 0.24));
        const s = f.kind === 'cork' ? 2 + r() * 5 : 1 + r() * 2;
        ctx.fillRect(r() * size, r() * size, s, s);
      }
      break;
    }
    case 'tile': {
      const n = 4;
      const t = size / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          ctx.fillStyle = shade(f.color, 0.96 + r() * 0.06);
          ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
          if (f.id === 'wall-tile-white') {
            // A hint of the marble in the photos.
            ctx.strokeStyle = 'rgba(120,120,125,0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(i * t + r() * t, j * t);
            ctx.quadraticCurveTo(i * t + r() * t, j * t + t / 2, i * t + r() * t, j * t + t);
            ctx.stroke();
          }
        }
      ctx.fillStyle = shade(f.color, 0.78);
      for (let i = 0; i <= n; i++) {
        ctx.fillRect(i * t - 2, 0, 4, size);
        ctx.fillRect(0, i * t - 2, size, 4);
      }
      break;
    }
    case 'panel': {
      const n = 8;
      const w = size / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = shade(f.color, 0.92 + r() * 0.14);
        ctx.fillRect(i * w, 0, w, size);
        ctx.fillStyle = shade(f.color, 0.65);
        ctx.fillRect(i * w, 0, 2, size);
      }
      break;
    }
    case 'paint':
      break;
  }
}
