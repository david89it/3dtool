// First-person walking: keys or a touch joystick move you at walking pace,
// the mouse (pointer lock) or a finger drag looks around. Walls and
// furniture stop you; stairs carry you between floors.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import type { Level, Project, Vec2 } from '../model/types';
import { add, mul } from '../geometry/vec';
import { EYE_HEIGHT, floorHeightAt, levelObstacles, levelUnderFeet, resolveCollision, stairRamps, WALK_SPEED, type Obstacles } from './walkPhysics';
import { biggestRoom, MM } from './sceneBuild';

const scratch = new THREE.Vector3();

/** Shared with the touch joystick overlay. */
export const touchInput = {
  move: { x: 0, y: 0 }, // x = right, y = forward, each -1..1
  look: { dx: 0, dy: 0 }, // accumulated finger drag in pixels
};

export const walkState = {
  pos: { x: 0, y: 0 } as Vec2,
  feet: 0,
  levelId: '',
};

const KEYS: Record<string, [number, number]> = {
  KeyW: [1, 0],
  ArrowUp: [1, 0],
  KeyS: [-1, 0],
  ArrowDown: [-1, 0],
  KeyA: [0, -1],
  ArrowLeft: [0, -1],
  KeyD: [0, 1],
  ArrowRight: [0, 1],
};

interface Props {
  levels: Level[];
  project: Project;
  startLevel: Level;
  touch: boolean;
  onLevelChange: (levelId: string) => void;
  /** Stand here, facing there (plan mm), instead of in the biggest room. A new `n` moves the walker again. */
  spawn?: { stand: Vec2; face: Vec2; n: number } | null;
}

export function WalkRig({ levels, project, startLevel, touch, onLevelChange, spawn }: Props) {
  const camera = useThree((s) => s.camera);
  const keys = useRef(new Set<string>());
  const look = useRef({ yaw: 0, pitch: 0 });

  const ramps = useMemo(() => stairRamps(levels), [levels]);
  const obstacles = useMemo(() => {
    const m = new Map<string, Obstacles>();
    for (const L of levels) m.set(L.id, levelObstacles(L, project));
    return m;
  }, [levels, project]);

  // Start in the middle of the current floor's biggest room, looking along it.
  useEffect(() => {
    const room = biggestRoom(startLevel);
    walkState.pos = spawn ? { ...spawn.stand } : room ? { ...room.label } : { x: 0, y: 0 };
    walkState.feet = startLevel.elevation;
    walkState.levelId = startLevel.id;
    camera.rotation.order = 'YXZ';
    // Forward at yaw t is (-sin t, -cos t) on the plan.
    const yaw = spawn ? Math.atan2(-(spawn.face.x - spawn.stand.x), -(spawn.face.y - spawn.stand.y)) : 0;
    camera.rotation.set(0, yaw, 0);
    look.current = { yaw, pitch: 0 };
    camera.position.set(walkState.pos.x * MM, (walkState.feet + EYE_HEIGHT) * MM, walkState.pos.y * MM);
    // On entering Walk, and again when "Walk in here" sends a new place to stand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawn?.n]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (KEYS[e.code]) {
        keys.current.add(e.code);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    if (touch && (touchInput.look.dx || touchInput.look.dy)) {
      look.current.yaw -= touchInput.look.dx * 0.005;
      look.current.pitch = Math.max(-1.3, Math.min(1.3, look.current.pitch - touchInput.look.dy * 0.005));
      touchInput.look.dx = 0;
      touchInput.look.dy = 0;
      camera.rotation.set(look.current.pitch, look.current.yaw, 0, 'YXZ');
    }
    let fwd = touchInput.move.y;
    let right = touchInput.move.x;
    for (const k of keys.current) {
      const v = KEYS[k];
      if (v) {
        fwd += v[0];
        right += v[1];
      }
    }
    if (fwd !== 0 || right !== 0) {
      const dir = camera.getWorldDirection(scratch);
      const fl = Math.hypot(dir.x, dir.z) || 1;
      const f = { x: dir.x / fl, y: dir.z / fl };
      const r = { x: -f.y, y: f.x };
      let mv = add(mul(f, fwd), mul(r, right));
      const ml = Math.hypot(mv.x, mv.y);
      if (ml > 1) mv = mul(mv, 1 / ml);
      const here = levelUnderFeet(walkState.feet, levels);
      const obs = here ? obstacles.get(here.id) : undefined;
      const target = add(walkState.pos, mul(mv, WALK_SPEED * dt));
      walkState.pos = obs ? resolveCollision(target, obs) : target;
    }
    walkState.feet = floorHeightAt(walkState.pos, walkState.feet, levels, ramps);
    camera.position.set(walkState.pos.x * MM, (walkState.feet + EYE_HEIGHT) * MM, walkState.pos.y * MM);
    const now = levelUnderFeet(walkState.feet, levels);
    if (now && now.id !== walkState.levelId) {
      walkState.levelId = now.id;
      onLevelChange(now.id);
    }
  });

  return touch ? null : <PointerLockControls selector=".view3d-stage canvas" />;
}
