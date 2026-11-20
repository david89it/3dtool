// Measures the running dev server on a busy plan (seed + 150 pieces + 30 notes):
// React renders and main-thread time per pointer move while hovering and
// dragging, a floor switch, and the 3D view (build time and frames per second,
// as a relative number only: headless Chromium draws 3D in software).
//
//   npm run dev -- --port 5217 --strictPort &
//   node scripts/perf-browser.mjs http://localhost:5217
//
// Needs the dev server (it uses the window.__flatplan and window.__renders hooks).

import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5217';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(`${url}/?notour`);
await page.evaluate(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('keyval-store');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    }),
);
await page.reload();
await page.waitForFunction(() => window.__flatplan?.store.getState().ready);

// Busy plan.
await page.evaluate(async () => {
  const { stressProject } = await import('/src/test/fuzzHelpers.ts');
  const p = stressProject(150, 30);
  // Second option on the first floor (the compare feature).
  const { duplicateAsOption } = await import('/src/model/schemes.ts');
  const s = window.__flatplan.store.getState();
  s.loadProject(p);
  const first = p.levels.find((l) => /first/i.test(l.name));
  s.setLevel(first.id);
  s.commit('Add option', (d) => void duplicateAsOption(d, first.id));
  s.setLevel(first.id);
  s.setMode('furnish');
});
await page.waitForTimeout(800);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const metrics = async () => {
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  const get = (n) => m.find((x) => x.name === n)?.value ?? 0;
  return { task: get('TaskDuration') * 1000, script: get('ScriptDuration') * 1000, layout: get('LayoutDuration') * 1000 };
};
const counters = () => page.evaluate(() => ({ ...(window.__renders ?? {}) }));
const resetCounters = () => page.evaluate(() => window.__renderReset?.());

const results = {};
const PROFILE = process.env.PROFILE; // e.g. PROFILE="drag a piece" prints the hottest functions for that step
function topFunctions(profile, limit = 25) {
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => {
    const n = byId.get(id);
    const f = n.callFrame;
    const key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
  });
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
}
/** Time spent in jsxDEV (creating elements, dev builds only), by the component that called it. */
function jsxCallers(profile, limit = 12) {
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const out = new Map();
  profile.samples.forEach((id, i) => {
    const n = byId.get(id);
    if (!/jsxDEV/.test(n.callFrame.functionName)) return;
    const p = byId.get(parent.get(id));
    const f = p?.callFrame;
    const key = f ? `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber}` : '?';
    out.set(key, (out.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0));
  });
  return [...out].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
}
async function measure(name, n, run) {
  if (PROFILE && name.startsWith(PROFILE)) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
  }
  await resetCounters();
  const m0 = await metrics();
  const t0 = Date.now();
  await run();
  await page.waitForTimeout(150);
  const m1 = await metrics();
  const c = await counters();
  const per = (x) => +(x / n).toFixed(2);
  if (PROFILE && name.startsWith(PROFILE)) {
    const { profile } = await cdp.send('Profiler.stop');
    console.error(`--- hottest functions: ${name}\n` + topFunctions(profile).join('\n') + '\n--- jsxDEV callers\n' + jsxCallers(profile).join('\n'));
  }
  results[name] = {
    steps: n,
    taskMsPerStep: per(m1.task - m0.task),
    scriptMsPerStep: per(m1.script - m0.script),
    rendersPerStep: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, per(v)])),
    wallMs: Date.now() - t0,
  };
}

const box = await page.locator('[data-testid="plan-canvas"]').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

// A. Hover across the plan.
await page.mouse.move(cx, cy);
await measure('hover (Furnish, 80 moves)', 80, async () => {
  for (let i = 0; i < 80; i++) await page.mouse.move(cx - 300 + ((i * 7) % 600), cy - 200 + ((i * 11) % 400));
});

// B. Drag a piece of furniture: find one near the middle of the floor.
const grab = await page.evaluate(() => {
  const s = window.__flatplan.store.getState();
  const L = s.project.levels.find((l) => l.id === s.levelId);
  const c = window.__flatplan.canvas;
  const target = L.items.filter((i) => i.dims.w < 1500).map((i) => ({ id: i.id, s: c.worldToScreen(i.pos) }));
  const m = target.sort((a, b) => Math.hypot(a.s.x - 700, a.s.y - 450) - Math.hypot(b.s.x - 700, b.s.y - 450))[0];
  return m.s;
});
await page.mouse.move(grab.x, grab.y);
await page.mouse.down();
await measure('drag a piece (60 moves)', 60, async () => {
  for (let i = 1; i <= 60; i++) await page.mouse.move(grab.x + i * 3, grab.y + Math.sin(i / 5) * 30);
});
await page.mouse.up();
await page.waitForTimeout(300);
results['drag a piece (60 moves)'].undoSteps = await page.evaluate(() => window.__flatplan.store.getState().past.length);

