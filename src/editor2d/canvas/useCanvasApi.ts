// Publishes the canvas's public functions on canvasApi (used by the rest of the UI and by tests).
import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { currentTool } from './tools';
import type Konva from 'konva';
import type { Level } from '../../model/types';
import { useStore } from '../../model/store';
import { fitView, MAX_SCALE, MIN_SCALE, toScreen, toWorld, zoomAt, type View } from '../view';
import { dimLabelScreenPos } from '../hitTest';
import { structuralPins } from '../pins';
import { ROOF_HATCH, ROOF_LINE } from '../layers/RoofLayer';
import { finishTrace } from '../tools/traceTool';
import { computeGhost, placeFromGhost } from '../tools/openingTools';
import { renderLevelImage } from '../renderLevel';
import { computeItemGhost, placeItemFromGhost } from '../tools/itemTools';
import type { ToolCtx } from '../tools/types';
import { openingLabels } from '../openingLabels';
import { canvasApi } from '../canvasApi';
import type { CalibState, LabelEdit } from './types';

interface Deps {
  wrapRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<Konva.Stage | null>;
  viewRef: MutableRefObject<View>;
  ctxRef: MutableRefObject<ToolCtx | null>;
  derivedRef: MutableRefObject<ToolCtx['derived'] | null>;
  setView: Dispatch<SetStateAction<View>>;
  setLabelEdit: Dispatch<SetStateAction<LabelEdit | null>>;
  setCalib: Dispatch<SetStateAction<CalibState | null>>;
}

export function useCanvasApi({ wrapRef, stageRef, viewRef, ctxRef, derivedRef, setView, setLabelEdit, setCalib }: Deps) {
  useEffect(() => {
    canvasApi.escape = () => {
      const c = ctxRef.current;
      if (c) currentTool().escape?.(c);
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
    canvasApi.fitPoints = (pts, padMm) => {
      const el = wrapRef.current;
      if (!el || pts.length === 0) return;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const pad = padMm ?? 1200; // mm of context around the problem
      const min = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad };
      const max = { x: Math.max(...xs) + pad, y: Math.max(...ys) + pad };
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(el.clientWidth / (max.x - min.x), el.clientHeight / (max.y - min.y))));
      setView({
        scale,
        x: el.clientWidth / 2 - ((min.x + max.x) / 2) * scale,
        y: el.clientHeight / 2 - ((min.y + max.y) / 2) * scale,
      });
    };
    canvasApi.zoom = (factor) => {
      const el = wrapRef.current;
      if (!el) return;
      setView((v) => zoomAt(v, { x: el.clientWidth / 2, y: el.clientHeight / 2 }, factor));
    };
    canvasApi.renderLevelImage = renderLevelImage;
    canvasApi.roofMarks = () => ({
      lines: stageRef.current?.find(`.${ROOF_LINE}`).length ?? 0,
      hatches: stageRef.current?.find(`.${ROOF_HATCH}`).length ?? 0,
    });
    canvasApi.exportPng = () => stageRef.current?.toDataURL({ pixelRatio: 2 }) ?? null;
    canvasApi.worldToScreen = (p) => {
      const r = wrapRef.current?.getBoundingClientRect();
      const s = toScreen(viewRef.current, p);
      return { x: s.x + (r?.left ?? 0), y: s.y + (r?.top ?? 0) };
    };
    canvasApi.getView = () => viewRef.current;
    canvasApi.clientToWorld = (client) => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return null;
      if (client.x < r.left || client.x > r.right || client.y < r.top || client.y > r.bottom) return null;
      return toWorld(viewRef.current, { x: client.x - r.left, y: client.y - r.top });
    };
    canvasApi.ghostAt = (client) => {
      const w = canvasApi.clientToWorld(client);
      const s = useStore.getState();
      const L = s.project.levels.find((l) => l.id === s.levelId);
      s.setGhost(w && L ? computeGhost(L as Level, w, viewRef.current.scale) : null);
    };
    canvasApi.dropGhost = () => placeFromGhost();
    canvasApi.itemGhostAt = (client, catalogueId, alt) => {
      const w = canvasApi.clientToWorld(client);
      const s = useStore.getState();
      const L = s.project.levels.find((l) => l.id === s.levelId);
      s.setItemGhost(w && L ? computeItemGhost(L as Level, catalogueId, w, viewRef.current.scale, !!alt) : null);
    };
    canvasApi.dropItemGhost = () => placeItemFromGhost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    canvasApi.dimLabelPos = (wallId) => {
      const d = derivedRef.current?.dims.find((x) => x.wallId === wallId);
      if (!d) return null;
      const r = wrapRef.current?.getBoundingClientRect();
      const s = dimLabelScreenPos(viewRef.current, d);
      return { x: s.x + (r?.left ?? 0), y: s.y + (r?.top ?? 0) };
    };
    canvasApi.structuralPinPos = (wallId) => {
      const dr = derivedRef.current;
      const L = useStore.getState().project.levels.find((l) => l.id === useStore.getState().levelId);
      if (!dr || !L) return null;
      const pin = structuralPins(L, dr.dims, viewRef.current).find((x) => x.wallId === wallId);
      const r = wrapRef.current?.getBoundingClientRect();
      return pin ? { x: pin.screen.x + (r?.left ?? 0), y: pin.screen.y + (r?.top ?? 0) } : null;
    };
    canvasApi.openingLabelPos = (openingId, field) => {
      const dr = derivedRef.current;
      const L = useStore.getState().project.levels.find((l) => l.id === useStore.getState().levelId);
      if (!dr || !L) return null;
      const lab = openingLabels(L, dr.joints, dr.dims, viewRef.current, openingId).find((x) => x.field === field);
      const r = wrapRef.current?.getBoundingClientRect();
      return lab ? { x: lab.screen.x + (r?.left ?? 0), y: lab.screen.y + (r?.top ?? 0) } : null;
    };
  }, []);
}
