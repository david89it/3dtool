import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Layer, Rect, Stage } from 'react-konva';
import type Konva from 'konva';
import type { Vec2 } from '../model/types';
import { useLevel, useStore } from '../model/store';
import { computeJoints } from '../geometry/joints';
import { detectRooms } from '../geometry/rooms';
import { measureWallFace, setInternalLength, wallDimensions, type WallDimension } from '../geometry/dimensions';
import { calibrate } from '../geometry/calibration';
import { dist } from '../geometry/vec';
import { formatLength, formatScale, parseLength } from '../model/units';
import { fitView, toScreen, toWorld, zoomAt, type View } from './view';
import { dimLabelScreenPos } from './hitTest';
import { UnderlayImage } from './layers/UnderlayLayer';
import { RoomFills } from './layers/RoomLayer';
import { WallShapes } from './layers/WallLayer';
import { StairShapes } from './layers/StairLayer';
import { OverlayLayer } from './layers/OverlayLayer';
import { selectTool } from './tools/selectTool';
import { traceTool, finishTrace } from './tools/traceTool';
import { calibrateTool } from './tools/calibrateTool';
import { moveImageTool } from './tools/moveImageTool';
import type { Overlay, PointerInfo, ToolCtx, ToolHandler } from './tools/types';
import { COLORS } from './theme';
import { canvasApi } from './canvasApi';

const TOOLS: Record<string, ToolHandler> = {
  select: selectTool,
  draw: traceTool,
  calibrate: calibrateTool,
  moveImage: moveImageTool,
};

interface LabelEdit {
  wallId: string;
  screen: Vec2;
  angle: number;
  current: number;
  text: string;
  error?: string;
}

