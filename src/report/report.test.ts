import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../model/store';
import { createEmptyProject } from '../model/firstRun';
import { newPlacedItem, findCatalogueItem } from '../catalogue/catalogue';
import { resolveReportAddress, isValidEmail } from './address';
import { RingBuffer, installConsoleCapture, scrub, type CapturedEvent } from './consoleBuffer';
import {
  KEEP_ORDER,
  MAX_URL,
  buildMailto,
  buildReportText,
  collectDetails,
  describeSelection,
  detailSections,
  formatDetails,
  subjectFor,
  type DetailsEnv,
} from './report';

const ADDRESS = 'someone@example.com';

const env = (over: Partial<DetailsEnv> = {}): Partial<DetailsEnv> => ({
  now: new Date(2026, 10, 20, 14, 32),
  userAgent: 'TestBrowser/1.0 (iPad)',
  screen: { w: 2360, h: 1640 },
  viewport: { w: 1180, h: 820 },
  touch: true,
  saving: 'on',
  errors: [],
  version: 'abc1234',
  builtOn: '2026-11-20',
  timeZone: 'Europe/London',
  ...over,
});

function manyErrors(n: number): CapturedEvent[] {
  return Array.from({ length: n }, (_, i) => ({ t: Date.UTC(2026, 10, 20, 12, 0, i), kind: 'error' as const, text: `Something failed number ${i} in the drawing code` }));
}

