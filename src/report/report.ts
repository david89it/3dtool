// "Report a problem": gathers the details that are added to a report automatically, and turns the
// report into plain text (for Copy everything) or a mailto: link (for Send email).
//
// What is never included: the plan's geometry (walls, positions, sizes), the plan image, and her
// API key. Only words about what she was doing: the floor name, the mode, what is selected (in
// words), the last few undo labels, recent errors, and the device.

import { useStore, type Mode, type Selection } from '../model/store';
import { savingPaused } from '../model/persistence';
import { findCatalogueItem } from '../catalogue/catalogue';
import type { Project } from '../model/types';
import { capture, type CapturedEvent } from './consoleBuffer';

export const UNDO_LABELS = 10;
export const MAX_URL = 1800;

export interface DetailsEnv {
  now: Date;
  userAgent: string;
  screen: { w: number; h: number } | null;
  viewport: { w: number; h: number } | null;
  touch: boolean;
  saving: 'on' | 'paused';
  errors: CapturedEvent[];
  version: string;
  builtOn: string;
  timeZone: string;
}

export interface ReportDetails {
  version: string;
  builtOn: string;
  when: string;
  floor: string;
  mode: string;
  selected: string;
  saving: string;
  /** Newest first. */
  undo: string[];
  /** Newest first. */
  errors: string[];
  browser: string;
  screen: string;
  window: string;
  touch: string;
  openedFrom?: 'crash';
}

const MODE_NAME: Record<Mode, string> = { trace: 'Trace', openings: 'Openings', furnish: 'Furnish', advice: 'Advice', '3d': '3D' };

const pad = (n: number) => String(n).padStart(2, '0');

/** 2026-11-20 14:32 in the viewer's own time. */
export function formatWhen(d: Date, timeZone: string): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}${timeZone ? ` (${timeZone})` : ''}`;
}

/** What is selected, in words. Never positions or sizes. */
export function describeSelection(project: Project, levelId: string, sel: Selection): string {
  if (!sel) return 'nothing';
  const level = project.levels.find((l) => l.id === levelId);
  switch (sel.kind) {
    case 'wall':
      return 'a wall';
    case 'node':
      return 'a wall corner';
    case 'room': {
      const r = level?.rooms?.find((x) => x.id === sel.id);
      return r?.name ? `the room “${r.name}”` : 'a room';
    }
    case 'marker':
      return 'a “measure me” pin';
    case 'note': {
      const n = level?.notes?.find((x) => x.id === sel.id);
      return n?.kind === 'measure' ? 'a measurement on the plan' : n?.kind === 'arrow' ? 'an arrow on the plan' : 'a note on the plan';
    }
    case 'opening': {
      for (const w of level?.walls ?? []) {
        const o = w.openings?.find((x) => x.id === sel.id);
        if (o) return o.type === 'door' ? 'a door' : o.type === 'window' ? 'a window' : o.type === 'bayWindow' ? 'a bay window' : 'an opening in a wall';
      }
      return 'an opening';
    }
    case 'item': {
      const it = level?.items?.find((x) => x.id === sel.id);
      const cat = it ? findCatalogueItem(project, it.catalogueId) : undefined;
      return cat ? `a piece of furniture: ${cat.name}` : 'a piece of furniture';
    }
    case 'items':
      return `${sel.ids.length} pieces of furniture`;
  }
}

function time(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** The browser and device, read from the page. Missing things are left out rather than guessed. */
export function readEnv(): DetailsEnv {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const win = typeof window !== 'undefined' ? window : undefined;
  let timeZone = '';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    // an old browser: no time zone name
  }
  return {
    now: new Date(),
    userAgent: nav?.userAgent ?? '',
    screen: win?.screen ? { w: win.screen.width, h: win.screen.height } : null,
    viewport: win ? { w: win.innerWidth, h: win.innerHeight } : null,
    touch: !!win && ((nav?.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in win),
    saving: savingPaused() ? 'paused' : 'on',
    errors: capture.toArray(),
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
    builtOn: typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '',
    timeZone,
  };
}

/**
 * Collect the automatic details. Every part is read on its own, so a broken plan (the reason for a
 * crash report) still gives a report with everything else in it.
 */
export function collectDetails(over: Partial<DetailsEnv> = {}, openedFrom?: 'crash'): ReportDetails {
  const env = { ...readEnv(), ...over };
  const attempt = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const s = useStore.getState();
  const floor = attempt(() => {
    const L = s.project.levels.find((l) => l.id === s.levelId);
    return L ? `${L.name}${L.scheme?.name ? ` (option: ${L.scheme.name})` : ''}` : 'unknown';
  }, 'unknown');
  const d: ReportDetails = {
    version: env.version || 'dev',
    builtOn: env.builtOn,
    when: formatWhen(env.now, env.timeZone),
    floor,
    mode: MODE_NAME[s.mode] ?? String(s.mode),
    selected: attempt(() => describeSelection(s.project, s.levelId, s.selection), 'unknown'),
    saving: env.saving === 'paused' ? 'paused (your last saved plan is kept)' : 'on',
    undo: attempt(
      () =>
        s.past
          .slice(-UNDO_LABELS)
          .reverse()
          .map((e) => String(e.label).slice(0, 80)),
      [],
    ),
    errors: env.errors
      .slice(-CAPTURE_SHOWN)
      .reverse()
      .map((e) => `${time(e.t)} ${e.kind}: ${e.text}`),
    browser: env.userAgent.slice(0, 300) || 'unknown',
    screen: env.screen ? `${env.screen.w} x ${env.screen.h}` : 'unknown',
    window: env.viewport ? `${env.viewport.w} x ${env.viewport.h}` : 'unknown',
    touch: env.touch ? 'yes' : 'no',
  };
  if (openedFrom) d.openedFrom = openedFrom;
  return d;
}

const CAPTURE_SHOWN = 20;

/** The parts of the details, in the order they are shown. `lines` of a long part are newest first. */
export interface Section {
  id: 'summary' | 'device' | 'changes' | 'errors';
  title: string;
  lines: string[];
}

export function detailSections(d: ReportDetails): Section[] {
  return [
    {
      id: 'summary',
      title: 'Details added automatically',
      lines: [
        `App version: ${d.version}${d.builtOn ? ` (built ${d.builtOn})` : ''}`,
        `When: ${d.when}`,
        `Floor: ${d.floor}. Mode: ${d.mode}`,
        `Selected: ${d.selected}`,
        `Saving: ${d.saving}`,
        ...(d.openedFrom === 'crash' ? ['Sent from: the error screen'] : []),
      ],
    },
    {
      id: 'device',
      title: 'Device',
      lines: [`Browser: ${d.browser}`, `Screen: ${d.screen}. Window: ${d.window}. Touch: ${d.touch}`],
    },
    {
      id: 'changes',
      title: `Last changes, newest first`,
      lines: d.undo.length ? d.undo.map((l) => `- ${l}`) : ['- none yet'],
    },
    {
      id: 'errors',
      title: 'Recent errors and warnings, newest first',
      lines: d.errors.length ? d.errors.map((l) => `- ${l}`) : ['- none'],
    },
  ];
}

/** When the email link has no room for everything, parts are dropped from the bottom of this list up. */
export const KEEP_ORDER: Section['id'][] = ['summary', 'errors', 'changes', 'device'];

const renderSection = (s: Section, lines: string[]) => `${s.title}\n${lines.join('\n')}`;

/** The details as text, in full. */
export function formatDetails(d: ReportDetails): string {
  return detailSections(d)
    .map((s) => renderSection(s, s.lines))
    .join('\n\n');
}

function herText(what: string, expected: string): string {
  const w = what.trim();
  const e = expected.trim();
  return `What happened:\n${w}${e ? `\n\nWhat I expected:\n${e}` : ''}`;
}

/** The whole report as plain text: her words first, then the details. */
export function buildReportText(what: string, expected: string, d: ReportDetails): string {
  return `${herText(what, expected)}\n\n${formatDetails(d)}\n`;
}

/** Line breaks in a mailto body are CR LF. A lone surrogate would make encodeURIComponent throw. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export const enc = (s: string) => encodeURIComponent(s.replace(LONE_SURROGATE, '�').replace(/\r?\n/g, '\r\n'));

export function subjectFor(what: string): string {
  const flat = what.replace(/\s+/g, ' ').trim();
  return `Flat Planner problem: ${flat.length > 60 ? `${flat.slice(0, 60).trimEnd()}…` : flat}`;
}

/** The longest start of `text` (ending in …) whose encoded length is at most `limit`. */
function fitPrefix(text: string, limit: number): string {
  if (enc(text).length <= limit) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (enc(`${text.slice(0, mid)}…`).length <= limit) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo)}…` : '';
}

