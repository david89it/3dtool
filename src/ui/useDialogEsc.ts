import { useEffect, useRef, type RefObject } from 'react';

/**
 * Esc closes the window on top, wherever the focus is. Windows can sit on top
 * of each other (the scan guide over Settings), so only the newest one reacts.
 * Fields that use Esc themselves (type a number, Esc cancels) stop the key
 * first, so a window never closes while she is still typing in one of them.
 */
const stack: symbol[] = [];

export function useDialogEsc(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = Symbol('dialog');
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (stack[stack.length - 1] !== id) return;
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open]);
}

/**
 * A menu or pop-over closes when she taps or clicks anywhere outside it, or
 * presses Esc. (Hover is no use on an iPad, so a menu must never wait for the
 * pointer to leave.)
 */
export function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeRef.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) closeRef.current();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
    };
  }, [open, ref]);
}

/** Keys pressed while a window was open: the plan must ignore them (Esc closing a window must not also deselect). */
const insideWindow = new WeakSet<Event>();
export function keyWasForWindow(e: Event): boolean {
  return insideWindow.has(e);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function shown(el: HTMLElement): boolean {
  if (el.closest('[inert], [hidden]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function topWindow(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(shown);
  return all[all.length - 1] ?? null;
}

function controlsIn(win: HTMLElement): HTMLElement[] {
  return Array.from(win.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(shown);
}

/** The first control worth landing on: a field if there is one, else the first button that is not Close. */
function firstUseful(win: HTMLElement): HTMLElement {
  const all = controlsIn(win);
  return (
    all.find((el) => el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), textarea, select')) ??
    all.find((el) => !/close|cancel/i.test(`${el.getAttribute('aria-label') ?? ''} ${el.textContent ?? ''}`)) ??
    all[0] ??
    win
  );
}

/**
 * One for the whole app (call it once, from App). Every window (anything with role="dialog") gets:
 *  - the focus on its first useful control when it opens,
 *  - Tab and Shift-Tab kept inside the topmost one,
 *  - the focus handed back to what opened it when it closes.
 * It also marks Esc and Tab pressed while a window is open so the plan's shortcuts skip them.
 */
export function useWindowFocus() {
  useEffect(() => {
    // What she last pressed or focused outside any window: that is what opens the next one.
    let opener: HTMLElement | null = null;
    const remember = (t: EventTarget | null) => {
      let el = (t as HTMLElement | null)?.closest?.<HTMLElement>('button, a, input, select, textarea, [tabindex], [role=button], [role=menuitem], [role=menuitemradio]') ?? null;
      // A menu closes when she picks from it, so the thing that opened the window is the menu's own button.
      const menu = el?.closest('[role="menu"]');
      if (menu) el = menu.parentElement?.querySelector<HTMLElement>(':scope > button') ?? el;
      if (el && !el.closest('[role="dialog"]')) opener = el;
    };
    const onDown = (e: Event) => remember(e.target);
    const stack: { win: HTMLElement; opener: HTMLElement | null }[] = [];

    const sync = () => {
      const top = topWindow();
      // Windows that are gone: hand the focus back when nothing else holds it.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].win.isConnected && shown(stack[i].win)) continue;
        const [gone] = stack.splice(i, 1);
        const back = gone.opener;
        const a = document.activeElement;
        const lost = !a || a === document.body || !a.isConnected;
        if (lost && !top && back?.isConnected && !back.closest('[inert]')) back.focus({ preventScroll: true });
      }
      if (top && !stack.some((s) => s.win === top)) {
        stack.push({ win: top, opener });
        if (!top.contains(document.activeElement)) {
          if (!top.hasAttribute('tabindex')) top.setAttribute('tabindex', '-1');
          firstUseful(top).focus({ preventScroll: true });
        }
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const win = topWindow();
      if (!win) return;
      if (e.key === 'Escape') insideWindow.add(e);
      if (e.key !== 'Tab') return;
      insideWindow.add(e);
      e.stopPropagation(); // the plan uses Tab for 3D
      const list = controlsIn(win);
      if (list.length === 0) {
        e.preventDefault();
        win.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !win.contains(active) || active === win) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const mo = new MutationObserver(sync);
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('focusin', onDown, true);
    window.addEventListener('keydown', onKey, true);
    sync();
    return () => {
      mo.disconnect();
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('focusin', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);
}