export function PlanCanvas() {
  const level = useLevel();
  const project = useStore((s) => s.project);
  const levelId = useStore((s) => s.levelId);
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const units = useStore((s) => s.units);
  const showMarkers = useStore((s) => s.showMarkers);

  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 0.1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [overlay, setOverlay] = useState<Overlay>({});
  const [labelEdit, setLabelEdit] = useState<LabelEdit | null>(null);
  const [calib, setCalib] = useState<{ p1: Vec2; p2: Vec2; text: string; error?: string } | null>(null);
  const fittedFor = useRef<string>('');

  // Size of the drawing area.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
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

  // Tools forget half-finished actions when the tool or floor changes.
  useEffect(() => {
    Object.values(TOOLS).forEach((t) => t.reset?.());
    setOverlay({});
    setLabelEdit(null);
  }, [tool, levelId]);

  const derived = useMemo(() => {
    if (!level) return null;
    const joints = computeJoints(level);
    const rooms = detectRooms(level, joints);
    const dims = wallDimensions(level, joints, rooms);
    return { joints, rooms, dims };
  }, [level]);

  const openLabelEditor = useCallback(
    (d: WallDimension) => {
      const v = viewRef.current;
      setLabelEdit({
        wallId: d.wallId,
        screen: dimLabelScreenPos(v, d),
        angle: d.angleDeg,
        current: d.length,
        text: formatLength(d.length, useStore.getState().units),
      });
    },
    [],
  );

  const derivedRef = useRef(derived);
  derivedRef.current = derived;
  const ctx = useMemo<ToolCtx | null>(() => {
    if (!level || !derived) return null;
    return {
      level,
      view,
      derived,
      setOverlay,
      panBy: (dx, dy) => setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy })),
      openLabelEditor,
      openCalibration: (p1, p2) => setCalib({ p1, p2, text: '' }),
    };
  }, [level, derived, view, openLabelEditor]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // Public hooks for the rest of the UI (and tests).
  useEffect(() => {
    canvasApi.escape = () => {
      const c = ctxRef.current;
      if (c) TOOLS[useStore.getState().tool].escape?.(c);
      setLabelEdit(null);
      setCalib(null);
    };
    canvasApi.finishTrace = () => {
      const c = ctxRef.current;
      if (c) finishTrace(c);
    };
    canvasApi.fit = () => {
      const L = useStore.getState().project.levels.find((l) => l.id === useStore.getState().levelId);
      setView(fitView(L, wrapRef.current?.clientWidth ?? 800, wrapRef.current?.clientHeight ?? 600));
    };
    canvasApi.zoom = (factor) => {
      const el = wrapRef.current;
      if (!el) return;
      setView((v) => zoomAt(v, { x: el.clientWidth / 2, y: el.clientHeight / 2 }, factor));
    };
    canvasApi.exportPng = () => stageRef.current?.toDataURL({ pixelRatio: 2 }) ?? null;
    canvasApi.worldToScreen = (p) => {
      const r = wrapRef.current?.getBoundingClientRect();
      const s = toScreen(viewRef.current, p);
      return { x: s.x + (r?.left ?? 0), y: s.y + (r?.top ?? 0) };
    };
    canvasApi.getView = () => viewRef.current;
  }, []);
  useEffect(() => {
    canvasApi.dimLabelPos = (wallId) => {
      const d = derivedRef.current?.dims.find((x) => x.wallId === wallId);
      if (!d) return null;
      const r = wrapRef.current?.getBoundingClientRect();
      const s = dimLabelScreenPos(viewRef.current, d);
      return { x: s.x + (r?.left ?? 0), y: s.y + (r?.top ?? 0) };
    };
  }, []);

  // ---- pointer handling -------------------------------------------------
  const pointers = useRef(new Map<number, Vec2>());
  const pinch = useRef<{ d: number; mid: Vec2 } | null>(null);
  const pan = useRef<{ last: Vec2 } | null>(null);
  const spaceDown = useRef(false);

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
    wrapRef.current?.setPointerCapture(e.pointerId);
    const p = info(e);
    pointers.current.set(e.pointerId, p.screen);
    if (pointers.current.size === 2) {
      // Two fingers: pinch to zoom and pan; abandon whatever the tool started.
      TOOLS[tool].escape?.(ctx);
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: dist(a, b), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    if (e.button === 1 || spaceDown.current) {
      pan.current = { last: p.screen };
      return;
    }
    TOOLS[tool].down(ctx, p);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ctx || labelEdit || calib) return;
    const p = info(e);
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
    TOOLS[tool].move(ctx, p);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (!ctx) return;
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    if (pan.current) {
      pan.current = null;
      return;
    }
    if (labelEdit || calib) return;
    TOOLS[tool].up(ctx, info(e));
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ctx || labelEdit || calib) return;
    TOOLS[tool].dbl?.(ctx, info(e));
  };

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

  // ---- label editing ----------------------------------------------------
  const commitLabel = () => {
    if (!labelEdit) return;
    const mm = parseLength(labelEdit.text, units, 'length');
    if (mm === null || mm < 50 || mm > 50000) {
      setLabelEdit({ ...labelEdit, error: 'Try 3.32 m, 332 cm or 10′ 11″' });
      return;
    }
    const wallId = labelEdit.wallId;
    useStore.getState().editLevel('Set wall length', (L) => {
      setInternalLength(L, wallId, mm, (lv) => measureWallFace(lv, wallId));
    });
    setLabelEdit(null);
  };

  const commitCalib = () => {
    if (!calib || !level?.underlay) {
      setCalib(null);
      return;
    }
    const mm = parseLength(calib.text, units, 'length');
    if (mm === null || mm <= 0) {
      setCalib({ ...calib, error: 'Type the real distance, for example 4.52 m' });
      return;
    }
    const next = calibrate(level.underlay, calib.p1, calib.p2, mm);
    useStore.getState().editLevel('Set plan scale', (L) => {
      if (L.underlay) {
        L.underlay.scaleMmPerPx = next.scaleMmPerPx;
        L.underlay.offset = next.offset;
      }
    });
    setCalib(null);
    useStore.getState().setTool('select');
    useStore.getState().toast(`Scale set: ${formatScale(next.scaleMmPerPx)}.`);
  };

  if (!level || !derived) return <div className="canvas-wrap" ref={wrapRef} />;

  const cursor =
    tool === 'draw' || tool === 'calibrate'
      ? 'crosshair'
      : tool === 'moveImage'
        ? 'move'
        : overlay.hoverNode
          ? 'grab'
          : overlay.hoverWall
            ? 'pointer'
            : 'default';

  const selectedWallId = selection?.kind === 'wall' ? selection.id : undefined;
  const selectedRoomId = selection?.kind === 'room' ? selection.id : undefined;

  return (
    <div
      className="canvas-wrap"
      ref={wrapRef}
      style={{ cursor }}
      data-testid="plan-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setOverlay((o) => ({ ...o, hoverWall: undefined, hoverNode: undefined, hoverMarker: undefined }))}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      {size.w > 0 && (
        <Stage width={size.w} height={size.h} ref={stageRef} listening={false}>
          <Layer listening={false}>
            <Rect x={0} y={0} width={size.w} height={size.h} fill={COLORS.paper} />
            <Group x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}>
              {level.underlay && <UnderlayImage underlay={level.underlay} />}
              <RoomFills level={level} rooms={derived.rooms} selectedRoomId={selectedRoomId} translucent={!!level.underlay} />
              <WallShapes level={level} joints={derived.joints} selectedWallId={selectedWallId} hoverWallId={overlay.hoverWall} />
              <StairShapes stairs={level.stairs} project={project} />
            </Group>
          </Layer>
          <Layer listening={false}>
            <OverlayLayer
              level={level}
              view={view}
              rooms={derived.rooms}
              dims={derived.dims}
              units={units}
              selection={selection}
              overlay={overlay}
              showMarkers={showMarkers}
              editingWallId={labelEdit?.wallId}
              showDims
            />
          </Layer>
        </Stage>
      )}

      {level.walls.length === 0 && !level.underlay && tool !== 'draw' && (
        <div className="canvas-empty">
          <p className="canvas-empty-title">This floor is empty</p>
          {(level.markers ?? []).length > 0 && <p>{level.markers![0].text}</p>}
          <p>Import a plan image on the left and set its scale, or choose “Draw walls” and click to place corners.</p>
        </div>
      )}

      {labelEdit && (
        <div
          className="label-editor"
          style={{ left: labelEdit.screen.x, top: labelEdit.screen.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            aria-label="Wall length on plan"
            value={labelEdit.text}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setLabelEdit({ ...labelEdit, text: e.target.value, error: undefined })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitLabel();
              if (e.key === 'Escape') setLabelEdit(null);
            }}
            onBlur={() => setLabelEdit(null)}
          />
          <div className={labelEdit.error ? 'label-editor-hint error' : 'label-editor-hint'}>
            {labelEdit.error ?? 'Inside length. Enter to apply, Esc to cancel'}
          </div>
        </div>
      )}

      {calib && (
        <div className="modal-backdrop" onPointerDown={(e) => e.stopPropagation()}>
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              commitCalib();
            }}
          >
            <h2>How far apart are those two points?</h2>
            <p>
              Type the real distance. A room size printed on the plan works well: for example the reception is
              4.52 m wide.
            </p>
            <input
              autoFocus
              aria-label="Real distance"
              placeholder="e.g. 4.52 m"
              value={calib.text}
              onChange={(e) => setCalib({ ...calib, text: e.target.value, error: undefined })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') setCalib(null);
              }}
            />
            {calib.error && <p className="error">{calib.error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setCalib(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary">
                Set scale
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
        <button className="icon-btn" aria-label="Zoom in" title="Zoom in" onClick={() => canvasApi.zoom(1.25)}>
          +
        </button>
        <button className="icon-btn" aria-label="Zoom out" title="Zoom out" onClick={() => canvasApi.zoom(0.8)}>
          −
        </button>
        <button className="icon-btn wide" title="Show the whole floor" onClick={() => canvasApi.fit()}>
          Fit
        </button>
      </div>
      <ToolHint />
    </div>
  );
}

function ToolHint() {
  const tool = useStore((s) => s.tool);
  const text =
    tool === 'draw'
      ? 'Click to place corners. Double-click, Enter or Esc to finish. Hold Alt to turn off snapping.'
      : tool === 'calibrate'
        ? 'Click two points on the plan image whose real distance you know.'
        : tool === 'moveImage'
          ? 'Drag the plan image to line it up. Lock it when you are done.'
          : 'Click a wall to edit it. Drag to move it. Click a measurement to type a length. Double-click a wall to split it.';
  return <div className="tool-hint">{text}</div>;
}
