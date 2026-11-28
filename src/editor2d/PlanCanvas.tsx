// The 2D plan. This component owns the state (view, overlay, editors, menu) and
// wires it to the pieces in ./canvas: pointer handling, viewport, canvasApi,
// the Konva stage and the small editors that float over it.
import { LayoutPill } from '../ui/layouts/LayoutPill';
import { CompareView } from '../ui/layouts/CompareView';
import { countRender } from '../perf';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Vec2 } from '../model/types';
import { useLevel, useStore } from '../model/store';
import { selectionIds } from '../model/groups';
import { computeJoints } from '../geometry/joints';
import { detectRooms } from '../geometry/rooms';
import { wallDimensions, type WallDimension } from '../geometry/dimensions';
import { formatLength } from '../model/units';
import { dimLabelScreenPos } from './hitTest';
import { SelectionToolbar } from './SelectionToolbar';
import { EmptyPlan } from './EmptyPlan';
import { ToolHint } from './ToolHint';
import { guidesForItem, type DistanceGuide, type GuideSet } from './guides';
import { findCatalogueItem } from '../catalogue/catalogue';
import type { ToolCtx } from './tools/types';
import { openingLabels } from './openingLabels';
import { canvasApi } from './canvasApi';
import { ContextMenu } from './ContextMenu';
import { ALL_TOOLS } from './canvas/tools';
import type { CalibState, LabelEdit, MenuState } from './canvas/types';
import { useOverlay } from './canvas/useOverlay';
import { useViewport } from './canvas/useViewport';
import { useCanvasApi } from './canvas/useCanvasApi';
import { usePointerHandlers } from './canvas/usePointerHandlers';
import { cursorFor } from './canvas/cursor';
import { PlanStage } from './canvas/PlanStage';
import { GuideLabel } from './canvas/GuideLabel';
import { LabelEditor, commitLabelEdit } from './canvas/LabelEditor';
import { CalibrationDialog, commitCalibration } from './canvas/CalibrationDialog';
import type Konva from 'konva';

