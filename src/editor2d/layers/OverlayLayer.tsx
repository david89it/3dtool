// Screen-space overlay: room names, dimensions, pins, handles, previews.
// Everything here stays the same size whatever the zoom.

import { Arrow, Circle, Group, Label, Line, Rect, Tag, Text } from 'react-konva';
import type { Level, PlanNote, Vec2 } from '../../model/types';
import type { DetectedRoom } from '../../geometry/rooms';
import type { WallDimension } from '../../geometry/dimensions';
import { dist } from '../../geometry/vec';
import { formatArea, formatLength, type UnitSystem } from '../../model/units';
import type { Selection } from '../../model/store';
import { dimLabelScreenPos } from '../hitTest';
import { toScreen, type View } from '../view';
import { COLORS, FONT } from '../theme';
import type { Overlay } from '../tools/types';
import type { OpeningLabel } from '../openingLabels';
import type { OpeningGhost } from '../../model/store';
import { STRUCTURAL_BADGE_TEXT } from '../../geometry/openings';
import { measureLabelPos, noteTag, NOTE_PLACEHOLDER, PIN_RADIUS, structuralPins } from '../pins';
import { noteColor, noteLength } from '../../model/notes';


interface Props {
  level: Level;
  view: View;
  rooms: DetectedRoom[];
  dims: WallDimension[];
  units: UnitSystem;
  selection: Selection;
  overlay: Overlay;
  showMarkers: boolean;
  editingWallId?: string;
  showDims: boolean;
  openingLabels: OpeningLabel[];
  ghost: OpeningGhost | null;
  /** Shortest wall (px) that still gets a length label. The print uses a smaller value. */
  minLabelPx?: number;
}

function DimLabel({ d, view, text, active, estimated }: { d: WallDimension; view: View; text: string; active: boolean; estimated: boolean }) {
  const p = dimLabelScreenPos(view, d);
  const w = text.length * 6.6 + 8;
  return (
    <Label x={p.x} y={p.y} rotation={d.angleDeg} offsetX={w / 2} offsetY={10.5} listening={false}>
      <Tag
        fill={active ? COLORS.accent : '#ffffff'}
        opacity={active ? 1 : 0.92}
        cornerRadius={4}
        stroke={estimated ? COLORS.amber : '#d4d4d8'}
        strokeWidth={1}
        dash={estimated ? [3, 2] : undefined}
        pointerDirection="none"
      />
      <Text
        text={text}
        fontSize={12}
        fontFamily={FONT}
        padding={4}
        fill={active ? '#ffffff' : COLORS.label}
      />
    </Label>
  );
}