describe('address priority', () => {
  it('uses the address typed in Settings before the one that came with the plan', () => {
    expect(resolveReportAddress('mine@example.com', 'plan@example.com')).toBe('mine@example.com');
  });
  it('falls back to the plan address, then to none', () => {
    expect(resolveReportAddress('', 'plan@example.com')).toBe('plan@example.com');
    expect(resolveReportAddress(undefined, undefined)).toBeNull();
    expect(resolveReportAddress('', '')).toBeNull();
  });
  it('ignores an address that is not valid', () => {
    expect(resolveReportAddress('not an address', 'plan@example.com')).toBe('plan@example.com');
    expect(resolveReportAddress('a@b', 'x?subject=hi@example.com')).toBeNull();
  });
  it('checks the shape of an address', () => {
    expect(isValidEmail('a.b+c@mail.example.com')).toBe(true);
    for (const bad of ['', 'a@b', '@example.com', 'a b@example.com', 'a@example.com,b@example.com', 'a@example.com?cc=x', 'a@@example.com']) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});

describe('ring buffer', () => {
  it('keeps the newest items', () => {
    const b = new RingBuffer<number>(3);
    for (let i = 1; i <= 5; i++) b.push(i);
    expect(b.toArray()).toEqual([3, 4, 5]);
    b.clear();
    expect(b.length).toBe(0);
  });

  it('remembers console errors and warnings, window errors and rejections, and passes the call through', () => {
    const seen: unknown[][] = [];
    const con = { error: (...a: unknown[]) => seen.push(['error', ...a]), warn: (...a: unknown[]) => seen.push(['warn', ...a]) };
    const listeners = new Map<string, (e: unknown) => void>();
    const win = {
      addEventListener: (t: string, f: (e: unknown) => void) => void listeners.set(t, f),
      removeEventListener: (t: string) => void listeners.delete(t),
    };
    const buffer = new RingBuffer<CapturedEvent>(20);
    let clock = 0;
    const undo = installConsoleCapture({ console: con, win, buffer, now: () => ++clock });
    con.error('first', new Error('boom'));
    con.warn('careful', { a: 1 });
    listeners.get('error')!({ message: 'Script error', filename: 'http://x/app.js', lineno: 4, colno: 9 });
    listeners.get('unhandledrejection')!({ reason: new Error('nope') });
    expect(seen.map((s) => s[0])).toEqual(['error', 'warn']); // still reached the real console
    const got = buffer.toArray();
    expect(got.map((e) => e.kind)).toEqual(['error', 'warning', 'window error', 'unhandled rejection']);
    expect(got[0].text).toContain('first Error: boom');
    expect(got[1].text).toBe('careful {"a":1}');
    expect(got[2].text).toBe('Script error (app.js:4:9)');
    expect(got[3].text).toContain('Error: nope');
    // Installing again does nothing; undoing puts the console back.
    const again = installConsoleCapture({ console: con, win, buffer });
    con.error('once');
    expect(buffer.length).toBe(5);
    again();
    undo();
    con.error('after');
    expect(buffer.length).toBe(5);
    expect(listeners.size).toBe(0);
  });

  it('holds only the last 20 and scrubs keys, pictures and addresses', () => {
    const con = { error: (..._a: unknown[]) => {}, warn: (..._a: unknown[]) => {} };
    const buffer = new RingBuffer<CapturedEvent>(20);
    const undo = installConsoleCapture({ console: con, win: null, buffer });
    for (let i = 0; i < 30; i++) con.error(`problem ${i}`);
    expect(buffer.length).toBe(20);
    expect(buffer.toArray()[0].text).toBe('problem 10');
    undo();
    const s = scrub('key sk-ant-api03-ABCdef_123 and data:image/png;base64,AAAA+/== mail a.b@mail.example.org');
    expect(s).not.toContain('sk-ant');
    expect(s).not.toContain('AAAA');
    expect(s).not.toContain('mail.example.org');
    expect(scrub('x'.repeat(1000)).length).toBe(300);
  });
});

describe('details', () => {
  beforeEach(() => {
    useStore.getState().loadProject(createEmptyProject());
  });

  it('collects the version, date, floor, mode, device and saving status', () => {
    const d = collectDetails(env());
    expect(d.version).toBe('abc1234');
    expect(d.when).toBe('2026-11-20 14:32 (Europe/London)');
    expect(d.floor).toBe('Ground floor');
    expect(d.mode).toBe('Trace');
    expect(d.selected).toBe('nothing');
    expect(d.touch).toBe('yes');
    expect(d.screen).toBe('2360 x 1640');
    expect(d.window).toBe('1180 x 820');
    expect(d.saving).toBe('on');
    expect(collectDetails(env({ saving: 'paused', touch: false })).saving).toMatch(/^paused/);
  });

  it('lists the last 10 undo labels, newest first', () => {
    for (let i = 1; i <= 12; i++) useStore.getState().editLevel(`Change ${i}`, (L) => void (L.name = `Floor ${i}`));
    const d = collectDetails(env());
    expect(d.undo).toHaveLength(10);
    expect(d.undo[0]).toBe('Change 12');
    expect(d.undo[9]).toBe('Change 3');
  });

  it('lists up to 20 errors, newest first', () => {
    const d = collectDetails(env({ errors: manyErrors(25) }));
    expect(d.errors).toHaveLength(20);
    expect(d.errors[0]).toContain('number 24');
    expect(d.errors[19]).toContain('number 5');
  });

  it('says what is selected in words, with no positions', () => {
    const s = useStore.getState();
    const cat = findCatalogueItem(s.project, 'bed-murphy')!;
    s.editLevel('Add', (L) => void L.items.push({ ...newPlacedItem(cat, { x: 7777, y: 8888 }), id: 'it1' }));
    const p = useStore.getState().project;
    const lvl = useStore.getState().levelId;
    expect(describeSelection(p, lvl, { kind: 'item', id: 'it1' })).toBe('a piece of furniture: Murphy bed');
    expect(describeSelection(p, lvl, { kind: 'items', ids: ['a', 'b', 'c'] })).toBe('3 pieces of furniture');
    expect(describeSelection(p, lvl, { kind: 'wall', id: 'w' })).toBe('a wall');
    expect(describeSelection(p, lvl, null)).toBe('nothing');
    useStore.getState().select({ kind: 'item', id: 'it1' });
    useStore.getState().setMode('furnish');
    const text = formatDetails(collectDetails(env()));
    expect(text).toContain('Mode: Furnish');
    expect(text).not.toMatch(/7777|8888/);
  });

  it('never contains plan geometry or an API key', () => {
    useStore.getState().editLevel('Add a wall', (L) => {
      L.nodes.push({ id: 'na', pos: { x: 4321, y: 8765 } }, { id: 'nb', pos: { x: 9999, y: 1111 } });
      L.walls.push({ id: 'w1', a: 'na', b: 'nb', thickness: 100, kind: 'internal', structural: 'unknown', openings: [] });
    });
    const text = buildReportText('It broke', '', collectDetails(env()));
    for (const n of ['4321', '8765', '9999', '1111', 'sk-ant', 'imageDataUrl']) expect(text).not.toContain(n);
  });

  it('still works when the plan is broken (the error screen)', () => {
    const p = useStore.getState().project;
    useStore.setState({ project: { ...p, levels: p.levels.map((l) => ({ ...l, items: 'broken' as never })) } });
    useStore.setState({ selection: { kind: 'item', id: 'x' } });
    const d = collectDetails(env(), 'crash');
    expect(d.openedFrom).toBe('crash');
    expect(formatDetails(d)).toContain('Sent from: the error screen');
  });
});

describe('mailto', () => {
  const d = () => collectDetails(env({ errors: manyErrors(20) }));

  beforeEach(() => {
    useStore.getState().loadProject(createEmptyProject());
    for (let i = 1; i <= 10; i++) useStore.getState().editLevel(`Change number ${i} to the plan`, (L) => void (L.name = `Floor ${i}`));
  });

  it('puts a subject with the first 60 characters and her text in the body', () => {
    const m = buildMailto(ADDRESS, 'The kitchen wall would not move.', 'It should move.', d());
    expect(m.url.startsWith(`mailto:${ADDRESS}?subject=`)).toBe(true);
    const query = new URLSearchParams(m.url.slice(m.url.indexOf('?') + 1));
    expect(query.get('subject')).toBe('Flat Planner problem: The kitchen wall would not move.');
    const body = query.get('body')!;
    expect(body.startsWith('What happened:\r\nThe kitchen wall would not move.\r\n\r\nWhat I expected:\r\nIt should move.')).toBe(true);
    expect(body).toContain('App version: abc1234');
  });

  it('encodes awkward characters so the link cannot break', () => {
    const what = 'Wall & door? 50% “off” #1 + more\nnew line ünï 日本 😀';
    const m = buildMailto(ADDRESS, what, '', d());
    expect(m.url).not.toMatch(/[\s"<>#]/);
    expect(m.url.indexOf('&body=')).toBe(m.url.lastIndexOf('&body='));
    const body = new URLSearchParams(m.url.slice(m.url.indexOf('?') + 1)).get('body')!;
    expect(body).toContain('Wall & door? 50% “off” #1 + more\r\nnew line ünï 日本 😀');
  });

  it('cuts the subject at 60 characters', () => {
    expect(subjectFor('x'.repeat(100))).toBe(`Flat Planner problem: ${'x'.repeat(60)}…`);
    expect(subjectFor('  short   text \n here ')).toBe('Flat Planner problem: short text here');
  });

  it('stays under the length cap and trims the details, not her words', () => {
    const what = 'The wall would not move when I dragged it. '.repeat(10).trim();
    const m = buildMailto(ADDRESS, what, 'It should have moved.', d());
    expect(m.url.length).toBeLessThanOrEqual(MAX_URL);
    expect(m.trimmed).toBe(true);
    expect(m.cut).toBe(false);
    const body = new URLSearchParams(m.url.slice(m.url.indexOf('?') + 1)).get('body')!;
    expect(body).toContain(what);
    expect(body).toContain('It should have moved.');
    expect(body).toContain('More details were left out');
  });

  it('keeps everything when it all fits', () => {
    const m = buildMailto(ADDRESS, 'Short.', '', collectDetails(env({ errors: [] })), 5000);
    expect(m.trimmed).toBe(false);
    const body = new URLSearchParams(m.url.slice(m.url.indexOf('?') + 1)).get('body')!;
    expect(body).toContain('Browser: TestBrowser/1.0 (iPad)');
    expect(body).not.toContain('left out');
  });

  it('drops the device first, then the changes, then the oldest errors; the summary goes last', () => {
    expect(KEEP_ORDER).toEqual(['summary', 'errors', 'changes', 'device']);
    const details = d();
    const sizes = [5000, 1800, 1400, 1100, 900, 700, 600].map((max) => {
      const body = new URLSearchParams(buildMailto(ADDRESS, 'Problem.', '', details, max).url.split('?')[1]).get('body')!;
      return {
        device: body.includes('Browser:'),
        changes: body.includes('Last changes'),
        errors: (body.match(/error: Something failed/g) ?? []).length,
        summary: body.includes('App version'),
      };
    });
    expect(sizes[0]).toEqual({ device: true, changes: true, errors: 20, summary: true });
    // As room shrinks, nothing that is dropped ever comes back, and the order of loss is the keep order.
    for (let i = 1; i < sizes.length; i++) {
      const a = sizes[i - 1];
      const b = sizes[i];
      if (!a.device) expect(b.device).toBe(false);
      if (!a.changes) expect(b.changes).toBe(false);
      if (b.changes) expect(b.errors).toBe(20);
      if (b.device) expect(b.changes).toBe(true);
      expect(b.errors).toBeLessThanOrEqual(a.errors);
    }
    const tight = sizes[sizes.length - 1];
    expect(tight.device).toBe(false);
    expect(tight.summary).toBe(true);
    // The newest errors survive when the older ones are dropped.
    const mid = new URLSearchParams(buildMailto(ADDRESS, 'Problem.', '', details, 900).url.split('?')[1]).get('body')!;
    expect(mid).toContain('number 19');
    expect(mid).not.toContain('number 0 ');
  });

  it('cuts her words only when they alone are longer than a link can hold, and stays under the cap', () => {
    const long = 'abcdefghij '.repeat(600);
    const m = buildMailto(ADDRESS, long, 'And I expected more.', d());
    expect(m.url.length).toBeLessThanOrEqual(MAX_URL);
    expect(m.cut).toBe(true);
    const body = new URLSearchParams(m.url.slice(m.url.indexOf('?') + 1)).get('body')!;
    expect(body.startsWith('What happened:\r\nabcdefghij abcdefghij')).toBe(true);
    expect(body).toContain('…');
  });

  it('does not throw on a cut through an emoji', () => {
    const m = buildMailto(ADDRESS, '😀'.repeat(900), '', d());
    expect(m.url.length).toBeLessThanOrEqual(MAX_URL);
  });

  it('puts all details in the copied text', () => {
    const text = buildReportText('It broke', 'It works', d());
    expect(text.startsWith('What happened:\nIt broke\n\nWhat I expected:\nIt works\n\nDetails added automatically')).toBe(true);
    for (const s of detailSections(d())) expect(text).toContain(s.title);
    expect(text).toContain('number 19');
    expect(text).toContain('Change number 10 to the plan');
  });
});