export function PlanCanvas() {
  countRender('PlanCanvas');
  const level = useLevel();
  const project = useStore((s) => s.project);
  const levelId = useStore((s) => s.levelId);
  const tool = useStore((s) => s.tool);
  const mode = useStore((s) => s.mode);
  const ghost = useStore((s) => s.ghost);
  const highlight = useStore((s) => s.highlight);
  const itemGhost = useStore((s) => s.itemGhost);
  const showAllClearances = useStore((s) => s.showAllClearances);
  const selection = useStore((s) => s.selection);
  const selIds = useMemo(() => selectionIds(selection), [selection]);
  const units = useStore((s) => s.units);
  const showMarkers = useStore((s) => s.showMarkers);

  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const { size, view, setView, viewRef } = useViewport(wrapRef, level);
  const [overlay, setOverlay] = useOverlay();
  const [labelEdit, setLabelEdit] = useState<LabelEdit | null>(null);
  const [calib, setCalib] = useState<CalibState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  // Tools forget half-finished actions when the tool or floor changes.
  useEffect(() => {
    ALL_TOOLS.forEach((t) => t.reset?.());
    setOverlay({});
    setLabelEdit(null);
    setMenu(null);
  }, [tool, levelId, mode]);

  // Wall geometry depends only on the corners and walls, so moving furniture or editing a note keeps it.
  const derived = useMemo(() => {
    if (!level) return null;
    const joints = computeJoints(level);
    const rooms = detectRooms(level, joints);
    const dims = wallDimensions(level, joints, rooms);
    return { joints, rooms, dims };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level?.nodes, level?.walls, level?.id]);

  const openLabelEditor = useCallback((d: WallDimension) => {
    setLabelEdit({
      wallId: d.wallId,
      screen: dimLabelScreenPos(viewRef.current, d),
      angle: d.angleDeg,
      current: d.length,
      text: formatLength(d.length, useStore.getState().units),
    });
  }, []);

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
      openOpeningEditor: (openingId, label) =>
        setLabelEdit({
          opening: { id: openingId, field: label.field },
          wallId: '',
          screen: label.screen,
          angle: label.angleDeg,
          current: label.value,
          text: formatLength(label.value, useStore.getState().units),
        }),
    };
  }, [level, derived, view, openLabelEditor]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useCanvasApi({ wrapRef, stageRef, viewRef, ctxRef, derivedRef, setView, setLabelEdit, setCalib });
  const pointer = usePointerHandlers({ wrapRef, viewRef, ctxRef, ctx, mode, tool, labelEdit, calib, setView, setOverlay, setMenu });

  if (!level || !derived) return <div className="canvas-wrap" ref={wrapRef} />;

  const cursor = cursorFor(tool, overlay, itemGhost?.ok, ghost?.ok);
  const selectedOpeningId = selection?.kind === 'opening' ? selection.id : undefined;
  const openingLabelList = selectedOpeningId && !labelEdit ? openingLabels(level, derived.joints, derived.dims, view, selectedOpeningId) : [];

  // Distances to the nearest wall or piece, kept while the selected piece sits still in Furnish mode.
  const guideItem = mode === 'furnish' && tool === 'select' && !overlay.dragging && !labelEdit && selection?.kind === 'item' ? level.items.find((i) => i.id === selection.id) : undefined;
  const guideCat = guideItem ? findCatalogueItem(project, guideItem.catalogueId) : undefined;
  const restGuides: DistanceGuide[] =
    guideItem && guideCat && guideCat.mount === 'floor' ? guidesForItem(level, project, derived.joints, guideItem.id) : [];
  const shownGuides: GuideSet | undefined = overlay.guides && overlay.dragging ? overlay.guides : restGuides.length ? { distances: restGuides, aligns: [] } : undefined;

  return (
    <div
      className="canvas-wrap"
      ref={wrapRef}
      style={{ cursor }}
      data-testid="plan-canvas"
      onPointerDown={pointer.onPointerDown}
      onPointerMove={pointer.onPointerMove}
      onPointerUp={pointer.onPointerUp}
      onPointerCancel={pointer.onPointerUp}
      onPointerLeave={() => {
        setOverlay((o) => ({ ...o, hoverWall: undefined, hoverNode: undefined, hoverMarker: undefined, hoverOpening: undefined, hoverItem: undefined, hoverPin: undefined, hoverNote: undefined }));
        if (useStore.getState().tool === 'placeOpening') useStore.getState().setGhost(null);
        if (useStore.getState().tool === 'placeItem') useStore.getState().setItemGhost(null);
      }}
      onDoubleClick={pointer.onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        // On touch and pen the long press has already opened it (or will).
        if (pointer.lastPointerType.current !== 'mouse' || !ctx || labelEdit || calib) return;
        const r = wrapRef.current!.getBoundingClientRect();
        pointer.openMenu({ x: e.clientX - r.left, y: e.clientY - r.top } as Vec2, false);
      }}
    >
      {size.w > 0 && (
        <PlanStage
          stageRef={stageRef}
          size={size}
          view={view}
          level={level}
          project={project}
          derived={derived}
          overlay={overlay}
          selection={selection}
          selIds={selIds}
          mode={mode}
          units={units}
          showMarkers={showMarkers}
          showAllClearances={showAllClearances}
          ghost={ghost}
          itemGhost={itemGhost}
          highlight={highlight}
          editingWallId={labelEdit?.wallId}
          openingLabelList={openingLabelList}
          shownGuides={shownGuides}
        />
      )}

      {guideItem && guideCat && !guideItem.locked && restGuides.length > 0 &&
        restGuides.map((g) => (
          <GuideLabel key={g.side} g={g} view={view} itemId={guideItem.id} itemName={guideCat.name.toLowerCase()} />
        ))}

      {level.walls.length === 0 && !level.underlay && tool !== 'draw' && <EmptyPlan level={level} />}

      {labelEdit && <LabelEditor edit={labelEdit} setEdit={setLabelEdit} onCommit={() => commitLabelEdit(labelEdit, level, units, setLabelEdit)} />}

      {calib && <CalibrationDialog calib={calib} setCalib={setCalib} onCommit={() => commitCalibration(calib, level, units, setCalib)} />}

      <SelectionToolbar view={view} size={size} hidden={!!overlay.dragging || !!labelEdit || !!menu || !!calib || !!overlay.marquee} />

      {menu && <ContextMenu hit={menu.hit} at={menu.at} bounds={size} touch={menu.touch} onClose={closeMenu} />}

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
      <LayoutPill />
      <CompareView />
      <ToolHint drawing={!!overlay.draw} emptyFloor={level.walls.length === 0 && !level.underlay} />
    </div>
  );
}
