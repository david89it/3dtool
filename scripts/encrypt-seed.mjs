#!/usr/bin/env node
// Build the owners' full seed project (walls, openings, markers, and the
// agent's floorplan crops as PNG data URLs), encrypt it with the password in
// the SEED_PASSWORD environment variable, and write <dist>/seed.enc.
//
//   SEED_PASSWORD='a long passphrase' node scripts/encrypt-seed.mjs [distDir]
//
// No new dependencies and no browser: the project is built by the app's own
// buildSeedProject() / applySeedUnderlays() (loaded through Vite), and the
// crops are cut from assets/floorplan-bleuplan.png with node:zlib.
//
// If SEED_PASSWORD is missing this logs a warning and exits 0, so a build
// without the secret still publishes (an empty site with no "Open our flat").

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { encryptSeed } from './seedCrypto.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---- minimal PNG reader / writer (8-bit, non-interlaced, RGB or RGBA) ----

function readPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG file.');
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const colour = data[9];
      if (depth !== 8 || (colour !== 2 && colour !== 6) || data[12] !== 0) {
        throw new Error('The floorplan must be an 8-bit, non-interlaced RGB or RGBA PNG.');
      }
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= channels ? px[dst + i - channels] : 0;
      const b = y > 0 ? px[dst - stride + i] : 0;
      const c = i >= channels && y > 0 ? px[dst - stride + i - channels] : 0;
      let v;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`Unknown PNG filter ${filter}.`);
      }
      px[dst + i] = v & 255;
    }
  }
  return { width, height, channels, px };
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, tail]);
}

/** Cut a rectangle out of the image, composite it on white, return a PNG data URL. */
function cropToDataUrl(img, { x, y, w, h }) {
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let j = 0; j < h; j++) {
    const o = j * (w * 3 + 1);
    rows[o] = 0;
    for (let i = 0; i < w; i++) {
      const sx = x + i;
      const sy = y + j;
      const inside = sx >= 0 && sy >= 0 && sx < img.width && sy < img.height;
      for (let c = 0; c < 3; c++) {
        let v = 255;
        if (inside) {
          const s = (sy * img.width + sx) * img.channels;
          const a = img.channels === 4 ? img.px[s + 3] : 255;
          v = Math.round((img.px[s + c] * a + 255 * (255 - a)) / 255);
        }
        rows[o + 1 + i * 3 + c] = v;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

// ---- main ----

async function buildSeedJson() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const seed = await server.ssrLoadModule('/src/model/seed.ts');
    const project = seed.buildSeedProject();
    const img = readPng(readFileSync(resolve(root, 'assets/floorplan-bleuplan.png')));
    seed.applySeedUnderlays(project, (spec) => cropToDataUrl(img, spec.crop));
    return JSON.stringify(project);
  } finally {
    await server.close();
  }
}

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password) {
    console.warn('encrypt-seed: SEED_PASSWORD is not set, so no seed.enc was written. The site will start empty with no "Open our flat" option.');
    return;
  }
  const outDir = resolve(process.argv[2] ?? resolve(root, 'dist'));
  const json = await buildSeedJson();
  const file = await encryptSeed(json, password);
  mkdirSync(outDir, { recursive: true });
  const out = resolve(outDir, 'seed.enc');
  writeFileSync(out, JSON.stringify(file));
  console.log(`encrypt-seed: wrote ${out} (${Math.round(JSON.stringify(file).length / 1024)} KB, PBKDF2 ${file.kdf.iterations} iterations).`);
}

main().catch((err) => {
  console.error('encrypt-seed failed:', err);
  process.exit(1);
});
