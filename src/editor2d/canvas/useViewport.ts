// Size of the drawing area, fit on floor change, and wheel zoom and pan.
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Level } from '../../model/types';
import { fitView, zoomAt, type View } from '../view';

export function useViewport(wrapRef: RefObject<HTMLDivElement | null>, level: Level | undefined) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 0.1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const fittedFor = useRef<string>('');

  // Size of the drawing area.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let prev = { w: 0, h: 0 };
    const ro = new ResizeObserver(() => {
      const next = { w: el.clientWidth, h: el.clientHeight };
      // The area grew or shrank (a side panel opened or closed): keep what is in the middle in the middle.
      if (prev.w > 0 && prev.h > 0 && (next.w !== prev.w || next.h !== prev.h)) {
        const dx = (next.w - prev.w) / 2;
        const dy = (next.h - prev.h) / 2;
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      }
      prev = next;
      setSize(next);
    });
    ro.observe(el);
    prev = { w: el.clientWidth, h: el.clientHeight };
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fit the plan when the floor changes.
  useEffect(() => {
    if (!level || size.w === 0) return;
    if (fittedFor.current === level.id) return;
    fittedFor.current = level.id;
    setView(fitView(level, size.w, size.h));
  }, [level, size.w, size.h]);

  // Wheel: pinch on a trackpad (ctrl) or ctrl/cmd + wheel zooms; scrolling pans (like Figma).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const at = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.ctrlKey || e.metaKey) {
        setView((v) => zoomAt(v, at, Math.exp(-e.deltaY * 0.01)));
      } else if (e.deltaMode === 1) {
        setView((v) => zoomAt(v, at, Math.exp(-e.deltaY * 0.05)));
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return { size, view, setView, viewRef };
}
