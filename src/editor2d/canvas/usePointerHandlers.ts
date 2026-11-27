// Mouse, touch and pen handling for the plan: tool dispatch, pan, pinch, long press and the context menu.
import { useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import type { Vec2 } from '../../model/types';
import { useStore, type Mode, type Tool } from '../../model/store';
import { hitItem } from '../itemHit';
import { selectInBox } from '../tools/itemTools';
import { dist } from '../../geometry/vec';
import { toWorld, zoomAt, type View } from '../view';
import type { Overlay, PointerInfo, ToolCtx } from '../tools/types';
import { hitForContext } from '../contextMenu';
import { selectHit } from '../contextActions';
import { currentTool, LONG_PRESS_MS, LONG_PRESS_SLOP_PX, TAP_TOOLS, toolFor } from './tools';
import type { CalibState, LabelEdit, MenuState } from './types';

interface Deps {
  wrapRef: RefObject<HTMLDivElement | null>;
  viewRef: MutableRefObject<View>;
  ctxRef: MutableRefObject<ToolCtx | null>;
  ctx: ToolCtx | null;
  mode: Mode;
  tool: Tool;
  labelEdit: LabelEdit | null;
  calib: CalibState | null;
  setView: Dispatch<SetStateAction<View>>;
  setOverlay: (v: Overlay | ((o: Overlay) => Overlay)) => void;
  setMenu: Dispatch<SetStateAction<MenuState | null>>;
}

export function usePointerHandlers({ wrapRef, viewRef, ctxRef, ctx, mode, tool, labelEdit, calib, setView, setOverlay, setMenu }: Deps) {
  const pointers = useRef(new Map<number, Vec2>());
  const pinch = useRef<{ d: number; mid: Vec2 } | null>(null);
  const pan = useRef<{ last: Vec2 } | null>(null);
  const spaceDown = useRef(false);
  const fingerTap = useRef<{ start: Vec2; last: Vec2; panning: boolean } | null>(null);
  const afterPinch = useRef(false);
  const longPress = useRef<{ id: number; start: Vec2; timer: ReturnType<typeof setTimeout>; fired: boolean; marquee?: boolean } | null>(null);
  // Touch, Furnish mode: a long press on empty floor then a drag draws a selection box (plan points).
  const touchBox = useRef<{ from: Vec2; to: Vec2; moved: boolean } | null>(null);
  const lastPointerType = useRef('mouse');

  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current.timer);
    longPress.current = null;
    if (touchBox.current) {
      touchBox.current = null;
      setOverlay({});
    }
  };

  /** Open the menu for whatever is at this point of the plan area, and select it. */
  const openMenu = (screen: Vec2, touch: boolean) => {
    const c = ctxRef.current;
    if (!c) return;
    const world = toWorld(viewRef.current, screen);
    const hit = hitForContext(c.level, useStore.getState().project, c.derived, viewRef.current, screen, world);
    selectHit(hit);
    setOverlay({});
    setMenu({ hit, at: screen, touch });
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        spaceDown.current = true;
        if (wrapRef.current) wrapRef.current.style.cursor = 'grab';
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        if (wrapRef.current) wrapRef.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const info = (e: React.PointerEvent | React.MouseEvent): PointerInfo => {
    const r = wrapRef.current!.getBoundingClientRect();
    const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
    return { screen, world: toWorld(viewRef.current, screen), alt: e.altKey, shift: e.shiftKey, button: e.button };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ctx || labelEdit || calib) return;
    lastPointerType.current = e.pointerType;
    // Right button: the menu opens on the contextmenu event; the tools never see it.
    if (e.button === 2) return;
    wrapRef.current?.setPointerCapture(e.pointerId);
    const p = info(e);
    pointers.current.set(e.pointerId, p.screen);
    cancelLongPress();
    if (pointers.current.size === 1 && (e.pointerType === 'touch' || e.pointerType === 'pen') && e.button === 0) {
      const id = e.pointerId;
      const start = p.screen;
      const timer = setTimeout(() => {
        const lp = longPress.current;
        if (!lp || lp.id !== id) return;
        lp.fired = true;
        // Stop the press from also being a drag, a pan or a tap.
        fingerTap.current = null;
        pan.current = null;
        const st = useStore.getState();
        currentTool().reset?.();
        if (st.gesture) st.cancelGesture();
        // Furnish mode, empty floor: hold, then drag to draw a selection box. Lifting without
        // dragging opens the menu as usual.
        const c = ctxRef.current;
        if (c && st.mode === 'furnish' && st.tool === 'select' && !hitItem(c.level, st.project, toWorld(viewRef.current, start))) {
          lp.marquee = true;
          const w = toWorld(viewRef.current, start);
          touchBox.current = { from: w, to: w, moved: false };
          return;
        }
        openMenu(start, true);
      }, LONG_PRESS_MS);
      longPress.current = { id, start, timer, fired: false };
    }
    if (pointers.current.size === 2) {
      // Two fingers: pinch to zoom and pan; abandon whatever the tool started.
      toolFor(mode, tool).escape?.(ctx);
      fingerTap.current = null;
      afterPinch.current = true;
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: dist(a, b), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    if (e.button === 1 || spaceDown.current) {
      pan.current = { last: p.screen };
      return;
    }
    // A finger on a click-to-place tool: a tap places, a drag moves the plan.
    if (e.pointerType === 'touch' && TAP_TOOLS.has(tool)) {
      fingerTap.current = { start: p.screen, last: p.screen, panning: false };
      return;
    }
    toolFor(mode, tool).down(ctx, p);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ctx || labelEdit || calib) return;
    const p = info(e);
    const lp = longPress.current;
    if (lp && lp.id === e.pointerId) {
      if (lp.fired) {
        const tb = touchBox.current;
        if (lp.marquee && tb) {
          touchBox.current = { from: tb.from, to: p.world, moved: tb.moved || dist(lp.start, p.screen) > LONG_PRESS_SLOP_PX };
          setOverlay({ marquee: { from: tb.from, to: p.world } });
        }
        return;
      }
      if (dist(lp.start, p.screen) > LONG_PRESS_SLOP_PX) cancelLongPress();
    }
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p.screen);
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = dist(a, b);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const prev = pinch.current;
      setView((v) => {
        const z = zoomAt(v, mid, d / Math.max(prev.d, 1));
        return { ...z, x: z.x + mid.x - prev.mid.x, y: z.y + mid.y - prev.mid.y };
      });
      pinch.current = { d, mid };
      return;
    }
    if (pan.current) {
      const last = pan.current.last;
      setView((v) => ({ ...v, x: v.x + p.screen.x - last.x, y: v.y + p.screen.y - last.y }));
      pan.current = { last: p.screen };
      return;
    }
    if (afterPinch.current) return;
    const ft = fingerTap.current;
    if (ft) {
      if (!ft.panning && dist(ft.start, p.screen) > 10) ft.panning = true;
      if (ft.panning) {
        const last = ft.last;
        setView((v) => ({ ...v, x: v.x + p.screen.x - last.x, y: v.y + p.screen.y - last.y }));
      }
      ft.last = p.screen;
      return;
    }
    toolFor(mode, tool).move(ctx, p);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const lp = longPress.current;
    if (lp && lp.id === e.pointerId) {
      const { fired, marquee, start } = lp;
      const box = touchBox.current;
      cancelLongPress();
      // The press became the menu or a selection box: lifting the finger is not a click on the plan.
      if (fired) {
        if (marquee && box && ctx) {
          if (box.moved) selectInBox(ctx.level, useStore.getState().project, box.from, box.to, false);
          else openMenu(start, true);
        }
        return;
      }
    }
    if (e.button === 2) return;
    if (!ctx) return;
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    if (afterPinch.current) {
      // Ignore the last finger lifting after a pinch.
      if (pointers.current.size === 0) afterPinch.current = false;
      return;
    }
    if (pan.current) {
      pan.current = null;
      return;
    }
    if (labelEdit || calib) return;
    const ft = fingerTap.current;
    fingerTap.current = null;
    if (ft) {
      if (ft.panning) return;
      // A tap: no hover on a finger, so show where it lands, then place.
      const p = info(e);
      toolFor(mode, tool).move(ctx, p);
      toolFor(mode, tool).up(ctx, { ...p, button: 0 });
      return;
    }
    toolFor(mode, tool).up(ctx, info(e));
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ctx || labelEdit || calib) return;
    toolFor(mode, tool).dbl?.(ctx, info(e));
  };

  return { onPointerDown, onPointerMove, onPointerUp, onDoubleClick, openMenu, lastPointerType };
}
