// Browser side of the encrypted flat: read seed.enc and decrypt it with the
// password the visitor types. The password is never stored. The file is made
// by scripts/seedCrypto.mjs (AES-256-GCM, key from PBKDF2-SHA256).

export interface SeedFile {
  version: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number };
  cipher: 'AES-256-GCM';
  salt: string; // base64, 16 bytes
  iv: string; // base64, 12 bytes
  ciphertext: string; // base64, includes the GCM tag
}

export class WrongPasswordError extends Error {
  constructor() {
    super("That password didn't work.");
    this.name = 'WrongPasswordError';
  }
}

export const NO_FLAT_MESSAGE = 'No saved flat on this site.';

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Check that a parsed JSON value looks like a seed file. Returns undefined if not. */
export function asSeedFile(x: unknown): SeedFile | undefined {
  const f = x as Partial<SeedFile> | null;
  if (!f || typeof f !== 'object') return undefined;
  const ok =
    f.version === 1 &&
    f.cipher === 'AES-256-GCM' &&
    !!f.kdf &&
    f.kdf.name === 'PBKDF2' &&
    f.kdf.hash === 'SHA-256' &&
    Number.isInteger(f.kdf.iterations) &&
    f.kdf.iterations >= 1 &&
    f.kdf.iterations <= 10_000_000 &&
    typeof f.salt === 'string' &&
    typeof f.iv === 'string' &&
    typeof f.ciphertext === 'string';
  return ok ? (f as SeedFile) : undefined;
}

/** Decrypt a seed file to its JSON value. Throws WrongPasswordError if the password is wrong. */
export async function decryptSeed(file: SeedFile, password: string): Promise<unknown> {
  const subtle = globalThis.crypto.subtle;
  let plain: ArrayBuffer;
  try {
    const material = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(file.salt), iterations: file.kdf.iterations },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.iv) }, key, fromB64(file.ciphertext));
  } catch {
    // AES-GCM fails its integrity check when the key is wrong.
    throw new WrongPasswordError();
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

let cached: Promise<SeedFile | null> | undefined;

/**
 * Fetch ./seed.enc (a relative address, so it works under /3dtool/). Resolves
 * to null when the site has none: a 404, or a dev server answering with the
 * app's own page. The result is remembered for the session.
 */
export function fetchSeedFile(): Promise<SeedFile | null> {
  cached ??= (async () => {
    try {
      const res = await fetch('./seed.enc', { cache: 'no-cache' });
      if (!res.ok) return null;
      return asSeedFile(JSON.parse(await res.text())) ?? null;
    } catch {
      cached = undefined; // offline just now: try again next time
      return null;
    }
  })();
  return cached;
}

/** Fetch, decrypt and validate the owners' flat. Throws an Error with a plain-language message. */
export async function openSeedFlat(password: string): Promise<unknown> {
  const file = await fetchSeedFile();
  if (!file) throw new Error(NO_FLAT_MESSAGE);
  return decryptSeed(file, password);
}
