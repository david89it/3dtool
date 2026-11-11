// What the Daylight panel has chosen: real sun or manual, the date and time,
// and the sun-hours results. Kept outside React state (and outside the
// project store, so it is never saved or undone) so that moving the time
// slider or playing the day updates the light without re-rendering the scene.

import { create } from 'zustand';
import type { SunHoursResult } from './sunHours';
import {
  dayKey,
  londonMinutes,
  londonToday,
  parseDayKey,
  solarPosition,
  sunTimes,
  londonInstant,
  type LocalDay,
  type SunPosition,
} from './sun';

export type SunMode = 'real' | 'manual';
export type SunScope = 'floor' | 'all';

export interface SunCalc {
  status: 'idle' | 'running' | 'done';
  /** 0 to 1 while running. */
  progress: number;
  scope: SunScope;
  result: SunHoursResult | null;
}

export interface SunUi {
  mode: SunMode;
  /** YYYY-MM-DD in London. */
  day: string;
  /** Minutes after London midnight (may be fractional while playing). */
  minutes: number;
  playing: boolean;
  manualAzimuth: number;
  manualElevation: number;
  heatOn: boolean;
  /** Index into the four dates of the sun-hours table. */
  heatDate: number;
  calc: SunCalc;
  set: (p: Partial<Omit<SunUi, 'set'>>) => void;
}

export interface DayInfo {
  day: LocalDay;
  sunriseMin: number;
  sunsetMin: number;
  noonMin: number;
  sunrise: Date | null;
  sunset: Date | null;
}

export function dayInfo(key: string): DayInfo {
  const day = parseDayKey(key) ?? londonToday();
  const t = sunTimes(day);
  return {
    day,
    sunrise: t.sunrise,
    sunset: t.sunset,
    sunriseMin: t.sunrise ? Math.floor(londonMinutes(t.sunrise)) : 0,
    sunsetMin: t.sunset ? Math.ceil(londonMinutes(t.sunset)) : 1439,
    noonMin: Math.round(londonMinutes(t.solarNoon)),
  };
}

const today = dayKey(londonToday());

export const useSunUi = create<SunUi>()((set) => ({
  mode: 'real',
  day: today,
  minutes: dayInfo(today).noonMin,
  playing: false,
  manualAzimuth: 200,
  manualElevation: 35,
  heatOn: false,
  heatDate: 2,
  calc: { status: 'idle', progress: 0, scope: 'floor', result: null },
  set: (p) => set(p),
}));

/** The sun for the current choices. */
export function currentSun(s: Pick<SunUi, 'mode' | 'day' | 'minutes' | 'manualAzimuth' | 'manualElevation'>): SunPosition {
  if (s.mode === 'manual') return { azimuthDeg: s.manualAzimuth, elevationDeg: s.manualElevation };
  const day = parseDayKey(s.day) ?? londonToday();
  return solarPosition(londonInstant(day, s.minutes));
}
