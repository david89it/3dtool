import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { currentSun, useSunUi } from './sunState';
import { sunPlanDirection } from './sun';
import { buildHeatGeometry } from './sunHours';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const NIGHT_BG = new THREE.Color('#141b2b');
const DAY_BG = new THREE.Color('#e9eef2');
const DUSK_BG = new THREE.Color('#f0c7a0');
const SUN_LOW = new THREE.Color('#ffa65c');
const SUN_HIGH = new THREE.Color('#fff4e2');

/**
 * The sun, the sky light and the background. Everything follows the sun
 * state each frame by changing light properties only, so the time slider and
 * "Play the day" never rebuild geometry or re-render React. Below the horizon
 * the sun goes out (no sun shadow) and the scene turns to a dim dusk or night.
 * The shadow camera is fitted to `box` (the floors in view) so shadows stay sharp.
 */
export function SunRig({ box }: { box: THREE.Box3 }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const bg = useMemo(() => new THREE.Color(), []);
  const helper = useMemo(() => new THREE.OrthographicCamera(), []);
  const corners = useMemo(() => Array.from({ length: 8 }, () => new THREE.Vector3()), []);
  const centre = useMemo(() => box.getCenter(new THREE.Vector3()), [box]);

  useFrame(({ scene }) => {
    const light = sun.current;
    if (!light) return;
    const s = useSunUi.getState();
    const { azimuthDeg, elevationDeg: el } = currentSun(s);
    const d = sunPlanDirection(azimuthDeg, Math.max(el, 2));
    const day = smooth(-4, 6, el);

    // Position: plan x, up, plan y map to world x, y, z.
    light.position.set(centre.x + d.x * 30, centre.y + d.z * 30, centre.z + d.y * 30);
    light.target.position.copy(centre);
    light.target.updateMatrixWorld();
    light.intensity = 2.6 * smooth(0, 6, el) * (0.6 + 0.4 * smooth(4, 25, el));
    light.color.copy(SUN_LOW).lerp(SUN_HIGH, smooth(0, 22, el));

    // Fit the shadow camera to the box, seen from the sun.
    const cam = helper;
    cam.position.copy(light.position);
    cam.up.set(0, 1, 0);
    cam.lookAt(centre);
    cam.updateMatrixWorld();
    let i = 0;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) corners[i++].set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
    const sc = light.shadow.camera;
    sc.left = Math.min(...corners.map((c) => c.x));
    sc.right = Math.max(...corners.map((c) => c.x));
    sc.bottom = Math.min(...corners.map((c) => c.y));
    sc.top = Math.max(...corners.map((c) => c.y));
    sc.near = Math.max(0.1, -Math.max(...corners.map((c) => c.z)) - 1);
    sc.far = -Math.min(...corners.map((c) => c.z)) + 1;
    sc.updateProjectionMatrix();

    if (hemi.current) hemi.current.intensity = 0.3 + 1.4 * day;
    if (amb.current) amb.current.intensity = 0.14 + 0.21 * day;
    // Background: night blue to pale daylight, with a warm tint when the sun is low.
    bg.copy(NIGHT_BG).lerp(DAY_BG, day).lerp(DUSK_BG, 0.35 * day * (1 - smooth(2, 14, el)));
    scene.background = bg;
  });

  return (
    <>
      {/* Soft daylight bouncing around the rooms; the ground colour is a pale floor tone so ceilings stay white. */}
      <hemisphereLight ref={hemi} args={['#f4f7fb', '#e6dfd3', 1.7]} />
      <ambientLight ref={amb} intensity={0.35} />
      <directionalLight
        ref={sun}
        intensity={2.6}
        color="#fff4e2"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
    </>
  );
}

/** Sun hours painted on the floor of the current level: one vertex-coloured mesh. */
export function SunHeatmap({ levelId }: { levelId: string }) {
  const heatOn = useSunUi((s) => s.heatOn);
  const heatDate = useSunUi((s) => s.heatDate);
  const result = useSunUi((s) => s.calc.result);
  const geometry = useMemo(() => {
    if (!heatOn || !result) return null;
    const rooms = result.rooms.filter((r) => r.levelId === levelId);
    if (rooms.length === 0) return null;
    const max = Math.max(1, ...result.rooms.flatMap((r) => r.pointHours[heatDate] ?? []));
    return buildHeatGeometry(rooms, heatDate, max);
  }, [heatOn, heatDate, result, levelId]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} raycast={() => null} renderOrder={3}>
      <meshBasicMaterial vertexColors transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
