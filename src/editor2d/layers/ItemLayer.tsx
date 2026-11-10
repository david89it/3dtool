import { Circle, Group, Label, Line, Tag, Text } from 'react-konva';
import type { CatalogueItem, Level, PlacedItem, Project, Vec2 } from '../../model/types';
import type { ItemGhost } from '../../model/store';
import { findCatalogueItem, footprint, itemParts, localToPlan, newPlacedItem } from '../../catalogue/catalogue';
import { partColor } from '../../catalogue/colors';
import { clearanceShapes } from '../clearanceShapes';
import { itemHandles } from '../itemHit';
import { toScreen, type View } from '../view';
import { COLORS, FONT } from '../theme';

const flat = (pts: Vec2[]) => pts.flatMap((p) => [p.x, p.y]);

function circlePoly(item: PlacedItem, cat: CatalogueItem, cx: number, cz: number, rx: number, rz: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    pts.push(localToPlan(item, cat, cx + Math.cos(a) * rx, cz + Math.sin(a) * rz));
  }
  return pts;
}

/** Top-down drawing of one item from its parts, lowest parts first. */
export function ItemShape({ item, cat, opacity = 1, highlight }: { item: PlacedItem; cat: CatalogueItem; opacity?: number; highlight?: 'selected' | 'hover' }) {
  const parts = [...itemParts(item, cat)].sort((a, b) => a.pos[1] + a.size[1] / 2 - (b.pos[1] + b.size[1] / 2));
  return (
    <Group opacity={opacity} listening={false}>
      {parts.map((p, i) => {
        const [x, , z] = p.pos;
        const [sx, , sz] = p.size;
        const poly =
          p.shape === 'cylinder'
            ? circlePoly(item, cat, x, z, sx / 2, sz / 2)
            : [
                localToPlan(item, cat, x - sx / 2, z - sz / 2),
                localToPlan(item, cat, x + sx / 2, z - sz / 2),
                localToPlan(item, cat, x + sx / 2, z + sz / 2),
                localToPlan(item, cat, x - sx / 2, z + sz / 2),
              ];
        return (
          <Line
            key={i}
            points={flat(poly)}
            closed
            fill={partColor(p.colorToken, item.finish)}
            stroke="#5f646b"
            strokeWidth={0.6}
            strokeScaleEnabled={false}
          />
        );
      })}
      <Line
        points={flat(footprint(item, cat))}
        closed
        stroke={highlight ? COLORS.accent : '#3d4148'}
        strokeWidth={highlight === 'selected' ? 2.5 : highlight === 'hover' ? 2 : 1}
        dash={highlight === 'hover' ? [5, 4] : undefined}
        strokeScaleEnabled={false}
      />
    </Group>
  );
}

function Clearances({ item, cat }: { item: PlacedItem; cat: CatalogueItem }) {
  return (
    <Group listening={false}>
      {clearanceShapes(item, cat).map((s, i) => {
        if (s.kind === 'area') {
          return (
            <Line
              key={i}
              points={flat(s.poly)}
              closed
              fill={s.strength === 'min' ? 'rgba(234,88,12,0.22)' : 'rgba(234,88,12,0.10)'}
              stroke={s.strength === 'min' ? 'rgba(234,88,12,0.55)' : undefined}
              strokeWidth={1}
              dash={[4, 4]}
              strokeScaleEnabled={false}
            />
          );
        }
        if (s.kind === 'swing') {
          return <Line key={i} points={flat(s.poly)} closed fill="rgba(37,99,235,0.10)" stroke="rgba(37,99,235,0.6)" strokeWidth={1} dash={[5, 4]} strokeScaleEnabled={false} />;
        }
        return <Line key={i} points={flat(s.poly)} closed fill="rgba(124,58,237,0.08)" stroke="rgba(124,58,237,0.75)" strokeWidth={1.5} dash={[7, 5]} strokeScaleEnabled={false} />;
      })}
    </Group>
  );
}