export function OverlayLayer(props: Props) {
  const { level, view, rooms, dims, units, selection, overlay, showMarkers } = props;
  const selectedWall = selection?.kind === 'wall' ? level.walls.find((w) => w.id === selection.id) : undefined;
  const handleIds = new Set<string>();
  if (selectedWall) {
    handleIds.add(selectedWall.a);
    handleIds.add(selectedWall.b);
  }
  if (overlay.hoverNode) handleIds.add(overlay.hoverNode);

  // Keep labels readable: hide dimensions on very short walls at low zoom.
  const minLabelPx = props.minLabelPx ?? 46;

  return (
    <Group listening={false}>
      {rooms
        .filter((r) => !r.solid)
        .map((r) => {
          const stored = level.rooms.find((x) => x.boundary.join('|') === r.nodeIds.join('|'));
          const p = toScreen(view, r.label);
          const estimated = r.edges.some((e) => level.walls.find((w) => w.id === e.wallId)?.estimated);
          const name = stored?.name ?? 'Room';
          const area = `${estimated ? '≈ ' : ''}${formatArea(r.area, units)}`;
          const small = r.area * view.scale * view.scale < 9000;
          return (
            <Group key={r.key} x={p.x} y={p.y}>
              <Text
                text={name}
                fontSize={small ? 11 : 14}
                fontStyle="600"
                fontFamily={FONT}
                fill={COLORS.label}
                width={200}
                offsetX={100}
                offsetY={small ? 8 : 16}
                align="center"
              />
              {!small && (
                <Text text={area} fontSize={12} fontFamily={FONT} fill={COLORS.labelMuted} width={200} offsetX={100} offsetY={-2} align="center" />
              )}
            </Group>
          );
        })}

      {props.showDims &&
        dims.map((d) => {
          if (d.wallId === props.editingWallId) return null;
          const w = level.walls.find((x) => x.id === d.wallId);
          if (!w) return null;
          const active = selectedWall?.id === d.wallId;
          if (!active && d.length * view.scale < minLabelPx) return null;
          const text = `${w.estimated ? '≈ ' : ''}${formatLength(d.length, units)}`;
          return <DimLabel key={d.wallId} d={d} view={view} text={text} active={active} estimated={!!w.estimated} />;
        })}

      {[...handleIds].map((id) => {
        const n = level.nodes.find((x) => x.id === id);
        if (!n) return null;
        const p = toScreen(view, n.pos);
        const hot = overlay.hoverNode === id;
        return (
          <Group key={id} x={p.x} y={p.y}>
            <Circle radius={hot ? 9 : 7} fill="#ffffff" stroke={COLORS.accent} strokeWidth={2.5} />
          </Group>
        );
      })}

      {showMarkers &&
        (level.markers ?? []).map((m) => {
          const p = toScreen(view, m.pos);
          const sel = selection?.kind === 'marker' && selection.id === m.id;
          const hot = overlay.hoverMarker === m.id;
          return (
            <Group key={m.id} x={p.x} y={p.y}>
              <Circle radius={11} fill={sel ? COLORS.amber : COLORS.amberBg} stroke={COLORS.amber} strokeWidth={2} />
              <Text text="?" fontSize={13} fontStyle="700" fontFamily={FONT} fill={sel ? '#fff' : COLORS.amber} width={22} offsetX={11} offsetY={7} align="center" />
              {(sel || hot) && (
                <Label x={16} y={-12}>
                  <Tag fill="#1f2328" cornerRadius={6} opacity={0.94} />
                  <Text text={m.text} fontSize={12} fontFamily={FONT} fill="#fff" padding={7} width={Math.min(260, m.text.length * 6.6 + 16)} wrap="word" />
                </Label>
              )}
            </Group>
          );
        })}

      {(level.notes ?? []).map((n) => (
        <NoteShape
          key={n.id}
          note={n}
          view={view}
          units={units}
          selected={selection?.kind === 'note' && selection.id === n.id}
          hot={overlay.hoverNote === n.id}
        />
      ))}
      {overlay.notePreview && (
        <NoteShape
          note={{ id: 'preview', kind: overlay.notePreview.kind, pos: overlay.notePreview.from, to: overlay.notePreview.to }}
          view={view}
          units={units}
          selected={false}
          hot={false}
          ghost
        />
      )}

      {structuralPins(level, dims, view).map((pin) => {
        const sel = selection?.kind === 'wall' && selection.id === pin.wallId;
        return (
          <Group key={`pin-${pin.wallId}`} x={pin.screen.x} y={pin.screen.y}>
            <Circle radius={PIN_RADIUS} fill={sel ? COLORS.amber : COLORS.amberBg} stroke={COLORS.amber} strokeWidth={2} />
            <Text text="⚠" fontSize={16} fontStyle="700" fontFamily={FONT} fill={sel ? '#ffffff' : '#8a4b00'} width={28} offsetX={14} offsetY={8.5} align="center" />
          </Group>
        );
      })}
      {overlay.hoverPin &&
        structuralPins(level, dims, view)
          .filter((pin) => pin.wallId === overlay.hoverPin)
          .map((pin) => (
            <Label key="pin-tip" x={pin.screen.x + PIN_RADIUS + 6} y={pin.screen.y - PIN_RADIUS}>
              <Tag fill="#1f2328" cornerRadius={6} opacity={0.95} />
              <Text text={`⚠ ${STRUCTURAL_BADGE_TEXT}`} fontSize={12} fontFamily={FONT} fill="#ffffff" padding={8} width={260} wrap="word" lineHeight={1.35} />
            </Label>
          ))}

      {props.openingLabels.map((l) => {
        const text = formatLength(l.value, units);
        const w = text.length * 6.6 + 8;
        const isWidth = l.field === 'width';
        return (
          <Label key={l.field} x={l.screen.x} y={l.screen.y} rotation={l.angleDeg} offsetX={w / 2} offsetY={10.5}>
            <Tag fill={isWidth ? COLORS.accent : '#ffffff'} stroke={COLORS.accent} strokeWidth={1} cornerRadius={4} />
            <Text text={text} fontSize={12} fontFamily={FONT} padding={4} fill={isWidth ? '#ffffff' : COLORS.accent} />
          </Label>
        );
      })}

      {props.ghost && !props.ghost.ok && (
        <Label x={toScreen(view, props.ghost.at).x + 14} y={toScreen(view, props.ghost.at).y + 14}>
          <Tag fill="#1f2328" cornerRadius={5} opacity={0.9} />
          <Text text={props.ghost.reason} fontSize={12} fontFamily={FONT} fill="#fff" padding={7} lineHeight={1.35} {...(props.ghost.reason.length > 40 ? { width: 280, wrap: 'word' } : {})} />
        </Label>
      )}

      {overlay.draw && <DrawPreview from={overlay.draw.from} to={overlay.draw.to} view={view} units={units} />}
      {overlay.snap && overlay.snap.kind !== 'none' && overlay.snap.kind !== 'grid' && overlay.snap.kind !== 'angle' && (
        <SnapMark p={toScreen(view, overlay.snap.point)} kind={overlay.snap.kind} />
      )}
      {overlay.calib && <CalibPreview view={view} p1={overlay.calib.p1} cursor={overlay.calib.cursor} />}
    </Group>
  );
}