const TRIM_NOTE = '(More details were left out so this fits in an email link. Copy everything has all of them.)';

export interface Mailto {
  url: string;
  /** True when some of the automatic details had to be left out. */
  trimmed: boolean;
  /** True when her own words were cut (only when they alone are longer than a link can hold). */
  cut: boolean;
}

/**
 * Build `mailto:<address>?subject=…&body=…` no longer than `max` characters. Her words go first and
 * are kept; the details follow and are trimmed to fit, dropping the device first, then the undo
 * list, then the oldest errors (see KEEP_ORDER).
 */
export function buildMailto(address: string, what: string, expected: string, d: ReportDetails, max = MAX_URL): Mailto {
  const head = `mailto:${address}?subject=${enc(subjectFor(what))}&body=`;
  const budget = max - head.length;
  // Her words first. They only get cut when they alone do not fit.
  let w = what.trim();
  let e = expected.trim();
  let cut = false;
  const reserve = enc(`\n\n${TRIM_NOTE}`).length;
  if (enc(herText(w, e)).length > budget - reserve) {
    cut = true;
    const wOnly = enc(herText(w, '')).length;
    if (wOnly <= budget - reserve) {
      // Keep all of "what happened" and as much of "what I expected" as fits.
      const room = budget - reserve - wOnly - enc('\n\nWhat I expected:\n…').length;
      e = room > 0 ? fitPrefix(e, room) : '';
    } else {
      e = '';
      w = fitPrefix(w, budget - reserve - enc('What happened:\n').length);
    }
  }
  const mine = herText(w, e);
  const sections = detailSections(d);
  const have = new Map<Section['id'], string[]>();
  const compose = (trimmed: boolean): string => {
    const parts = sections.filter((s) => (have.get(s.id)?.length ?? 0) > 0).map((s) => renderSection(s, have.get(s.id)!));
    return [mine, ...parts, ...(trimmed ? [TRIM_NOTE] : [])].join('\n\n');
  };
  const fits = (text: string) => head.length + enc(text).length <= max;
  let stop = false;
  for (const id of KEEP_ORDER) {
    const sec = sections.find((s) => s.id === id)!;
    for (const line of sec.lines) {
      if (stop) break;
      const before = have.get(id) ?? [];
      have.set(id, [...before, line]);
      if (!fits(compose(true))) {
        have.set(id, before);
        stop = true;
      }
    }
    if (stop) break;
  }
  const all = sections.every((s) => (have.get(s.id)?.length ?? 0) === s.lines.length);
  const body = compose(!all);
  return { url: head + enc(body), trimmed: !all, cut };
}