export function ItemShapes({
  level,
  project,
  selectedId,
  hoverId,
  showClearances,
  showAllClearances,
  ghost,
}: {
  level: Level;
  project: Project;
  selectedId?: string;
  hoverId?: string;
  showClearances: boolean;
  showAllClearances: boolean;
  ghost: ItemGhost | null;
}) {
  const withCat = level.items
    .map((item) => ({ item, cat: findCatalogueItem(project, item.catalogueId) }))
    .filter((x): x is { item: PlacedItem; cat: CatalogueItem } => !!x.cat);
  // Flat things (rugs) underneath, then by height.
  withCat.sort((a, b) => a.item.dims.h - b.item.dims.h);
  const ghostCat = ghost ? findCatalogueItem(project, ghost.catalogueId) : undefined;
  const ghostItem =
    ghost && ghostCat
      ? {
          ...newPlacedItem(ghostCat, ghost.pos, ghost.rotationDeg),
          ...(ghost.dims ? { dims: ghost.dims } : {}),
          ...(ghost.params ? { params: ghost.params } : {}),
        }
      : undefined;
  return (
    <>
      {showClearances &&
        withCat
          .filter(({ item }) => showAllClearances || item.id === selectedId)
          .map(({ item, cat }) => <Clearances key={`c-${item.id}`} item={item} cat={cat} />)}
      {withCat.map(({ item, cat }) => (
        <ItemShape key={item.id} item={item} cat={cat} highlight={item.id === selectedId ? 'selected' : item.id === hoverId ? 'hover' : undefined} />
      ))}
      {ghost && ghostCat && ghostItem && (
        <>
          <Clearances item={ghostItem} cat={ghostCat} />
          <ItemShape item={ghostItem} cat={ghostCat} opacity={ghost.ok ? 0.75 : 0.35} highlight="selected" />
        </>
      )}
    </>
  );
}

/** Screen-space: name tag and handles of the selected / hovered item. */
export function ItemOverlay({
  level,
  project,
  view,
  selectedId,
  hoverId,
  ghost,
}: {
  level: Level;
  project: Project;
  view: View;
  selectedId?: string;
  hoverId?: string;
  ghost: ItemGhost | null;
}) {
  const sel = level.items.find((i) => i.id === selectedId);
  const hov = level.items.find((i) => i.id === hoverId && i.id !== selectedId);
  const tag = (item: PlacedItem, key: string) => {
    const cat = findCatalogueItem(project, item.catalogueId);
    if (!cat) return null;
    const fp = footprint(item, cat).map((p) => toScreen(view, p));
    const top = fp.reduce((a, b) => (b.y < a.y ? b : a));
    const name = `${cat.name}${item.locked ? ' (locked)' : ''}`;
    const w = name.length * 6.6 + 12;
    return (
      <Label key={key} x={top.x} y={top.y - 10} offsetX={w / 2} offsetY={22}>
        <Tag fill="#1f2328" opacity={0.85} cornerRadius={5} />
        <Text text={name} fontSize={12} fontFamily={FONT} fill="#fff" padding={5} />
      </Label>
    );
  };
  return (
    <Group listening={false}>
      {hov && tag(hov, 'hov')}
      {sel && tag(sel, 'sel')}
      {sel &&
        itemHandles(sel, project, view).map((h, i) =>
          h.kind === 'rotate' ? (
            <Group key={i} x={h.screen.x} y={h.screen.y}>
              <Circle radius={10} fill="#fff" stroke={COLORS.accent} strokeWidth={2.5} />
              <Text text="↻" fontSize={13} fontFamily={FONT} fill={COLORS.accent} width={20} offsetX={10} offsetY={7} align="center" />
            </Group>
          ) : (
            <Circle key={i} x={h.screen.x} y={h.screen.y} radius={7} fill="#fff" stroke={COLORS.accent} strokeWidth={2.5} />
          ),
        )}
      {ghost && !ghost.ok && ghost.reason && (
        <Label x={toScreen(view, ghost.pos).x + 14} y={toScreen(view, ghost.pos).y + 14}>
          <Tag fill="#1f2328" cornerRadius={5} opacity={0.9} />
          <Text text={ghost.reason} fontSize={12} fontFamily={FONT} fill="#fff" padding={6} />
        </Label>
      )}
    </Group>
  );
}
