// Sun hours per room: how long direct sun reaches the floor on a given day.
//
// Points are sampled on each room's floor. For every quarter hour between
// sunrise and sunset a ray is cast from the point towards the sun with a
// three.js Raycaster against the built walls, solid masses and floor and
// ceiling slabs of the flat. Window panes are left out of the occluders, so
// light passes through glass and open doorways; anything else blocks it.
// Neighbouring buildings and trees are not modelled.
//
// The work is a job that does a slice at a time (`step(budgetMs)`), so the UI
// can show progress and never freezes. `computeSunHours` runs it to the end.

import * as THREE from 'three';
import type { Level, Project, Vec2 } from '../model/types';
import { centroid, labelPoint, pointInPolygon } from '../geometry/vec';
import { detectRooms } from '../geometry/rooms';
import { roomForLoop } from '../model/faces';
import { buildLevel, MM } from './sceneBuild';
import { londonInstant, londonToday, solarPosition, sunPlanDirection, sunTimes, type LocalDay } from './sun';

/** Spacing of the sample grid on a floor (mm) and the most points one room gets. */
export const SAMPLE_SPACING_MM = 500;
export const MAX_POINTS_PER_ROOM = 200;
/** Minutes between sun checks. */
export const STEP_MINUTES = 15;
/** Rays start this far above the floor (m), clear of the floor surface itself. */
const RAY_LIFT = 0.02;

export type SunDateId = 'winter' | 'equinox' | 'summer' | 'today';

export interface SunDateSpec {
  id: SunDateId;
  label: string;
  day: LocalDay;
}

/** The four dates of the table, in this year (London). */
export function sunDates(now: Date = new Date()): SunDateSpec[] {
  const t = londonToday(now);
  return [
    { id: 'winter', label: 'Midwinter', day: { y: t.y, m: 12, d: 21 } },
    { id: 'equinox', label: 'Equinox', day: { y: t.y, m: 3, d: 20 } },
    { id: 'summer', label: 'Midsummer', day: { y: t.y, m: 6, d: 21 } },
    { id: 'today', label: 'Today', day: t },
  ];
}

/**
 * Sample points on a polygon: cell centres of a grid aligned to multiples of
 * the spacing that fall inside it. The spacing grows when the room is large
 * enough that it would give more than `maxPoints`. A tiny room still gets one.
 */
export function samplePointsInPolygon(
  poly: Vec2[],
  opts: { spacing?: number; maxPoints?: number } = {},
): { points: Vec2[]; spacing: number } {
  const max = opts.maxPoints ?? MAX_POINTS_PER_ROOM;
  let spacing = opts.spacing ?? SAMPLE_SPACING_MM;
  if (poly.length < 3) return { points: [], spacing };
  const minX = Math.min(...poly.map((p) => p.x));
  const maxX = Math.max(...poly.map((p) => p.x));
  const minY = Math.min(...poly.map((p) => p.y));
  const maxY = Math.max(...poly.map((p) => p.y));
  let points: Vec2[] = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    points = [];
    for (let j = Math.floor(minY / spacing); j * spacing < maxY; j++) {
      for (let i = Math.floor(minX / spacing); i * spacing < maxX; i++) {
        const p = { x: (i + 0.5) * spacing, y: (j + 0.5) * spacing };
        if (pointInPolygon(p, poly)) points.push(p);
      }
    }
    if (points.length <= max) break;
    spacing *= Math.max(1.02, Math.sqrt(points.length / max));
  }
  if (points.length === 0) {
    const c = centroid(poly);
    points = [pointInPolygon(c, poly) ? c : labelPoint(poly)];
  }
  return { points, spacing };
}

