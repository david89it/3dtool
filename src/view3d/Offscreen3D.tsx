// A 3D renderer that is never on screen, for the print pack. It owns its own
// WebGL canvas (so it works whether or not the 3D view is open, and never
// touches the camera or settings she is using there) and draws one picture at
// a time on request: one floor of any project, from above at an angle with the
// walls cut away to 1.2 m. The pack mounts it, lazily, only while it is open.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Project } from '../model/types';
import { activeLevelsResolved } from '../model/schemes';
import { LevelMesh } from './LevelMesh';
import { CUTAWAY_HEIGHT, levelBoundsMm, MM } from './sceneBuild';
import { view3dBridge, type OverviewRequest } from './captureBridge';

export const OFFSCREEN_W = 1200;
export const OFFSCREEN_H = 646; // same shape as the plan pictures (1040 x 560)
/** Longest one picture may take before the pack gives up on it. */
const JOB_TIMEOUT_MS = 20_000;
/** Frames to let pass so the floors have been built and drawn before the capture. */
const SETTLE_FRAMES = 3;

interface Job {
  id: number;
  req: OverviewRequest;
  finish: (url: string | null) => void;
}

/** Where the camera goes: the same steep three-quarter view as the overview in 3D. */
export function overviewCamera(project: Pick<Project, 'levels' | 'activeSchemes'>, levelId: string) {
  const level = activeLevelsResolved(project).find((l) => l.id === levelId) ?? project.levels.find((l) => l.id === levelId);
  if (!level) return null;
  const b = levelBoundsMm(level);
  const cx = b ? (b.min.x + b.max.x) / 2 : 0;
  const cy = b ? (b.min.y + b.max.y) / 2 : 0;
  const span = b ? Math.max(b.max.x - b.min.x, b.max.y - b.min.y) * MM : 8;
  const centre = new THREE.Vector3(cx * MM, level.elevation * MM, cy * MM);
  const dist = Math.max(8, span * 1.55);
  const pitch = (58 * Math.PI) / 180;
  const yaw = (20 * Math.PI) / 180;
  const position = new THREE.Vector3(
    centre.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    centre.y + Math.sin(pitch) * dist,
    centre.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  return { level, centre, position };
}

/** Draws the job's floor (and the floors below it), then captures once it has settled. */
function Shot({ job }: { job: Job }) {
  const { project, levelId } = job.req;
  const cam = overviewCamera(project, levelId);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const frames = useRef(0);
  const done = useRef(false);

  useLayoutEffect(() => {
    if (!cam) return;
    camera.position.copy(cam.position);
    camera.lookAt(cam.centre);
    camera.updateMatrixWorld();
  }, [cam, camera]);

  useFrame(({ scene }) => {
    if (done.current) return;
    if (!cam) {
      done.current = true;
      job.finish(null);
      return;
    }
    frames.current += 1;
    if (frames.current < SETTLE_FRAMES) return;
    done.current = true;
    try {
      gl.render(scene, camera);
      job.finish(gl.domElement.toDataURL('image/png'));
    } catch {
      job.finish(null);
    }
  });

  if (!cam) return null;
  const { level, centre } = cam;
  const visible = activeLevelsResolved(project).filter((l) => l.elevation <= level.elevation + 1);
  return (
    <>
      <color attach="background" args={['#e9eef2']} />
      <hemisphereLight args={['#f4f7fb', '#e6dfd3', 1.7]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[centre.x + 14, centre.y + 22, centre.z + 12]} intensity={2.2} color="#fff4e2" />
      {visible.map((L) => (
        <LevelMesh
          key={L.id}
          level={L}
          project={project}
          lightsOn={false}
          cutHeight={L.id === level.id || L.elevation >= level.elevation - 1 ? CUTAWAY_HEIGHT : undefined}
        />
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[centre.x, -0.02, centre.z]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#d9dccf" roughness={1} />
      </mesh>
    </>
  );
}

export function Offscreen3D() {
  const [job, setJob] = useState<Job | null>(null);
  const pending = useRef<Job | null>(null);
  const counter = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    const render = (req: OverviewRequest) => {
      const next = chain.current.then(
        () =>
          new Promise<string | null>((resolve) => {
            let settled = false;
            const timer = setTimeout(() => finish(null), JOB_TIMEOUT_MS);
            const finish = (url: string | null) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              pending.current = null;
              setJob(null);
              resolve(url);
            };
            const j: Job = { id: ++counter.current, req, finish };
            pending.current = j;
            setJob(j);
          }),
      );
      chain.current = next.catch(() => undefined);
      return next;
    };
    view3dBridge.renderer = render;
    return () => {
      if (view3dBridge.renderer === render) view3dBridge.renderer = null;
      pending.current?.finish(null);
    };
  }, []);

  return (
    <div
      aria-hidden
      data-testid="offscreen-3d"
      style={{ position: 'fixed', left: -100000, top: 0, width: OFFSCREEN_W, height: OFFSCREEN_H, pointerEvents: 'none' }}
    >
      <Canvas
        dpr={1}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        camera={{ fov: 60, near: 0.05, far: 300, position: [8, 12, 14] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
        }}
      >
        {job && <Shot key={job.id} job={job} />}
      </Canvas>
    </div>
  );
}
