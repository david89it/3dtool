import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';

// The address "Report a problem" sends to is a secret: it reaches the app only inside the
// encrypted seed (REPORT_EMAIL). This test reads the public source and fails if anything that
// looks like an email address is in it, so one cannot be committed by accident.

const ROOTS = ['src', 'scripts', '.github', 'e2e'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const EXTENSIONS = /\.(ts|tsx|mjs|js|cjs|json|yml|yaml|css|html|md)$/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/** Addresses that are obviously placeholders. */
function isPlaceholder(email: string): boolean {
  const domain = email.split('@')[1].toLowerCase();
  return /(^|\.)example\.(com|org|net)$/.test(domain) || domain === 'anthropic.com' || domain.endsWith('.invalid') || domain.endsWith('.test') || domain === 'localhost';
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXTENSIONS.test(name)) out.push(path);
  }
  return out;
}

export function findEmails(text: string): string[] {
  return (text.match(EMAIL) ?? []).filter((e) => !isPlaceholder(e));
}

describe('no real email address in the public source', () => {
  it('recognises addresses and ignores placeholders', () => {
    expect(findEmails(`write to ${['someone', 'mail.co.uk'].join('@')} now`)).toHaveLength(1);
    expect(findEmails('a@example.com b@noreply.example.org noreply@anthropic.com x@y.invalid')).toEqual([]);
    expect(findEmails('import x from "@react-three/fiber"; @vitejs/plugin-react; a@b')).toEqual([]);
  });

  it('finds none in src, scripts, .github and e2e', () => {
    const files = ROOTS.flatMap((r) => walk(r));
    expect(files.length).toBeGreaterThan(50);
    const found: string[] = [];
    for (const f of files) {
      for (const e of findEmails(readFileSync(f, 'utf8'))) found.push(`${f}: ${e.replace(/^[^@]*/, '…')}`);
    }
    // The message names the file only, never the address itself.
    expect(found).toEqual([]);
  });
});