function DrawPreview({ from, to, view, units }: { from: Vec2; to: Vec2; view: View; units: UnitSystem }) {
  const a = toScreen(view, from);
  const b = toScreen(view, to);
  const L = dist(from, to);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return (
    <Group>
      <Line points={[a.x, a.y, b.x, b.y]} stroke={COLORS.accent} strokeWidth={3} dash={[8, 6]} lineCap="round" />
      <Circle x={a.x} y={a.y} radius={5} fill={COLORS.accent} />
      <Circle x={b.x} y={b.y} radius={5} fill="#fff" stroke={COLORS.accent} strokeWidth={2} />
      {L > 1 && (
        <Label x={mid.x + 10} y={mid.y - 26}>
          <Tag fill={COLORS.accent} cornerRadius={4} />
          <Text text={formatLength(L, units)} fontSize={12} fontFamily={FONT} fill="#fff" padding={5} />
        </Label>
      )}
    </Group>
  );
}

function SnapMark({ p, kind }: { p: Vec2; kind: string }) {
  if (kind === 'midpoint') {
    return <Rect x={p.x - 6} y={p.y - 6} width={12} height={12} stroke={COLORS.snap} strokeWidth={2} rotation={45} offsetX={-6} offsetY={-6} />;
  }
  if (kind === 'wall') {
    return <Line points={[p.x - 7, p.y + 6, p.x, p.y - 7, p.x + 7, p.y + 6]} closed stroke={COLORS.snap} strokeWidth={2} />;
  }
  return <Circle x={p.x} y={p.y} radius={8} stroke={COLORS.snap} strokeWidth={2} />;
}

function CalibPreview({ view, p1, cursor }: { view: View; p1?: Vec2; cursor?: Vec2 }) {
  const a = p1 ? toScreen(view, p1) : undefined;
  const c = cursor ? toScreen(view, cursor) : undefined;
  return (
    <Group>
      {a && c && <Line points={[a.x, a.y, c.x, c.y]} stroke={COLORS.snap} strokeWidth={2} dash={[6, 4]} />}
      {a && <Cross p={a} />}
      {c && <Cross p={c} />}
    </Group>
  );
}

function Cross({ p }: { p: Vec2 }) {
  return (
    <Group x={p.x} y={p.y}>
      <Line points={[-10, 0, 10, 0]} stroke={COLORS.snap} strokeWidth={2} />
      <Line points={[0, -10, 0, 10]} stroke={COLORS.snap} strokeWidth={2} />
      <Circle radius={4} stroke={COLORS.snap} strokeWidth={1.5} />
    </Group>
  );
}

