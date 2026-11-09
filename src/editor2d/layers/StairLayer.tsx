import { Arrow, Group, Line, Rect, Text } from 'react-konva';
import type { Project, Stair } from '../../model/types';
import { COLORS, FONT } from '../theme';

export function StairShapes({ stairs, project }: { stairs: Stair[]; project: Project }) {
  return (
    <>
      {stairs.map((s) => {
        const treads: number[] = [];
        const going = 250;
        for (let x = -s.length / 2 + going; x < s.length / 2; x += going) treads.push(x);
        const to = project.levels.find((l) => l.id === s.toLevelId)?.name ?? '';
        return (
          <Group key={s.id} x={s.pos.x} y={s.pos.y} rotation={s.rotationDeg} listening={false}>
            <Rect x={-s.length / 2} y={-s.width / 2} width={s.length} height={s.width} fill="#ffffff" opacity={0.7} stroke={COLORS.stair} strokeWidth={1} strokeScaleEnabled={false} />
            {treads.map((x) => (
              <Line key={x} points={[x, -s.width / 2, x, s.width / 2]} stroke={COLORS.stair} strokeWidth={1} strokeScaleEnabled={false} />
            ))}
            <Arrow
              points={[-s.length / 2 + 80, 0, s.length / 2 - 80, 0]}
              stroke={COLORS.labelMuted}
              fill={COLORS.labelMuted}
              strokeWidth={1.5}
              strokeScaleEnabled={false}
              pointerLength={120}
              pointerWidth={120}
            />
            <Text
              text={`${s.direction === 'up' ? 'Up' : 'Down'} to ${to.toLowerCase()}`}
              x={-s.length / 2 + 60}
              y={-s.width / 2 + 40}
              fontSize={90}
              fontFamily={FONT}
              fill={COLORS.labelMuted}
            />
          </Group>
        );
      })}
    </>
  );
}
