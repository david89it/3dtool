// The Konva stage: world layer (underlay, rooms, items, walls...) and screen-space overlay layer.
import type { RefObject } from 'react';
import { Group, Layer, Rect, Stage } from 'react-konva';
import type Konva from 'konva';
import type { Level, Project } from '../../model/types';
import type { Selection, OpeningGhost, ItemGhost, Highlight } from '../../model/store';
import type { UnitSystem } from '../../model/units';
import type { Overlay, ToolCtx } from '../tools/types';
import type { View } from '../view';
import type { OpeningLabel } from '../openingLabels';
import type { GuideSet } from '../guides';
import { COLORS } from '../theme';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { UnderlayImage, VectorUnderlayShape } from '../layers/UnderlayLayer';
import { RoomFills } from '../layers/RoomLayer';
import { RoofShapes } from '../layers/RoofLayer';
import { WallShapes } from '../layers/WallLayer';
import { StairShapes } from '../layers/StairLayer';
import { OverlayLayer } from '../layers/OverlayLayer';
import { ItemOverlay, ItemShapes } from '../layers/ItemLayer';
import { HighlightShapes } from '../layers/HighlightLayer';
import { GuideShapes } from '../layers/GuideLayer';

interface Props {
  stageRef: RefObject<Konva.Stage | null>;
  size: { w: number; h: number };
  view: View;
  level: Level;
  project: Project;
  derived: ToolCtx['derived'];
  overlay: Overlay;
  selection: Selection;
  selIds: string[];
  mode: string;
  units: UnitSystem;
  showMarkers: boolean;
  showAllClearances: boolean;
  ghost: OpeningGhost | null;
  itemGhost: ItemGhost | null;
  highlight: Highlight | null;
  editingWallId?: string;
  openingLabelList: OpeningLabel[];
  shownGuides?: GuideSet;
}

export function PlanStage(p: Props) {
  const { level, project, derived, view, overlay, selection, selIds, mode, ghost, itemGhost } = p;
  const selectedOpeningId = selection?.kind === 'opening' ? selection.id : undefined;
  const selectedWallId = selection?.kind === 'wall' ? selection.id : undefined;
  const selectedRoomId = selection?.kind === 'room' ? selection.id : undefined;
  return (
    <Stage width={p.size.w} height={p.size.h} ref={p.stageRef} listening={false}>
      <Layer listening={false}>
        <ErrorBoundary scope="canvas">
          <Rect x={0} y={0} width={p.size.w} height={p.size.h} fill={COLORS.paper} />
          <Group x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}>
            {level.underlay && <UnderlayImage underlay={level.underlay} />}
            {level.vectorUnderlay && <VectorUnderlayShape underlay={level.vectorUnderlay} />}
            <RoomFills level={level} rooms={derived.rooms} selectedRoomId={selectedRoomId} translucent={!!level.underlay} />
            <RoofShapes level={level} rooms={derived.rooms} scale={view.scale} />
            <ItemShapes
              level={level}
              project={project}
              selectedIds={selIds}
              hoverId={mode === 'furnish' ? overlay.hoverItem : undefined}
              showClearances={mode === 'furnish'}
              showAllClearances={p.showAllClearances}
              ghost={itemGhost}
            />
            <WallShapes
              level={level}
              joints={derived.joints}
              selectedWallId={selectedWallId}
              hoverWallId={overlay.hoverWall}
              selectedOpeningId={selectedOpeningId}
              hoverOpeningId={overlay.hoverOpening}
              ghost={ghost}
            />
            <StairShapes stairs={level.stairs} project={project} />
            <HighlightShapes level={level} project={project} joints={derived.joints} highlight={p.highlight} />
          </Group>
        </ErrorBoundary>
      </Layer>
      <Layer listening={false}>
        <ErrorBoundary scope="canvas">
          <OverlayLayer
            level={level}
            view={view}
            rooms={derived.rooms}
            dims={derived.dims}
            units={p.units}
            selection={selection}
            overlay={overlay}
            showMarkers={p.showMarkers}
            editingWallId={p.editingWallId}
            showDims={mode !== 'openings' || !selectedOpeningId}
            openingLabels={p.openingLabelList}
            ghost={ghost}
          />
          <ItemOverlay
            level={level}
            project={project}
            view={view}
            selectedIds={selIds}
            hoverId={mode === 'furnish' ? overlay.hoverItem : undefined}
            ghost={itemGhost}
            marquee={overlay.marquee}
          />
          {p.shownGuides && <GuideShapes guides={p.shownGuides} view={view} units={p.units} labels={!!overlay.dragging} />}
        </ErrorBoundary>
      </Layer>
    </Stage>
  );
}
