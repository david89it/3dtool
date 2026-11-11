import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Level } from '../model/types';
import { useStore } from '../model/store';
import { LevelMesh } from './LevelMesh';
import { WalkRig, touchInput, walkState } from './WalkRig';
import { CUTAWAY_HEIGHT, levelBoundsMm, MM } from './sceneBuild';
import { activeLevelsResolved } from '../model/schemes';
import { FinishPanel, type FaceSel } from './FinishPanel';
import { wallSideRooms } from '../model/faces';
import { wallDir } from './wallProfile';
import { roomViewBridge, type RoomView3D } from './captureBridge';
import { SunRig, SunHeatmap } from './SunRig';
import { SunPanel } from './SunPanel';
import './view3d.css';

// The plan's north offset lives in sun.ts (PLAN_UP_BEARING); re-exported here for older imports.
export { PLAN_UP_BEARING } from './sun';

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

/** A room to look into from above (plan mm), with a counter so asking twice moves the camera twice. */
interface RoomFrame {
  levelId: string;
  polygon: { x: number; y: number }[];
  n: number;
}

function OrbitRig({ level, frame }: { level: Level; frame: RoomFrame | null }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    // A steep three-quarter view from the front (street) side, framing the floor,
    // or just the one room when she asked to frame it.
    const room = frame && frame.levelId === level.id && frame.polygon.length > 0 ? frame.polygon : null;
    let c = levelCentre(level);
    let span: number;
    if (room) {
      const xs = room.map((p) => p.x);
      const ys = room.map((p) => p.y);
      c = new THREE.Vector3(((Math.min(...xs) + Math.max(...xs)) / 2) * MM, (level.elevation + 600) * MM, ((Math.min(...ys) + Math.max(...ys)) / 2) * MM);
      span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * MM;
    } else {
      const b = levelBoundsMm(level);
      span = b ? Math.max(b.max.x - b.min.x, b.max.y - b.min.y) * MM : 8;
    }
    const dist = room ? Math.max(3.5, span * 1.7) : Math.max(8, span * 1.55);
    const pitch = ((room ? 52 : 58) * Math.PI) / 180;
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
  }, [level.id, camera, frame?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  return <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI / 2.02} minDistance={1.5} maxDistance={60} enableDamping />;
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
  const [lightsOn, setLightsOn] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [face, setFace] = useState<FaceSel | null>(null);
  const [locked, setLocked] = useState(false);
  const [cutaway, setCutaway] = useState(true);
  const [frame, setFrame] = useState<RoomFrame | null>(null);
  const [spawn, setSpawn] = useState<{ stand: { x: number; y: number }; face: { x: number; y: number }; n: number } | null>(null);
  const touch = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches, []);

  useEffect(() => {
    const onChange = () => setLocked(!!document.pointerLockElement);
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  useEffect(() => () => void (window.__flatplan3d = undefined), []);

  // "Frame this room" and "Walk in here" from the plan arrive through the bridge.
  useEffect(() => {
    const take = (r: RoomView3D) => {
      if (r.levelId !== level.id) return;
      if (r.kind === 'walk' && r.stand && r.face) {
        setSpawn({ stand: r.stand, face: r.face, n: Date.now() });
        setView('walk');
      } else if (r.kind === 'frame') {
        setFrame({ levelId: r.levelId, polygon: r.polygon, n: Date.now() });
        setView('orbit');
      }
    };
    roomViewBridge.handler = take;
    const waiting = roomViewBridge.pending;
    roomViewBridge.pending = null;
    if (waiting) take(waiting);
    return () => {
      if (roomViewBridge.handler === take) roomViewBridge.handler = null;
    };
  }, [level.id]);

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
  // What the sun's shadow camera must cover: the floors in view, in world metres.
  const shadowBox = useMemo(() => {
    const b = levelBoundsMm(level);
    const lo = Math.min(...visible.map((l) => l.elevation), level.elevation);
    const pad = 500;
    return new THREE.Box3(
      new THREE.Vector3(((b?.min.x ?? 0) - pad) * MM, lo * MM, ((b?.min.y ?? 0) - pad) * MM),
      new THREE.Vector3(((b?.max.x ?? 0) + pad) * MM, (level.elevation + level.ceilingHeight) * MM, ((b?.max.y ?? 0) + pad) * MM),
    );
  }, [level, visible]);

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
          <SunRig box={shadowBox} />
          <SunHeatmap levelId={level.id} />
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
            <OrbitRig level={level} frame={frame} />
          ) : (
            <WalkRig
              levels={shown}
              project={project}
              startLevel={level}
              spawn={spawn}
              touch={!!touch}
              onLevelChange={(id) => useStore.getState().setLevel(id)}
            />
          )}
          <Probe view={view} />
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
            <button role="radio" aria-checked={view === 'walk'} className={view === 'walk' ? 'on' : ''} onClick={() => { setSpawn(null); setView('walk'); }}>
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

        <SunPanel project={project} level={level} lightsOn={lightsOn} onLights={setLightsOn} />

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
