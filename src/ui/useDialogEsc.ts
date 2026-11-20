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
