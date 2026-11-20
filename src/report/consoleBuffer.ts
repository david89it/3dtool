// A small memory of the last problems the app hit, so a report can say what went wrong behind
// the scenes: console errors and warnings, window.onerror and unhandled promise rejections.
// Nothing is sent anywhere by this file; the text only goes out when she presses a button in
// the Report a problem window. Keys and pictures are scrubbed before they are stored.

export type CaptureKind = 'error' | 'warning' | 'window error' | 'unhandled rejection';

export interface CapturedEvent {
  /** Milliseconds since 1970. */
  t: number;
  kind: CaptureKind;
  text: string;
}

/** Keeps the newest `capacity` items. */
export class RingBuffer<T> {
  private items: T[] = [];
  constructor(readonly capacity: number) {}
  push(x: T): void {
    this.items.push(x);
    if (this.items.length > this.capacity) this.items.splice(0, this.items.length - this.capacity);
  }
  /** Oldest first. */
  toArray(): T[] {
    return this.items.slice();
  }
  clear(): void {
    this.items = [];
  }
  get length(): number {
    return this.items.length;
  }
}

export const CAPTURE_LIMIT = 20;
const MAX_TEXT = 300;

/** Remove anything that must not leave the browser, and keep it short. */
export function scrub(text: string): string {
  return text
    .replace(/sk-ant-[\w-]+/g, '[key removed]')
    .replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g, '[image removed]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email removed]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

function describeOne(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) {
    const frame = (a.stack ?? '').split('\n').find((l) => /^\s*at /.test(l));
    return `${a.name}: ${a.message}${frame ? ` ${frame.trim()}` : ''}`;
  }
  if (a === undefined) return 'undefined';
  try {
    const s = JSON.stringify(a);
    return s === undefined ? String(a) : s;
  } catch {
    return String(a);
  }
}

/** The arguments of one console call, as one line of text. */
export function describeArgs(args: unknown[]): string {
  return scrub(args.map(describeOne).join(' '));
}

export const capture = new RingBuffer<CapturedEvent>(CAPTURE_LIMIT);

interface ConsoleLike {
  error: (...a: unknown[]) => void;
  warn: (...a: unknown[]) => void;
}
interface WindowLike {
  // `any`: a real window passes typed events, a test passes plain objects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEventListener: (type: string, fn: (e: any) => void) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeEventListener: (type: string, fn: (e: any) => void) => void;
}

const INSTALLED = Symbol.for('flatplan.consoleCapture');

/**
 * Start remembering errors and warnings. Safe to call twice (the second call does nothing).
 * Returns a function that puts everything back, for tests.
 */
export function installConsoleCapture(
  opts: { console?: ConsoleLike; win?: WindowLike | null; buffer?: RingBuffer<CapturedEvent>; now?: () => number } = {},
): () => void {
  const con = opts.console ?? (typeof console !== 'undefined' ? console : undefined);
  const win = opts.win === undefined ? (typeof window !== 'undefined' ? window : null) : opts.win;
  const buf = opts.buffer ?? capture;
  const now = opts.now ?? Date.now;
  if (!con) return () => {};
  const tagged = con as unknown as Record<symbol, unknown>;
  if (tagged[INSTALLED]) return () => {};
  tagged[INSTALLED] = true;

  const add = (kind: CaptureKind, text: string) => buf.push({ t: now(), kind, text });
  const origError = con.error;
  const origWarn = con.warn;
  con.error = function (this: unknown, ...a: unknown[]) {
    try {
      add('error', describeArgs(a));
    } catch {
      // Capturing must never break the call it is watching.
    }
    return origError.apply(this, a);
  };
  con.warn = function (this: unknown, ...a: unknown[]) {
    try {
      add('warning', describeArgs(a));
    } catch {
      // see above
    }
    return origWarn.apply(this, a);
  };
  const onError = (e: { message?: string; filename?: string; lineno?: number; colno?: number; error?: unknown }) => {
    const where = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno ?? 0}:${e.colno ?? 0})` : '';
    add('window error', scrub(`${e.message || describeOne(e.error)}${where}`));
  };
  const onRejection = (e: { reason?: unknown }) => add('unhandled rejection', describeArgs([e.reason]));
  win?.addEventListener('error', onError);
  win?.addEventListener('unhandledrejection', onRejection);

  return () => {
    con.error = origError;
    con.warn = origWarn;
    win?.removeEventListener('error', onError);
    win?.removeEventListener('unhandledrejection', onRejection);
    delete tagged[INSTALLED];
  };
}
