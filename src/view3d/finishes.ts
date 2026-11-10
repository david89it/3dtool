// Floor and wall finishes: a small palette of swatches, each drawn as a
// procedural canvas texture (no image files to ship). Paint colours live in
// src/model/palette.ts; findSurface() resolves any finish value.

import type { Room, Wall } from '../model/types';
import { findPaint, isHex, paintHex, paintName, WHITE_PAINT_ID } from '../model/palette';

export type FinishKind =
  | 'timber'
  | 'carpet'
  | 'tile'
  | 'cork'
  | 'concrete'
  | 'paint'
  | 'panel'
  | 'herringbone'
  | 'chevron'
  | 'encaustic'
  | 'sisal'
  | 'rubber';

export interface Finish {
  id: string;
  name: string;
  kind: FinishKind;
  color: string; // swatch chip and base colour
  /** Metres of floor or wall that one copy of the texture covers. */
  tileM: number;
  roughness: number;
  /** Turn the texture (radians) when it is laid, e.g. herringbone at 45 degrees. */
  rotation?: number;
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
  { id: 'floor-herringbone', name: 'Herringbone oak', kind: 'herringbone', color: '#b98f5e', tileM: 1, roughness: 0.55, rotation: Math.PI / 4 },
  { id: 'floor-chevron', name: 'Chevron oak', kind: 'chevron', color: '#c29a68', tileM: 1, roughness: 0.55 },
  { id: 'floor-encaustic', name: 'Pattern tile', kind: 'encaustic', color: '#e9dfc9', tileM: 0.8, roughness: 0.35 },
  { id: 'floor-sisal', name: 'Sisal', kind: 'sisal', color: '#c4ad7e', tileM: 0.5, roughness: 1 },
  { id: 'floor-rubber', name: 'Studded rubber', kind: 'rubber', color: '#44454a', tileM: 0.6, roughness: 0.7 },
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

/** Any finish value: a floor or wall finish id, a paint id, or a hex colour. */
export function findSurface(id: string | undefined): Finish | undefined {
  if (!id) return undefined;
  const hit = findFinish(id, FLOOR_FINISHES) ?? findFinish(id, WALL_FINISHES);
  if (hit) return hit;
  const hex = paintHex(id);
  if (!hex) return undefined;
  return { id: isHex(id) ? hex : (findPaint(id)?.id ?? id), name: paintName(id), kind: 'paint', color: hex, tileM: 1, roughness: 0.95 };
}

/** The plain colour of a finish value (for swatches, the plan and the ceiling), or undefined. */
export function surfaceColor(id: string | undefined): string | undefined {
  return findSurface(id)?.color;
}

/** What a face of a wall wears: its own paint, else the room's wall finish, else the default. */
export function wallFaceFinishId(room: Pick<Room, 'name' | 'wallFinish'> | undefined, wall: Pick<Wall, 'faces'>, side: 'L' | 'R'): string {
  return wall.faces?.[side] ?? (room ? (room.wallFinish ?? defaultWallId(room.name)) : 'wall-white');
}

/** Ceiling paint of a room; white by default. */
export function ceilingFinishId(room: Pick<Room, 'ceilingFinish'> | undefined): string {
  return room?.ceilingFinish ?? WHITE_PAINT_ID;
}

/** Woodwork colour of a room as hex, or undefined for the standard white. */
export function woodworkHex(room: Pick<Room, 'woodworkColor'> | undefined): string | undefined {
  return paintHex(room?.woodworkColor);
}

/**
 * The lease (brochure) asks for carpet everywhere except the kitchen and
 * bathroom, where cork or rubber is allowed. Returns a plain-language hint,
 * or null when the choice is fine.
 */
export function leaseHint(roomName: string, floor: Finish): string | null {
  if (floor.kind === 'carpet') return null;
  if (WET.test(roomName)) {
    return floor.kind === 'cork' || floor.kind === 'rubber'
      ? null
      : 'The lease allows cork or rubber in the kitchen and bathroom. Check with the landlord before laying anything else.';
  }
  if (floor.kind === 'sisal') {
    return 'Sisal is a woven floor covering, closer to carpet than boards, but the lease says carpet. Check with the landlord that it counts before laying it.';
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
    case 'herringbone': {
      // Planks 4 wide by 1 across, laid square. The texture is turned 45 degrees
      // when it is laid (Finish.rotation). The pattern repeats every 4 plank
      // widths, so the canvas shows it twice and tiles without a seam.
      const u = size / 8;
      const plank = (x: number, y: number, w: number, h: number) => {
        // Seeded by where the plank sits in the repeat, so the wrap-around matches.
        const pr = rng(`${f.id}|${((x % 8) + 8) % 8}|${((y % 8) + 8) % 8}|${w}`);
        const sh = 0.86 + pr() * 0.26;
        ctx.fillStyle = shade(f.color, sh);
        ctx.fillRect(x * u, y * u, w * u, h * u);
        ctx.strokeStyle = shade(f.color, 0.8 * sh);
        ctx.lineWidth = 1;
        for (let g = 0; g < 3; g++) {
          ctx.beginPath();
          if (w > h) {
            const gy = (y + (g + 0.5) / 3 * h) * u;
            ctx.moveTo(x * u, gy);
            ctx.lineTo((x + w) * u, gy + (pr() - 0.5) * 3);
          } else {
            const gx = (x + (g + 0.5) / 3 * w) * u;
            ctx.moveTo(gx, y * u);
            ctx.lineTo(gx + (pr() - 0.5) * 3, (y + h) * u);
          }
          ctx.stroke();
        }
        ctx.strokeStyle = shade(f.color, 0.55);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x * u + 0.75, y * u + 0.75, w * u - 1.5, h * u - 1.5);
      };
      for (let m = -3; m <= 3; m++)
        for (let k = -10; k <= 14; k++) {
          plank(m * 4 + k, k, 4, 1);
          plank(m * 4 + k + 4, k - 3, 1, 4);
        }
      break;
    }
    case 'chevron': {
      // Diagonal planks meeting in a V down the middle of the tile.
      const bands = 8;
      const bh = size / bands;
      const mid = size / 2;
      for (let b = -4; b < bands + 8; b++) {
        const rr = rng(`${f.id}${((b % bands) + bands) % bands}`);
        for (const side of [-1, 1]) {
          ctx.fillStyle = shade(f.color, 0.88 + rr() * 0.24);
          // Band between g = b*bh and (b+1)*bh, where g = y + |x - mid|.
          const x0 = side < 0 ? 0 : mid;
          const x1 = side < 0 ? mid : size;
          const y = (x: number, g: number) => g - Math.abs(x - mid);
          ctx.beginPath();
          ctx.moveTo(x0, y(x0, b * bh));
          ctx.lineTo(x1, y(x1, b * bh));
          ctx.lineTo(x1, y(x1, (b + 1) * bh));
          ctx.lineTo(x0, y(x0, (b + 1) * bh));
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = shade(f.color, 0.58);
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.strokeStyle = shade(f.color, 0.8);
          ctx.lineWidth = 1;
          for (let g = 1; g <= 3; g++) {
            const gg = b * bh + (g / 4) * bh;
            ctx.beginPath();
            ctx.moveTo(x0, y(x0, gg));
            ctx.lineTo(x1, y(x1, gg));
            ctx.stroke();
          }
        }
      }
      break;
    }
    case 'encaustic': {
      // Cream tiles with a navy diamond, a terracotta centre and teal corners.
      const n = 4;
      const t = size / n;
      ctx.fillStyle = '#ece3cf';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const cx = i * t + t / 2;
          const cy = j * t + t / 2;
          ctx.fillStyle = shade('#ece3cf', 0.97 + r() * 0.05);
          ctx.fillRect(i * t + 1, j * t + 1, t - 2, t - 2);
          ctx.fillStyle = '#2d3f5c';
          ctx.beginPath();
          ctx.moveTo(cx, cy - t * 0.42);
          ctx.lineTo(cx + t * 0.42, cy);
          ctx.lineTo(cx, cy + t * 0.42);
          ctx.lineTo(cx - t * 0.42, cy);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#ece3cf';
          ctx.beginPath();
          ctx.arc(cx, cy, t * 0.24, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#b5593f';
          ctx.beginPath();
          ctx.arc(cx, cy, t * 0.15, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#2f6f6a';
          for (const [px, py] of [[i * t, j * t], [i * t + t, j * t], [i * t, j * t + t], [i * t + t, j * t + t]]) {
            ctx.beginPath();
            ctx.arc(px, py, t * 0.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      ctx.fillStyle = 'rgba(90,80,65,0.55)';
      for (let i = 0; i <= n; i++) {
        ctx.fillRect(i * t - 1, 0, 2, size);
        ctx.fillRect(0, i * t - 1, size, 2);
      }
      break;
    }
    case 'sisal': {
      // Basket weave: strands go over and under in squares.
      const cell = size / 16;
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 16; j++) {
          const horizontal = (i + j) % 2 === 0;
          const sh = 0.84 + r() * 0.3;
          ctx.fillStyle = shade(f.color, sh);
          ctx.fillRect(i * cell + 1, j * cell + 1, cell - 2, cell - 2);
          ctx.strokeStyle = shade(f.color, 0.66 * sh);
          ctx.lineWidth = 1;
          for (let g = 1; g < 4; g++) {
            ctx.beginPath();
            if (horizontal) {
              ctx.moveTo(i * cell + 1, j * cell + (g * cell) / 4);
              ctx.lineTo(i * cell + cell - 1, j * cell + (g * cell) / 4);
            } else {
              ctx.moveTo(i * cell + (g * cell) / 4, j * cell + 1);
              ctx.lineTo(i * cell + (g * cell) / 4, j * cell + cell - 1);
            }
            ctx.stroke();
          }
        }
      break;
    }
    case 'rubber': {
      // Round studs in a grid on a dark base.
      const n = 8;
      const t = size / n;
      ctx.fillStyle = shade(f.color, 0.8);
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const cx = i * t + t / 2;
          const cy = j * t + t / 2;
          const grad = ctx.createRadialGradient(cx - t * 0.12, cy - t * 0.12, t * 0.04, cx, cy, t * 0.38);
          grad.addColorStop(0, shade(f.color, 1.55));
          grad.addColorStop(0.6, shade(f.color, 1.05));
          grad.addColorStop(1, shade(f.color, 0.7));
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, t * 0.38, 0, Math.PI * 2);
          ctx.fill();
        }
      break;
    }
    case 'paint':
      break;
  }
}
