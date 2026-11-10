// Encrypt a JSON string into the seed.enc format. No dependencies: Node's
// built-in WebCrypto. The matching decryption is src/model/seedCrypto.ts,
// which runs in the browser.
//
// Format (JSON): { version: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256',
// iterations }, cipher: 'AES-256-GCM', salt, iv, ciphertext } with the last
// three in base64. Key = PBKDF2-SHA256(password, salt, iterations) -> 256 bits.

import { webcrypto } from 'node:crypto';

export const PBKDF2_ITERATIONS = 600_000;

const toB64 = (bytes) => Buffer.from(bytes).toString('base64');

/**
 * @param {string} plaintext
 * @param {string} password
 * @param {number} [iterations]
 */
export async function encryptSeed(plaintext, password, iterations = PBKDF2_ITERATIONS) {
  if (!password) throw new Error('A password is required.');
  if (iterations < 600_000) throw new Error('Refusing fewer than 600,000 PBKDF2 iterations.');
  const subtle = webcrypto.subtle;
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const material = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return {
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations },
    cipher: 'AES-256-GCM',
    salt: toB64(salt),
    iv: toB64(iv),
    ciphertext: toB64(new Uint8Array(ct)),
  };
}
