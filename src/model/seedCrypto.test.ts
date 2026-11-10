import { describe, expect, it } from 'vitest';
import { encryptSeed } from '../../scripts/seedCrypto.mjs';
import { asSeedFile, decryptSeed, WrongPasswordError } from './seedCrypto';
import { applySeedUnderlays, buildSeedProject } from './seed';
import { validateProject } from './persistence';

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

describe('encrypted seed round trip', () => {
  it('encrypts in Node and decrypts with the browser-side function', async () => {
    const project = buildSeedProject();
    applySeedUnderlays(project, () => 'data:image/png;base64,AAAA');
    const file = await encryptSeed(JSON.stringify(project), 'correct horse battery staple');
    expect(file.kdf).toEqual({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000 });
    expect(file.cipher).toBe('AES-256-GCM');
    expect(b64(file.salt)).toHaveLength(16);
    expect(b64(file.iv)).toHaveLength(12);
    // The file itself reveals nothing readable.
    expect(JSON.stringify(file)).not.toMatch(/Balmore|Kitchen/);

    const parsed = asSeedFile(JSON.parse(JSON.stringify(file)));
    expect(parsed).toBeDefined();
    const back = validateProject(await decryptSeed(parsed!, 'correct horse battery staple'));
    expect(back).toEqual(JSON.parse(JSON.stringify(project)));
    expect(back.levels.find((l) => l.name === 'First floor')?.underlay?.imageDataUrl).toContain('data:image/png');
  }, 30_000);

  it('fails cleanly with the wrong password', async () => {
    const file = await encryptSeed('{"version":1}', 'right');
    await expect(decryptSeed(file, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(decryptSeed(file, 'wrong')).rejects.toThrow("That password didn't work.");
    await expect(decryptSeed(file, '')).rejects.toBeInstanceOf(WrongPasswordError);
  }, 30_000);

  it('detects a tampered file and refuses weak settings', async () => {
    const file = await encryptSeed('{"version":1}', 'right');
    const bytes = b64(file.ciphertext);
    bytes[0] ^= 1;
    const tampered = btoa(String.fromCharCode(...bytes));
    await expect(decryptSeed({ ...file, ciphertext: tampered }, 'right')).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(encryptSeed('{}', 'x', 1000)).rejects.toThrow();
    await expect(encryptSeed('{}', '')).rejects.toThrow();
  }, 30_000);

  it('recognises only real seed files', () => {
    expect(asSeedFile('<!doctype html>')).toBeUndefined();
    expect(asSeedFile({ version: 1 })).toBeUndefined();
    expect(asSeedFile(null)).toBeUndefined();
  });
});