/** A note on the plan, at a constant screen size. `ghost` is the preview while placing. */
function NoteShape({
  note,
  view,
  units,
  selected,
  hot,
  ghost,
}: {
  note: PlanNote;
  view: View;
  units: UnitSystem;
  selected: boolean;
  hot: boolean;
  ghost?: boolean;
}) {
  const color = noteColor(note);
  const a = toScreen(view, note.pos);
  if (note.kind === 'note') {
    const t = noteTag(note, view);
    const empty = !note.text;
    return (
      <Group>
        {selected && <Circle x={a.x} y={a.y} radius={11} stroke={COLORS.accent} strokeWidth={2.5} />}
        <Circle x={a.x} y={a.y} radius={5.5} fill={color} stroke="#ffffff" strokeWidth={1.5} />
        <Label x={t.x} y={t.y}>
          <Tag
            fill="#fffbe6"
            stroke={selected ? COLORS.accent : color}
            strokeWidth={selected || hot ? 2.5 : 1.5}
            cornerRadius={6}
            shadowColor="#000000"
            shadowBlur={4}
            shadowOpacity={0.15}
            shadowOffsetY={1}
          />
          <Text
            text={note.text || NOTE_PLACEHOLDER}
            fontSize={12}
            fontFamily={FONT}
            fill={empty ? COLORS.labelMuted : COLORS.label}
            fontStyle={empty ? 'italic' : 'normal'}
            padding={7}
            width={t.w}
            wrap="word"
            lineHeight={1.25}
          />
        </Label>
      </Group>
    );
  }
  const b = toScreen(view, note.to ?? note.pos);
  const len = noteLength(note);
  if (note.kind === 'arrow') {
    return (
      <Group opacity={ghost ? 0.8 : 1}>
        {selected && <Line points={[a.x, a.y, b.x, b.y]} stroke={COLORS.accent} strokeWidth={7} opacity={0.25} lineCap="round" />}
        <Arrow points={[a.x, a.y, b.x, b.y]} stroke={color} fill={color} strokeWidth={hot || selected ? 3.5 : 2.5} pointerLength={12} pointerWidth={11} lineCap="round" />
        <Circle x={a.x} y={a.y} radius={4} fill={color} />
        {note.text && (
          <Label x={a.x + 8} y={a.y - 28}>
            <Tag fill="#ffffff" stroke={color} strokeWidth={1.5} cornerRadius={5} />
            <Text text={note.text} fontSize={12} fontFamily={FONT} fill={COLORS.label} padding={6} width={Math.min(190, note.text.length * 6.6 + 14)} wrap="word" />
          </Label>
        )}
        {selected && <EndHandle p={a} />}
        {selected && <EndHandle p={b} />}
      </Group>
    );
  }
  // Measure: a dimension line with end ticks and its live length.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const text = `${formatLength(len, units)}${note.text ? ` · ${note.text}` : ''}`;
  const lab = measureLabelPos(note, view);
  const w = text.length * 6.6 + 10;
  return (
    <Group opacity={ghost ? 0.85 : 1}>
      {selected && <Line points={[a.x, a.y, b.x, b.y]} stroke={COLORS.accent} strokeWidth={7} opacity={0.25} lineCap="round" />}
      <Line points={[a.x, a.y, b.x, b.y]} stroke={color} strokeWidth={hot || selected ? 2.5 : 1.75} />
      <Line points={[a.x - nx * 7, a.y - ny * 7, a.x + nx * 7, a.y + ny * 7]} stroke={color} strokeWidth={2} />
      <Line points={[b.x - nx * 7, b.y - ny * 7, b.x + nx * 7, b.y + ny * 7]} stroke={color} strokeWidth={2} />
      <Label x={lab.screen.x} y={lab.screen.y} rotation={lab.angleDeg} offsetX={w / 2} offsetY={10.5}>
        <Tag fill="#ffffff" opacity={0.95} stroke={color} strokeWidth={1} cornerRadius={4} />
        <Text text={text} fontSize={12} fontStyle="600" fontFamily={FONT} padding={4} fill={color} />
      </Label>
      {selected && <EndHandle p={a} />}
      {selected && <EndHandle p={b} />}
    </Group>
  );
}

function EndHandle({ p }: { p: Vec2 }) {
  return <Circle x={p.x} y={p.y} radius={7} fill="#ffffff" stroke={COLORS.accent} strokeWidth={2.5} />;
}