/** Quarter-hour sun directions (plan frame) for a day, only while the sun is up. */
export function daySunDirections(day: LocalDay, stepMinutes = STEP_MINUTES): { x: number; y: number; z: number; minutes: number }[] {
  const out: { x: number; y: number; z: number; minutes: number }[] = [];
  for (let m = 0; m < 1440; m += stepMinutes) {
    const p = solarPosition(londonInstant(day, m));
    if (p.elevationDeg > 0) out.push({ ...sunPlanDirection(p.azimuthDeg, p.elevationDeg), minutes: m });
  }
  return out;
}

// ---- Occluders -------------------------------------------------------------

const rayMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const CHUNK_M = 1.5;

/** Split a triangle soup into small spatial chunks, so a ray only tests the ones near it. */
function chunkGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const g = src.index ? src.toNonIndexed() : src;
  const pos = g.getAttribute('position');
  const groups = new Map<string, number[]>();
  for (let t = 0; t < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
    const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    const key = `${Math.floor(cx / CHUNK_M)},${Math.floor(cy / CHUNK_M)},${Math.floor(cz / CHUNK_M)}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  const out: THREE.BufferGeometry[] = [];
  for (const tris of groups.values()) {
    const arr = new Float32Array(tris.length * 9);
    tris.forEach((t, k) => {
      for (let v = 0; v < 3; v++) {
        arr[k * 9 + v * 3] = pos.getX(t + v);
        arr[k * 9 + v * 3 + 1] = pos.getY(t + v);
        arr[k * 9 + v * 3 + 2] = pos.getZ(t + v);
      }
    });
    const c = new THREE.BufferGeometry();
    c.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    c.computeBoundingSphere();
    c.computeBoundingBox();
    out.push(c);
  }
  if (g !== src) g.dispose();
  return out;
}

/**
 * Everything that can block the sun: walls, solid masses, floor and ceiling
 * slabs, door leaves and frames. Panes, furniture and stairs are left out.
 * Floors below the lowest one measured are skipped, since rays only go up.
 */
export function buildOccluders(levels: Level[], project: Project, minElevation: number): THREE.Mesh[] {
  const bare: Project = { ...project, levels: project.levels.map((l) => ({ ...l, items: [], stairs: [] })) };
  const ceilings: THREE.Mesh[] = [];
  const rest: THREE.Mesh[] = [];
  for (const level of levels) {
    if (level.elevation < minElevation - 1) continue;
    const lv = bare.levels.find((l) => l.id === level.id) ?? { ...level, items: [], stairs: [] };
    const scene = buildLevel(lv, bare);
    for (const m of scene.meshes) {
      if (m.key === 'token:glass' || m.key === 'token:water') continue;
      for (const g of chunkGeometry(m.geometry)) {
        const mesh = new THREE.Mesh(g, rayMaterial);
        (m.key.startsWith('ceiling:') ? ceilings : rest).push(mesh);
      }
    }
    scene.dispose();
  }
  return [...ceilings, ...rest];
}

// ---- The job ---------------------------------------------------------------

export interface RoomSun {
  levelId: string;
  levelName: string;
  roomName: string;
  /** Inside face of the room, plan mm. */
  polygon: Vec2[];
  /** Floor height, mm. */
  elevation: number;
  spacing: number;
  points: Vec2[];
  /** Per date: direct sun hours at each point. */
  pointHours: number[][];
  /** Per date: average over the points. */
  hours: number[];
}

export interface SunHoursResult {
  dates: SunDateSpec[];
  rooms: RoomSun[];
  /** Per date: hours between sunrise and sunset. */
  daylight: number[];
  /** The floors as they were when measured, to tell when the plan has changed. */
  levels: Level[];
}

export class SunHoursJob {
  readonly result: SunHoursResult;
  private readonly occluders: THREE.Mesh[];
  private readonly dirs: ReturnType<typeof daySunDirections>[];
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private lastBlocker = 0;
  private dateIdx = 0;
  private roomIdx = 0;
  private sampleIdx = 0;
  private raysDone = 0;
  readonly raysTotal: number;

  constructor(measured: Level[], project: Project, dates: SunDateSpec[] = sunDates()) {
    const rooms: RoomSun[] = [];
    for (const level of measured) {
      for (const d of detectRooms(level)) {
        if (d.solid || d.inner.length < 3) continue;
        const room = roomForLoop(level, d);
        const { points, spacing } = samplePointsInPolygon(d.inner);
        rooms.push({
          levelId: level.id,
          levelName: level.name,
          roomName: room?.name ?? 'Room',
          polygon: d.inner,
          elevation: level.elevation,
          spacing,
          points,
          pointHours: dates.map(() => points.map(() => 0)),
          hours: dates.map(() => 0),
        });
      }
    }
    this.dirs = dates.map((s) => daySunDirections(s.day));
    this.result = {
      dates,
      rooms,
      daylight: dates.map((s) => {
        const t = sunTimes(s.day);
        return t.sunrise && t.sunset ? (t.sunset.getTime() - t.sunrise.getTime()) / 3600e3 : 0;
      }),
      levels: measured,
    };
    const minElevation = Math.min(...measured.map((l) => l.elevation), 0);
    this.occluders = buildOccluders(measured, project, measured.length ? minElevation : 0);
    this.raysTotal = Math.max(
      1,
      this.dirs.reduce((sum, ds) => sum + ds.length * rooms.reduce((n, r) => n + r.points.length, 0), 0),
    );
    this.raycaster.near = 0;
    this.raycaster.far = 1000;
  }

  get progress(): number {
    return Math.min(1, this.raysDone / this.raysTotal);
  }

  get done(): boolean {
    return this.dateIdx >= this.result.dates.length;
  }

  /** Is this ray (already set on the raycaster) blocked? */
  private blocked(): boolean {
    const occ = this.occluders;
    const test = (i: number) => {
      this.hits.length = 0;
      occ[i].raycast(this.raycaster, this.hits);
      return this.hits.length > 0;
    };
    if (occ.length === 0) return false;
    if (test(this.lastBlocker)) return true;
    for (let i = 0; i < occ.length; i++) {
      if (i !== this.lastBlocker && test(i)) {
        this.lastBlocker = i;
        return true;
      }
    }
    return false;
  }

  /** Work for about `budgetMs` milliseconds. Returns true when finished. */
  step(budgetMs = 12): boolean {
    const start = performance.now();
    const { rooms } = this.result;
    while (!this.done) {
      const dirs = this.dirs[this.dateIdx];
      const room = rooms[this.roomIdx];
      if (!room) {
        this.finishDate();
        continue;
      }
      if (this.sampleIdx >= dirs.length) {
        this.roomIdx++;
        this.sampleIdx = 0;
        if (this.roomIdx >= rooms.length) this.finishDate();
        continue;
      }
      const dir = dirs[this.sampleIdx];
      const ph = room.pointHours[this.dateIdx];
      const weight = STEP_MINUTES / 60;
      this.raycaster.ray.direction.set(dir.x, dir.z, dir.y);
      for (let i = 0; i < room.points.length; i++) {
        const p = room.points[i];
        this.raycaster.ray.origin.set(p.x * MM, room.elevation * MM + RAY_LIFT, p.y * MM);
        if (!this.blocked()) ph[i] += weight;
      }
      this.raysDone += room.points.length;
      this.sampleIdx++;
      if (performance.now() - start > budgetMs) break;
    }
    return this.done;
  }

  private finishDate() {
    for (const r of this.result.rooms) {
      const ph = r.pointHours[this.dateIdx];
      r.hours[this.dateIdx] = ph.reduce((a, b) => a + b, 0) / Math.max(1, ph.length);
    }
    this.dateIdx++;
    this.roomIdx = 0;
    this.sampleIdx = 0;
  }

  dispose() {
    for (const m of this.occluders) m.geometry.dispose();
    this.occluders.length = 0;
  }
}

/** Run the whole calculation at once (tests and scripts). */
export function computeSunHours(measured: Level[], project: Project, dates?: SunDateSpec[]): SunHoursResult {
  const job = new SunHoursJob(measured, project, dates);
  while (!job.step(1e9));
  job.dispose();
  return job.result;
}

/** "1.5 h", "4 h", "0 h". */
export function formatHours(h: number): string {
  const r = Math.round(h * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)} h`;
}

