import { useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Level, Project } from '../model/types';
import { buildLevel } from './sceneBuild';

interface Props {
  level: Level;
  project: Project;
  lightsOn: boolean;
  /** Overview cut-away: walls stop at this height (mm). */
  cutHeight?: number;
  onPickRoom?: (levelId: string, roomId: string) => void;
}

/** One floor of the flat. Geometry is rebuilt only when this level (or a stair target height) changes. */
export function LevelMesh({ level, project, lightsOn, cutHeight, onPickRoom }: Props) {
  const elevations = project.levels.map((l) => `${l.id}:${l.elevation}`).join('|');
  const overrides = project.catalogueOverrides;
  const scene = useMemo(
    () => buildLevel(level, { ...project, catalogueOverrides: overrides }, { cutHeight }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level, overrides, elevations, cutHeight],
  );
  useEffect(() => () => scene.dispose(), [scene]);

  const onClick = (roomId?: string) =>
    roomId && onPickRoom
      ? (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 4) return; // that was an orbit drag
          e.stopPropagation();
          onPickRoom(level.id, roomId);
        }
      : undefined;

  return (
    <group name={`level-${level.id}`}>
      {scene.meshes.map((m) => (
        <mesh
          key={m.key}
          geometry={m.geometry}
          material={m.material}
          castShadow={m.castShadow}
          receiveShadow={m.receiveShadow}
          onClick={onClick(m.roomId)}
          dispose={null}
        />
      ))}
      {lightsOn &&
        scene.lights.map((p, i) => <pointLight key={i} position={p} intensity={6} distance={7} decay={2} color="#ffe8c8" />)}
    </group>
  );
}
