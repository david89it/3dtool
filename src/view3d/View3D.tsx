import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Level } from '../model/types';
import { useStore } from '../model/store';
import { rotate } from '../geometry/vec';
import { LevelMesh } from './LevelMesh';
import { WalkRig, touchInput, walkState } from './WalkRig';
import { CUTAWAY_HEIGHT, levelBoundsMm, MM } from './sceneBuild';
import { activeLevelsResolved } from '../model/schemes';
import { FinishPanel, type FaceSel } from './FinishPanel';
import { wallSideRooms } from '../model/faces';
import { wallDir } from './wallProfile';
import { view3dBridge } from './captureBridge';
import './view3d.css';

/** Plan "up" (towards the garden) points roughly north-north-west (from the agent's north arrow). */
export const PLAN_UP_BEARING = 330;

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compassName = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

declare global {
  interface Window {
    __flatplan3d?: {
      ready: boolean;
      fps: number;
      camera: { x: number; y: number; z: number };
      view: string;
      /** Dev only: point the camera (radians) for screenshots. */
      look: (yaw: number, pitch: number) => void;
    };
  }
}

function levelCentre(level: Level): THREE.Vector3 {
  const b = levelBoundsMm(level);
  const cx = b ? (b.min.x + b.max.x) / 2 : 0;
  const cy = b ? (b.min.y + b.max.y) / 2 : 0;
  return new THREE.Vector3(cx * MM, level.elevation * MM, cy * MM);
}

function Sun({ azimuth, elevation, centre }: { azimuth: number; elevation: number; centre: THREE.Vector3 }) {
  const ref = useRef<THREE.DirectionalLight>(null);
  const dir = rotate({ x: 0, y: -1 }, azimuth - PLAN_UP_BEARING);
  const el = (elevation * Math.PI) / 180;
  const dist = 30;
  const pos: [number, number, number] = [
    centre.x + dir.x * Math.cos(el) * dist,
    centre.y + Math.sin(el) * dist,
    centre.z + dir.y * Math.cos(el) * dist,
  ];
  useEffect(() => {
    if (!ref.current) return;
    ref.current.target.position.copy(centre);
    ref.current.target.updateMatrixWorld();
  }, [centre]);
  return (
    <directionalLight
      ref={ref}
      position={pos}
      intensity={2.6}
      color="#fff4e2"
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-left={-12}
      shadow-camera-right={12}
      shadow-camera-top={12}
      shadow-camera-bottom={-12}
      shadow-camera-near={1}
      shadow-camera-far={80}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
    />
  );
}

function OrbitRig({ level }: { level: Level }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    // A steep three-quarter view from the front (street) side, framing the floor.
    const c = levelCentre(level);
    const b = levelBoundsMm(level);
    const span = b ? Math.max(b.max.x - b.min.x, b.max.y - b.min.y) * MM : 8;
    const dist = Math.max(8, span * 1.55);
    const pitch = (58 * Math.PI) / 180;
    const yaw = (20 * Math.PI) / 180; // a little from the right so walls read in depth
    camera.position.set(
      c.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      c.y + Math.sin(pitch) * dist,
      c.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    camera.lookAt(c);
    if (controls.current) {
      controls.current.target.copy(c);
      controls.current.update();
    }
  }, [level.id, camera]); // eslint-disable-line react-hooks/exhaustive-deps
  return <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI / 2.02} minDistance={1.5} maxDistance={60} enableDamping />;
}

/**
 * Keeps a picture of the overview for the print pack. Taken every few
 * seconds while the overview shows, so it is still there after she leaves 3D.
 */
function SnapshotRig({ enabled, floor }: { enabled: boolean; floor: string }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!enabled) {
      view3dBridge.capture = null;
      return;
    }
    const take = () => {
      try {
        view3dBridge.snapshot = { dataUrl: gl.domElement.toDataURL('image/jpeg', 0.85), floor };
      } catch {
        // the canvas can be gone while the page closes; keep the last picture
      }
    };
    view3dBridge.capture = take;
    const first = setTimeout(take, 2500);
    const every = setInterval(take, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      if (view3dBridge.capture === take) view3dBridge.capture = null;
    };
  }, [enabled, floor, gl]);
  return null;
}

/** Frame counter and a small test hook (dev builds only). */
function Probe({ view }: { view: string }) {
  const frames = useRef(0);
  const since = useRef(performance.now());
  const fps = useRef(0);
  useFrame(({ camera }) => {
    frames.current += 1;
    const now = performance.now();
    if (now - since.current >= 1000) {
      fps.current = (frames.current * 1000) / (now - since.current);
      frames.current = 0;
      since.current = now;
    }
    if (import.meta.env.DEV) {
      window.__flatplan3d = {
        ready: true,
        fps: Math.round(fps.current),
        camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        view,
        look: (yaw, pitch) => camera.rotation.set(pitch, yaw, 0, 'YXZ'),
      };
    }
  });
  return null;
}