// ---- Floor heatmap ---------------------------------------------------------

/** Pale cream (no sun) through yellow to warm amber (the most sun). */
export function heatColor(t: number): [number, number, number] {
  const stops: [number, number, number][] = [
    [0.93, 0.94, 0.95],
    [1.0, 0.89, 0.47],
    [1.0, 0.7, 0.1],
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  return [0, 1, 2].map((k) => stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f) as [number, number, number];
}

/** Clip a convex polygon to an axis-aligned rectangle (Sutherland-Hodgman). */
function clipToRect(poly: Vec2[], x0: number, y0: number, x1: number, y1: number): Vec2[] {
  const edges: ((p: Vec2) => number)[] = [(p) => p.x - x0, (p) => x1 - p.x, (p) => p.y - y0, (p) => y1 - p.y];
  let pts = poly;
  for (const f of edges) {
    const next: Vec2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const fa = f(a);
      const fb = f(b);
      if (fa >= 0) next.push(a);
      if (fa >= 0 !== fb >= 0) {
        const t = fa / (fa - fb);
        next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    pts = next;
    if (pts.length === 0) break;
  }
  return pts;
}

/**
 * One vertex-coloured mesh of every room's floor, a colour per sample cell for
 * the chosen date. `maxHours` is the sun-hours value drawn as the warmest colour.
 */
export function buildHeatGeometry(rooms: RoomSun[], dateIdx: number, maxHours: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const scale = Math.max(0.01, maxHours);
  for (const r of rooms) {
    const hours = r.pointHours[dateIdx];
    const y = r.elevation * MM + 0.012;
    const poly = r.polygon;
    const tris = THREE.ShapeUtils.triangulateShape(
      poly.map((p) => new THREE.Vector2(p.x, p.y)),
      [],
    );
    const s = r.spacing;
    const byCell = new Map<string, number>();
    r.points.forEach((p, i) => byCell.set(`${Math.floor(p.x / s)},${Math.floor(p.y / s)}`, hours[i]));
    const hoursAt = (cx: number, cy: number) => {
      const hit = byCell.get(`${cx},${cy}`);
      if (hit !== undefined) return hit;
      let best = 0;
      let bd = Infinity;
      const mx = (cx + 0.5) * s;
      const my = (cy + 0.5) * s;
      r.points.forEach((p, i) => {
        const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
        if (d < bd) {
          bd = d;
          best = hours[i];
        }
      });
      return best;
    };
    for (const [i, j, k] of tris) {
      const tri = [poly[i], poly[j], poly[k]];
      const x0 = Math.min(...tri.map((p) => p.x));
      const x1 = Math.max(...tri.map((p) => p.x));
      const y0 = Math.min(...tri.map((p) => p.y));
      const y1 = Math.max(...tri.map((p) => p.y));
      for (let cy = Math.floor(y0 / s); cy * s < y1; cy++) {
        for (let cx = Math.floor(x0 / s); cx * s < x1; cx++) {
          const piece = clipToRect(tri, cx * s, cy * s, (cx + 1) * s, (cy + 1) * s);
          if (piece.length < 3) continue;
          const [sr, sg, sb] = heatColor(hoursAt(cx, cy) / scale);
          const lin = new THREE.Color().setRGB(sr, sg, sb, THREE.SRGBColorSpace);
          const [cr, cg, cb] = [lin.r, lin.g, lin.b];
          for (let v = 1; v < piece.length - 1; v++) {
            for (const q of [piece[0], piece[v], piece[v + 1]]) {
              pos.push(q.x * MM, y, q.y * MM);
              col.push(cr, cg, cb);
            }
          }
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
