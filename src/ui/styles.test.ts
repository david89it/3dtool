import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// A missing "}" silently drops every rule after it. This has happened twice,
// so check every stylesheet's braces balance and never go negative.
function check(css: string): { depth: number; minDepth: number } {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '');
  let depth = 0;
  let minDepth = 0;
  for (const ch of text) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    minDepth = Math.min(minDepth, depth);
  }
  return { depth, minDepth };
}

describe('stylesheets', () => {
  const files = ['src/ui/styles.css', 'src/view3d/view3d.css', ...readdirSync('src/print').filter((f) => f.endsWith('.css')).map((f) => `src/print/${f}`)];
  for (const f of files) {
    it(`${f} has balanced braces`, () => {
      expect(check(readFileSync(f, 'utf8'))).toEqual({ depth: 0, minDepth: 0 });
    });
  }
});
