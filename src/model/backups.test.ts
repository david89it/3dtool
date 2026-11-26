import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (k: string) => db.get(k)),
  set: vi.fn(async (k: string, v: unknown) => void db.set(k, v)),
  del: vi.fn(async (k: string) => void db.delete(k)),
  keys: vi.fn(async () => [...db.keys()]),
}));

import { backupFileName, backupJson, backupTime, deleteBackup, formatBytes, jsonBytes, listBackups } from './backups';

beforeEach(() => db.clear());

describe('recovered backups', () => {
  it('lists only unreadable-record backups, newest first, with date and size', async () => {
    db.set('flatplan:project:v1', { a: 1 });
    db.set('flatplan:versions:index', []);
    db.set('flatplan:unreadable:1000', { version: 1, levels: 'x' });
    db.set('flatplan:unreadable:3000', 'plain text');
    db.set('flatplan:unreadable:oops', {});
    const list = await listBackups();
    expect(list.map((b) => b.key)).toEqual(['flatplan:unreadable:3000', 'flatplan:unreadable:1000', 'flatplan:unreadable:oops']);
    expect(list[0]).toMatchObject({ savedAt: 3000, bytes: '"plain text"'.length });
    expect(list[2].savedAt).toBeUndefined();
  });

  it('is empty when there are none (so the section stays hidden)', async () => {
    db.set('flatplan:project:v1', {});
    expect(await listBackups()).toEqual([]);
  });

  it('gives the data back as JSON text, and refuses keys that are not backups', async () => {
    db.set('flatplan:unreadable:5', { x: 1 });
    db.set('flatplan:project:v1', { secret: true });
    expect(JSON.parse((await backupJson('flatplan:unreadable:5'))!)).toEqual({ x: 1 });
    expect(await backupJson('flatplan:project:v1')).toBeUndefined();
    expect(await deleteBackup('flatplan:project:v1')).toBe(false);
    expect(db.has('flatplan:project:v1')).toBe(true);
  });

  it('deletes one backup and leaves the rest', async () => {
    db.set('flatplan:unreadable:1', {});
    db.set('flatplan:unreadable:2', {});
    expect(await deleteBackup('flatplan:unreadable:1')).toBe(true);
    expect((await listBackups()).map((b) => b.key)).toEqual(['flatplan:unreadable:2']);
  });

  it('helpers: key time, sizes and file names', () => {
    expect(backupTime('flatplan:unreadable:1700000000000')).toBe(1700000000000);
    expect(backupTime('flatplan:project:v1')).toBeUndefined();
    expect(jsonBytes({ a: 'é' })).toBe(new TextEncoder().encode('{"a":"é"}').length);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(jsonBytes(cyclic)).toBe(0);
    expect(formatBytes(500)).toBe('500 bytes');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(backupFileName({ savedAt: Date.UTC(2026, 10, 3, 14, 5) })).toBe('recovered-plan-2026-11-03-14-05.json');
    expect(backupFileName({ savedAt: undefined })).toBe('recovered-plan-backup.json');
  });
});
