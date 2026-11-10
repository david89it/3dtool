export const PBKDF2_ITERATIONS: number;
export function encryptSeed(
  plaintext: string,
  password: string,
  iterations?: number,
): Promise<{
  version: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number };
  cipher: 'AES-256-GCM';
  salt: string;
  iv: string;
  ciphertext: string;
}>;