// C. Drag a wall in Trace mode.
await page.evaluate(() => window.__flatplan.store.getState().setMode('trace'));
await page.waitForTimeout(300);
// Notes sit on top of walls and take the click first; move them out of the way for this step.
await page.evaluate(() => window.__flatplan.store.getState().editLevel('hide notes', (L) => void (L.notes = [])));
const wallPt = await page.evaluate(() => {
  const s = window.__flatplan.store.getState();
  const L = s.project.levels.find((l) => l.id === s.levelId);
  const len = (x) => {
    const a = L.nodes.find((n) => n.id === x.a).pos;
    const b = L.nodes.find((n) => n.id === x.b).pos;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const w = [...L.walls].filter((x) => x.openings.length === 0).sort((p, q) => len(q) - len(p))[0];
  const a = L.nodes.find((n) => n.id === w.a).pos;
  const b = L.nodes.find((n) => n.id === w.b).pos;
  return window.__flatplan.canvas.worldToScreen({ x: a.x + (b.x - a.x) * 0.3, y: a.y + (b.y - a.y) * 0.3 });
});
const wallsBefore = await page.evaluate(() => JSON.stringify(window.__flatplan.store.getState().project.levels.find((l) => l.id === window.__flatplan.store.getState().levelId).nodes));
await page.mouse.move(wallPt.x, wallPt.y);
await page.mouse.down();
await measure('drag a wall (60 moves)', 60, async () => {
  for (let i = 1; i <= 60; i++) await page.mouse.move(wallPt.x + i * 2, wallPt.y + i);
});
await page.mouse.up();
await page.waitForTimeout(300);
results['drag a wall (60 moves)'].moved = wallsBefore !== (await page.evaluate(() => JSON.stringify(window.__flatplan.store.getState().project.levels.find((l) => l.id === window.__flatplan.store.getState().levelId).nodes)));
results['drag a wall (60 moves)'].undoSteps = await page.evaluate(() => window.__flatplan.store.getState().past.length);
await page.evaluate(() => {
  const s = window.__flatplan.store.getState();
  s.undo(); // the wall
  s.undo(); // the notes
});
await page.evaluate(() => window.__flatplan.store.getState().setMode('furnish'));

// D. Switch floors (a full redraw of the plan).
await measure('switch floor (10 switches)', 10, async () => {
  for (let i = 0; i < 10; i++) {
    await page.evaluate((k) => {
      const s = window.__flatplan.store.getState();
      const ls = s.project.levels.filter((l) => l.items.length > 0 || l.walls.length > 0);
      s.setLevel(ls[k % ls.length].id);
    }, i);
    await page.waitForTimeout(60);
  }
});

// E. One edit that changes the furniture (undo-able): rules and 3D inputs change.
await measure('move a piece by typing (10 edits)', 10, async () => {
  for (let i = 0; i < 10; i++) {
    await page.evaluate((k) => {
      const s = window.__flatplan.store;
      const st = s.getState();
      const L = st.project.levels.find((l) => l.id === st.levelId);
      const it = L.items[0];
      st.editLevel('nudge', (lv) => {
        lv.items[0].pos = { x: it.pos.x + 10 + k, y: it.pos.y };
      });
    }, i);
    await page.waitForTimeout(40);
  }
});

// F. 3D.
const t3 = Date.now();
await page.evaluate(() => window.__flatplan.store.getState().setMode('3d'));
await page.waitForFunction(() => window.__flatplan3d?.ready, null, { timeout: 60_000 });
const buildMs = Date.now() - t3;
await page.waitForTimeout(3500);
const fps = await page.evaluate(() => window.__flatplan3d.fps);
await measure('3D: edit a piece (10 edits)', 10, async () => {
  for (let i = 0; i < 10; i++) {
    await page.evaluate((k) => {
      const st = window.__flatplan.store.getState();
      st.editLevel('nudge', (lv) => {
        lv.items[0].pos = { x: lv.items[0].pos.x + 5 + k, y: lv.items[0].pos.y };
      });
    }, i);
    await page.waitForTimeout(100);
  }
});
const fpsAfter = await page.evaluate(() => window.__flatplan3d.fps);
const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);

console.log(JSON.stringify({ results, threeD: { firstBuildMs: buildMs, fps, fpsAfterEdits: fpsAfter }, heapMB: +(heap / 1e6).toFixed(1), errors }, null, 2));
await browser.close();