function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const id = useRef<number | null>(null);
  const update = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2;
    const l = Math.hypot(dx, dy);
    const k = l > max ? max / l : 1;
    setKnob({ x: dx * k, y: dy * k });
    touchInput.move = { x: (dx * k) / max, y: -(dy * k) / max };
  };
  const end = () => {
    id.current = null;
    setKnob({ x: 0, y: 0 });
    touchInput.move = { x: 0, y: 0 };
  };
  return (
    <div
      ref={base}
      className="joystick"
      aria-label="Move"
      onPointerDown={(e) => {
        id.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => id.current === e.pointerId && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function LookPad() {
  const last = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="lookpad"
      aria-label="Look around"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!last.current) return;
        touchInput.look.dx += e.clientX - last.current.x;
        touchInput.look.dy += e.clientY - last.current.y;
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
    />
  );
}

/** A thin tinted sheet over the selected wall face, drawn only while a face is selected (never on hover). */
function FaceHighlight({ level, face, cut }: { level: Level; face: FaceSel; cut?: number }) {
  const wall = level.walls.find((w) => w.id === face.wallId);
  const spec = useMemo(() => {
    if (!wall) return null;
    const { a, d, length } = wallDir(level, wall);
    if (length < 1) return null;
    const h = Math.min(wall.height ?? level.ceilingHeight, cut ?? Infinity);
    const sign = face.side === 'L' ? 1 : -1;
    const n = { x: -d.y * sign, y: d.x * sign };
    const off = wall.thickness / 2 + 4;
    const mid = { x: a.x + d.x * (length / 2) + n.x * off, y: a.y + d.y * (length / 2) + n.y * off };
    return {
      position: [mid.x * MM, (level.elevation + h / 2) * MM, mid.y * MM] as [number, number, number],
      // The plane's normal (+z) must point out of the face: yaw so +z maps to (n.x, n.y) in (x, z).
      rotationY: Math.atan2(n.x, n.y),
      size: [length * MM, h * MM] as [number, number],
    };
  }, [level, wall, face.side, cut]);
  if (!spec) return null;
  return (
    <mesh position={spec.position} rotation={[0, spec.rotationY, 0]} raycast={() => null} renderOrder={5}>
      <planeGeometry args={spec.size} />
      <meshBasicMaterial color="#2563eb" transparent opacity={0.28} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

export function View3D() {
  const project = useStore((s) => s.project);
  const levelId = useStore((s) => s.levelId);
  const level = project.levels.find((l) => l.id === levelId) ?? project.levels[0];
  const [view, setView] = useState<'orbit' | 'walk'>('orbit');
  const [azimuth, setAzimuth] = useState(200);
  const [elevation, setElevation] = useState(35);
  const [lightsOn, setLightsOn] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [face, setFace] = useState<FaceSel | null>(null);
  const [locked, setLocked] = useState(false);
  const [cutaway, setCutaway] = useState(true);
  const touch = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches, []);

  useEffect(() => {
    const onChange = () => setLocked(!!document.pointerLockElement);
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  useEffect(() => () => void (window.__flatplan3d = undefined), []);

  // In the overview, hide floors above the one she is looking at so she can see in.
  // Only the active option of each floor is built (compare mode).
  const shown = useMemo(() => activeLevelsResolved(project), [project]);
  const visible = useMemo(
    () => (view === 'walk' ? shown : shown.filter((l) => l.elevation <= level.elevation + 1)),
    [view, shown, level.elevation],
  );
  // Cut-away: in the overview, walls stop at 1.2 m so rooms and furniture read clearly.
  const cut = view === 'orbit' && cutaway ? CUTAWAY_HEIGHT : undefined;
  const centre = useMemo(() => levelCentre(level), [level]);

  if (!level) return null;

  return (
    <div className="view3d" data-testid="view3d">
      <div className="view3d-stage">
        <Canvas
          shadows="percentage"
          dpr={[1, 2]}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          camera={{ fov: 60, near: 0.05, far: 300, position: [8, 12, 14] }}
          onCreated={({ gl }) => {
            // Neutral tone mapping keeps paint and timber colours true to the swatches.
            gl.toneMapping = THREE.NeutralToneMapping;
          }}
        >
          <color attach="background" args={['#e9eef2']} />
          {/* Soft daylight bouncing around the rooms; the ground colour is a pale floor tone so ceilings stay white. */}
          <hemisphereLight args={['#f4f7fb', '#e6dfd3', 1.7]} />
          <ambientLight intensity={0.35} />
          <Sun azimuth={azimuth} elevation={elevation} centre={centre} />
          {visible.map((L) => (
            <LevelMesh
              key={L.id}
              level={L}
              project={project}
              lightsOn={lightsOn}
              cutHeight={L.id === level.id || L.elevation >= level.elevation - 1 ? cut : undefined}
              onPickRoom={(lid, rid) => {
                if (lid !== useStore.getState().levelId) useStore.getState().setLevel(lid);
                setRoomId(rid);
                setFace(null);
              }}
              onPickFace={(lid, wallId, side) => {
                const st = useStore.getState();
                if (lid !== st.levelId) st.setLevel(lid);
                const lv = st.project.levels.find((l) => l.id === lid);
                const room = lv ? wallSideRooms(lv).get(wallId)?.[side]?.room : undefined;
                if (room) setRoomId(room.id);
                setFace({ levelId: lid, wallId, side });
              }}
            />
          ))}
          {face && face.levelId === level.id && <FaceHighlight level={level} face={face} cut={cut} />}
          {/* Ground plane around the building */}
          <mesh rotation-x={-Math.PI / 2} position={[centre.x, -0.02, centre.z]} receiveShadow>
            <planeGeometry args={[80, 80]} />
            <meshStandardMaterial color="#d9dccf" roughness={1} />
          </mesh>
          {view === 'orbit' ? (
            <OrbitRig level={level} />
          ) : (
            <WalkRig
              levels={shown}
              project={project}
              startLevel={level}
              touch={!!touch}
              onLevelChange={(id) => useStore.getState().setLevel(id)}
            />
          )}
          <Probe view={view} />
          <SnapshotRig enabled={view === 'orbit'} floor={level.name} />
        </Canvas>

        <div className="view3d-hud" role="status">
          {view === 'orbit' ? (
            <span>Drag to turn, scroll or pinch to zoom. Click a floor to choose its finish.</span>
          ) : (
            <span>
              <strong>{level.name}</strong> ·{' '}
              {touch
                ? 'Left thumb to walk, drag on the right to look.'
                : locked
                  ? 'W A S D or arrow keys to walk. Esc to free the mouse.'
                  : 'Click the view to look around with the mouse. W A S D or arrow keys to walk.'}
            </span>
          )}
          {view === 'walk' && (
            <button className="btn small" onClick={() => setView('orbit')}>
              Back to overview
            </button>
          )}
        </div>
        {view === 'walk' && touch && (
          <>
            <LookPad />
            <Joystick />
          </>
        )}
      </div>

      <aside className="view3d-panel" aria-label="3D settings">
        <section className="panel-section">
          <h2>View</h2>
          <div className="segmented" role="radiogroup" aria-label="Camera">
            <button role="radio" aria-checked={view === 'orbit'} className={view === 'orbit' ? 'on' : ''} onClick={() => setView('orbit')}>
              Overview
            </button>
            <button role="radio" aria-checked={view === 'walk'} className={view === 'walk' ? 'on' : ''} onClick={() => setView('walk')}>
              Walk
            </button>
          </div>
          <p className="note">
            {view === 'walk'
              ? 'You walk at about 1.4 m/s with your eyes 1.6 m above the floor. Stairs take you between floors.'
              : 'Floors above this one are hidden so you can see in. Tab goes back to the plan.'}
          </p>
          {view === 'orbit' && (
            <label className="toggle">
              <input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} data-testid="cutaway" />
              Cut-away walls (1.2 m high)
            </label>
          )}
        </section>

        <section className="panel-section">
          <h2>Daylight</h2>
          <label className="slider">
            <span className="field-label">
              Sun from the {compassName(azimuth)} ({Math.round(azimuth)}°)
            </span>
            <input type="range" min={0} max={359} value={azimuth} aria-label="Sun direction" onChange={(e) => setAzimuth(+e.target.value)} />
          </label>
          <label className="slider">
            <span className="field-label">Sun height {Math.round(elevation)}°</span>
            <input type="range" min={5} max={75} value={elevation} aria-label="Sun height" onChange={(e) => setElevation(+e.target.value)} />
          </label>
          <p className="note">The front (bay window) faces south-south-east. Low winter sun is about 15°, midsummer noon about 62°.</p>
          <label className="toggle">
            <input type="checkbox" checked={lightsOn} onChange={(e) => setLightsOn(e.target.checked)} />
            Ceiling lights on
          </label>
        </section>

        <FinishPanel
          level={level}
          roomId={roomId}
          onPickRoom={(id) => {
            setRoomId(id);
            setFace(null);
          }}
          face={face}
          onFace={setFace}
        />
      </aside>
    </div>
  );
}

export { walkState };
