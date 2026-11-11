// Where the sun is, for the flat's real location and orientation.
//
// A pure approximation in the style of the NOAA solar calculator
// (declination, equation of time, hour angle). Good to about a tenth of a
// degree for the years that matter here. Times use Europe/London local time
// (BST in summer, GMT in winter) through Intl, so they read as she expects.

/** 18B Balmore Street, London N19. */
export const SITE = { latitude: 51.565, longitude: -0.137 };

/**
 * PLAN NORTH OFFSET. The compass bearing (degrees clockwise from true north)
 * of "up the screen" on the plan, which runs from the street (front, bay
 * window) towards the garden. The agent's north arrow points roughly
 * north-north-west, so the front (plan down) faces south-south-east (150 degrees).
 * This is a guess from a drawing: after the site visit, set it from a compass
 * reading (add or subtract magnetic declination, about 1 degree west in London)
 * and the sun, the shadows and the sun-hours table all follow.
 */
export const PLAN_UP_BEARING = 330;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const TZ = 'Europe/London';

export interface SunPosition {
  /** Compass bearing of the sun, degrees clockwise from north. */
  azimuthDeg: number;
  /** Degrees above the horizon (geometric, no refraction). */
  elevationDeg: number;
}

/** Declination (rad) and equation of time (minutes) for an instant. */
function solarCoords(ms: number): { decl: number; eot: number } {
  const jd = ms / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps * RAD) / 2) ** 2;
  const L0r = L0 * RAD;
  const eot =
    4 *
    DEG *
    (y * Math.sin(2 * L0r) -
      2 * e * Math.sin(Mr) +
      4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) -
      1.25 * e * e * Math.sin(2 * Mr));
  return { decl, eot };
}

/** Sun azimuth (from north, clockwise) and elevation for an instant and a place. */
export function solarPosition(date: Date, lat: number = SITE.latitude, lon: number = SITE.longitude): SunPosition {
  const ms = date.getTime();
  const { decl, eot } = solarCoords(ms);
  const utcMin = (((ms / 60000) % 1440) + 1440) % 1440;
  const solarMin = (((utcMin + eot + 4 * lon) % 1440) + 1440) % 1440;
  const ha = (solarMin / 4 - 180) * RAD;
  const latr = lat * RAD;
  const sinEl = Math.sin(latr) * Math.sin(decl) + Math.cos(latr) * Math.cos(decl) * Math.cos(ha);
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, sinEl))) * DEG;
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(latr) - Math.tan(decl) * Math.cos(latr)) * DEG + 180;
  return { azimuthDeg: ((az % 360) + 360) % 360, elevationDeg };
}

/** A calendar day in London. */
export interface LocalDay {
  y: number;
  m: number; // 1-12
  d: number;
}

export interface SunTimes {
  /** Null in polar day or night (not reachable in London). */
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
}

/** Sunrise and sunset (upper limb, with refraction) and solar noon for a London day. */
export function sunTimes(day: LocalDay, lat: number = SITE.latitude, lon: number = SITE.longitude): SunTimes {
  // Start from noon UTC of that day and refine with the sun's coordinates at the answer.
  const noonUtc = Date.UTC(day.y, day.m - 1, day.d, 12, 0, 0);
  const dayStartUtc = Date.UTC(day.y, day.m - 1, day.d, 0, 0, 0);
  let noonMs = noonUtc;
  let rise: number | null = null;
  let set: number | null = null;
  const latr = lat * RAD;
  for (let i = 0; i < 3; i++) {
    const { decl, eot } = solarCoords(noonMs);
    noonMs = dayStartUtc + (720 - 4 * lon - eot) * 60000;
    const cosH = (Math.cos(90.833 * RAD) - Math.sin(latr) * Math.sin(decl)) / (Math.cos(latr) * Math.cos(decl));
    if (cosH > 1 || cosH < -1) {
      rise = set = null;
    } else {
      const h = Math.acos(cosH) * DEG;
      rise = dayStartUtc + (720 - 4 * (lon + h) - eot) * 60000;
      set = dayStartUtc + (720 - 4 * (lon - h) - eot) * 60000;
    }
  }
  return { sunrise: rise === null ? null : new Date(rise), sunset: set === null ? null : new Date(set), solarNoon: new Date(noonMs) };
}

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** London wall-clock parts of an instant. */
export function londonParts(date: Date): { y: number; m: number; d: number; hh: number; mm: number; ss: number } {
  const o: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(date)) if (p.type !== 'literal') o[p.type] = +p.value;
  return { y: o.year, m: o.month, d: o.day, hh: o.hour % 24, mm: o.minute, ss: o.second };
}

/** Minutes London is ahead of UTC at an instant (0 in winter, 60 in summer). */
export function londonOffsetMinutes(date: Date): number {
  const p = londonParts(date);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The instant of a London wall-clock time (minutes after local midnight, may be fractional). */
export function londonInstant(day: LocalDay, minutes: number): Date {
  const naive = Date.UTC(day.y, day.m - 1, day.d, 0, 0, 0) + minutes * 60000;
  let off = londonOffsetMinutes(new Date(naive));
  let t = naive - off * 60000;
  off = londonOffsetMinutes(new Date(t));
  t = naive - off * 60000;
  return new Date(t);
}

/** Minutes after London midnight of `day` for an instant. */
export function londonMinutes(date: Date): number {
  const p = londonParts(date);
  return p.hh * 60 + p.mm + p.ss / 60;
}

export function dayKey(day: LocalDay): string {
  return `${day.y}-${String(day.m).padStart(2, '0')}-${String(day.d).padStart(2, '0')}`;
}

export function parseDayKey(key: string): LocalDay | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}

export function londonToday(now: Date = new Date()): LocalDay {
  const p = londonParts(now);
  return { y: p.y, m: p.m, d: p.d };
}

/** "13:02" in London time. */
export function formatLondonTime(date: Date): string {
  const p = londonParts(date);
  return `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
}

/** "BST" or "GMT" at an instant. */
export function londonZoneName(date: Date): string {
  return londonOffsetMinutes(date) === 0 ? 'GMT' : 'BST';
}

/** "13:02" from minutes after midnight. */
export function formatMinutes(min: number): string {
  const t = Math.round(min);
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * Unit vector from a point in the flat towards the sun, in plan axes
 * (x right, y down the plan) plus up. Uses PLAN_UP_BEARING.
 */
export function sunPlanDirection(azimuthDeg: number, elevationDeg: number): { x: number; y: number; z: number } {
  const rel = (azimuthDeg - PLAN_UP_BEARING) * RAD;
  const el = elevationDeg * RAD;
  const c = Math.cos(el);
  // Plan up is (0, -1); rotating it clockwise on screen by `rel` gives (sin rel, -cos rel).
  return { x: Math.sin(rel) * c, y: -Math.cos(rel) * c, z: Math.sin(el) };
}

const WORDS = [
  'north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east',
  'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west',
];
/** "south-south-east" for a bearing. */
export function compassWords(deg: number): string {
  return WORDS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
