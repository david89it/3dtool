// Procedural textures for the wooden floor patterns. Each pattern is drawn on one square
// canvas that repeats without a seam; every board gets its own tone and grain, so the floor
// looks like real timber and not a stamp. `PATTERN_TILE_M` says how many metres of floor one
// copy covers and `PATTERN_ROTATION` how far the picture is turned when it is laid.

import type { FloorPattern } from '../model/types';
import { rng, shade } from './drawUtil';

/** Metres of floor that one copy of the picture covers. */
export const PATTERN_TILE_M: Record<FloorPattern, number> = { straight: 1.2, wide: 1.8, herringbone: 1, chevron: 1, parquet: 0.6 };

/** Radians the picture is turned when laid: herringbone is drawn square and laid at 45 degrees. */
export const PATTERN_ROTATION: Record<FloorPattern, number> = { straight: 0, wide: 0, herringbone: Math.PI / 4, chevron: 0, parquet: 0 };

type Ctx = CanvasRenderingContext2D;

/** One board or block: its own tone, a few grain lines along its length, a dark joint around it. */
function board(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, r: () => number): void {
  const tone = 0.86 + r() * 0.26;
  ctx.fillStyle = shade(color, tone);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = shade(color, 0.8 * tone);
  ctx.lineWidth = 1;
  for (let g = 0; g < 4; g++) {
    ctx.beginPath();
    if (w >= h) {
      const gy = y + ((g + 0.5) / 4) * h;
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy + (r() - 0.5) * 3);
    } else {
      const gx = x + ((g + 0.5) / 4) * w;
      ctx.moveTo(gx, y);
      ctx.lineTo(gx + (r() - 0.5) * 3, y + h);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = shade(color, 0.55);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
}

/** Long boards in rows, each row's joint at a different place along the tile. */
function drawBoards(ctx: Ctx, size: number, color: string, rows: number, seed: string): void {
  const r = rng(seed);
  const bh = size / rows;
  for (let i = 0; i < rows; i++) {
    const offset = 0.15 * size + r() * 0.7 * size;
    // Two boards per row: one ends at `offset`, the next starts there and wraps round the tile.
    board(ctx, offset - size, i * bh, size, bh, color, r);
    board(ctx, offset, i * bh, size, bh, color, r);
  }
}

/** Blocks 4 units long and 1 wide, laid square; the tile is turned 45 degrees when laid. */
function drawHerringbone(ctx: Ctx, size: number, color: string, seed: string): void {
  const u = size / 8;
  const wrap = (v: number) => ((v % 8) + 8) % 8;
  const plank = (x: number, y: number, w: number, h: number) => {
    // Seeded by where the plank sits in the repeat, so the wrap-around matches.
    board(ctx, x * u, y * u, w * u, h * u, color, rng(`${seed}|${wrap(x)}|${wrap(y)}|${w}`));
  };
  for (let m = -3; m <= 3; m++)
    for (let k = -10; k <= 14; k++) {
      plank(m * 4 + k, k, 4, 1);
      plank(m * 4 + k + 4, k - 3, 1, 4);
    }
}

/** Diagonal boards meeting in a V down the middle of the tile. */
function drawChevron(ctx: Ctx, size: number, color: string, seed: string): void {
  const bands = 8;
  const bh = size / bands;
  const mid = size / 2;
  for (let b = -4; b < bands + 8; b++) {
    const rr = rng(`${seed}${((b % bands) + bands) % bands}`);
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : mid;
      const x1 = side < 0 ? mid : size;
      const y = (x: number, g: number) => g - Math.abs(x - mid);
      const tone = 0.88 + rr() * 0.24;
      ctx.fillStyle = shade(color, tone);
      ctx.beginPath();
      ctx.moveTo(x0, y(x0, b * bh));
      ctx.lineTo(x1, y(x1, b * bh));
      ctx.lineTo(x1, y(x1, (b + 1) * bh));
      ctx.lineTo(x0, y(x0, (b + 1) * bh));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = shade(color, 0.58);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = shade(color, 0.8 * tone);
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
}

/** Basket weave: square blocks of three strips, each block turned a quarter from its neighbours. */
function drawParquet(ctx: Ctx, size: number, color: string, seed: string): void {
  const r = rng(seed);
  const blocks = 2;
  const b = size / blocks;
  const strips = 3;
  for (let i = 0; i < blocks; i++)
    for (let j = 0; j < blocks; j++) {
      const along = (i + j) % 2 === 0;
      for (let s = 0; s < strips; s++) {
        if (along) board(ctx, i * b, j * b + (s * b) / strips, b, b / strips, color, r);
        else board(ctx, i * b + (s * b) / strips, j * b, b / strips, b, color, r);
      }
    }
}

/** Draw one repeat of a wood floor pattern in `color` onto a square canvas of `size` pixels. */
export function drawWoodPattern(ctx: Ctx, pattern: FloorPattern, color: string, size: number, seed: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  if (pattern === 'herringbone') drawHerringbone(ctx, size, color, seed);
  else if (pattern === 'chevron') drawChevron(ctx, size, color, seed);
  else if (pattern === 'parquet') drawParquet(ctx, size, color, seed);
  else drawBoards(ctx, size, color, 6, seed + pattern);
}
