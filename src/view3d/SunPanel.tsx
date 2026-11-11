import { useEffect, useMemo, useRef } from 'react';
import type { Level, Project } from '../model/types';
import { activeLevels } from '../model/schemes';
import { PUBLIC_BUILD } from '../model/firstRun';
import { compassWords, dayKey, formatLondonTime, londonInstant, londonToday, londonZoneName, PLAN_UP_BEARING, parseDayKey } from './sun';
import { currentSun, dayInfo, useSunUi, type SunScope } from './sunState';
import { formatHours, heatColor, SunHoursJob, sunDates } from './sunHours';

const PLAY_MS = 12000;
const MODE_LABEL = PUBLIC_BUILD ? 'Real sun for this flat' : 'Real sun at 18B Balmore Street';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

function presets() {
  const t = londonToday();
  return [
    { id: 'today', label: 'Today', key: dayKey(t) },
    { id: 'winter', label: 'Midwinter 21 Dec', key: dayKey({ y: t.y, m: 12, d: 21 }) },
    { id: 'equinox', label: 'Equinox 20 Mar', key: dayKey({ y: t.y, m: 3, d: 20 }) },
    { id: 'summer', label: 'Midsummer 21 Jun', key: dayKey({ y: t.y, m: 6, d: 21 }) },
  ];
}

/** The Daylight section of the 3D panel: real sun, date and time, play, and sun hours. */
export function SunPanel({
  project,
  level,
  lightsOn,
  onLights,
}: {
  project: Project;
  level: Level;
  lightsOn: boolean;
  onLights: (on: boolean) => void;
}) {
  const ui = useSunUi();
  const { set } = ui;
  const info = useMemo(() => dayInfo(ui.day), [ui.day]);
  const pausedRef = useRef(false);
  const list = useMemo(presets, []);
  const sun = currentSun(ui);
  const instant = parseDayKey(ui.day) ? londonInstant(info.day, ui.minutes) : new Date();

  // Play the day: sunrise to sunset in about 12 seconds.
  useEffect(() => {
    if (!ui.playing) return;
    let raf = 0;
    let last = performance.now();
    const span = Math.max(1, info.sunsetMin - info.sunriseMin);
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const next = useSunUi.getState().minutes + (span * dt) / PLAY_MS;
      if (next >= info.sunsetMin) {
        pausedRef.current = false;
        set({ minutes: info.sunsetMin, playing: false });
        return;
      }
      set({ minutes: next });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ui.playing, info.sunriseMin, info.sunsetMin, set]);

  // Stop everything when leaving 3D.
  useEffect(
    () => () => {
      useSunUi.getState().set({ playing: false });
    },
    [],
  );

  const setDay = (key: string) => {
    if (!parseDayKey(key)) return;
    const di = dayInfo(key);
    pausedRef.current = false;
    set({ day: key, playing: false, minutes: Math.min(di.sunsetMin, Math.max(di.sunriseMin, ui.minutes)) });
  };
  const togglePlay = () => {
    if (ui.playing) {
      pausedRef.current = true;
      set({ playing: false });
      return;
    }
    if (!pausedRef.current || ui.minutes >= info.sunsetMin - 1) set({ minutes: info.sunriseMin });
    pausedRef.current = false;
    set({ playing: true });
  };

  return (
    <section className="panel-section" aria-label="Daylight">
      <h2>Daylight</h2>
      <div className="radio-list" role="radiogroup" aria-label="Sun">
        <label className="toggle">
          <input type="radio" name="sun-mode" checked={ui.mode === 'real'} onChange={() => set({ mode: 'real' })} data-testid="sun-real" />
          {MODE_LABEL}
        </label>
        <label className="toggle">
          <input type="radio" name="sun-mode" checked={ui.mode === 'manual'} onChange={() => set({ mode: 'manual', playing: false })} data-testid="sun-manual" />
          Manual
        </label>
      </div>

      {ui.mode === 'manual' ? (
        <>
          <label className="slider">
            <span className="field-label">
              Sun from the {compass(ui.manualAzimuth)} ({Math.round(ui.manualAzimuth)}°)
            </span>
            <input type="range" min={0} max={359} value={ui.manualAzimuth} aria-label="Sun direction" onChange={(e) => set({ manualAzimuth: +e.target.value })} />
          </label>
          <label className="slider">
            <span className="field-label">
              Sun height {Math.round(ui.manualElevation)}°{ui.manualElevation <= 0 ? ' (night)' : ''}
            </span>
            <input type="range" min={-10} max={75} value={ui.manualElevation} aria-label="Sun height" onChange={(e) => set({ manualElevation: +e.target.value })} />
          </label>
        </>
      ) : (
        <>
          <div className="room-chips" role="radiogroup" aria-label="Date">
            {list.map((p) => (
              <button key={p.id} role="radio" aria-checked={ui.day === p.key} className={ui.day === p.key ? 'chip on' : 'chip'} onClick={() => setDay(p.key)} data-testid={`sun-date-${p.id}`}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="slider">
            <span className="field-label">Date</span>
            <input type="date" value={ui.day} aria-label="Date" data-testid="sun-date-input" onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="slider">
            <span className="field-label" data-testid="sun-time">
              {formatLondonTime(instant)} {londonZoneName(instant)} · sun {Math.round(sun.elevationDeg)}° high, from the {compass(sun.azimuthDeg)}
              {sun.elevationDeg <= 0 ? ' (night)' : ''}
            </span>
            <input
              type="range"
              min={info.sunriseMin}
              max={info.sunsetMin}
              step={1}
              value={Math.round(ui.minutes)}
              aria-label="Time of day"
              data-testid="sun-time-slider"
              onChange={(e) => {
                pausedRef.current = false;
                set({ minutes: +e.target.value, playing: false });
              }}
            />
          </label>
          <p className="note">
            Sunrise {info.sunrise ? formatLondonTime(info.sunrise) : '—'} · sunset {info.sunset ? formatLondonTime(info.sunset) : '—'}.
          </p>
          <button className="btn" onClick={togglePlay} data-testid="sun-play">
            {ui.playing ? 'Pause' : 'Play the day'}
          </button>
        </>
      )}
      <p className="note">
        The front (bay window) faces {compassWords(PLAN_UP_BEARING + 180)}. Low winter sun is about 15°, midsummer noon about 62°.
        {PLAN_UP_BEARING === 330 ? ' The plan direction comes from the agent’s north arrow, so check it with a compass at the flat.' : ''}
      </p>
      <label className="toggle">
        <input type="checkbox" checked={lightsOn} onChange={(e) => onLights(e.target.checked)} />
        Ceiling lights on
      </label>
      <SunHours project={project} level={level} />
    </section>
  );
}

/** Sun hours for each room on four dates, with an optional floor heatmap. */
function SunHours({ project, level }: { project: Project; level: Level }) {
  const calc = useSunUi((s) => s.calc);
  const heatOn = useSunUi((s) => s.heatOn);
  const heatDate = useSunUi((s) => s.heatDate);
  const set = useSunUi((s) => s.set);
  const timer = useRef<number | null>(null);
  const job = useRef<SunHoursJob | null>(null);

  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    job.current?.dispose();
    job.current = null;
  };
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (scope: SunScope) => {
    stop();
    const measured = scope === 'all' ? activeLevels(project) : [level];
    set({ calc: { status: 'running', progress: 0, scope, result: null } });
    // Let the progress bar appear before the first slice of work.
    timer.current = window.setTimeout(() => {
      const j = new SunHoursJob(measured, project, sunDates());
      job.current = j;
      const slice = () => {
        const finished = j.step(12);
        if (finished) {
          set({ calc: { status: 'done', progress: 1, scope, result: j.result } });
          j.dispose();
          job.current = null;
          timer.current = null;
        } else {
          set({ calc: { status: 'running', progress: j.progress, scope, result: null } });
          timer.current = window.setTimeout(slice, 0);
        }
      };
      slice();
    }, 30);
  };

  const result = calc.result;
  const stale = !!result && result.levels.some((l) => !project.levels.includes(l));
  const maxHeat = result ? Math.max(1, ...result.rooms.flatMap((r) => r.pointHours[heatDate] ?? [])) : 1;

  return (
    <div className="sun-hours">
      <h3>Sun hours</h3>
      <p className="note">Direct sun on the floor of each room, from sunrise to sunset, through its windows and openings.</p>
      <div className="sun-actions">
        <button className="btn" disabled={calc.status === 'running'} onClick={() => run('floor')} data-testid="sun-hours">
          Sun hours: {level.name}
        </button>
        <button className="btn" disabled={calc.status === 'running'} onClick={() => run('all')} data-testid="sun-hours-all">
          All floors
        </button>
      </div>
      {calc.status === 'running' && (
        <div className="sun-progress" role="status">
          <progress value={calc.progress} max={1} aria-label="Working out sun hours" />
          <span>Working it out… {Math.round(calc.progress * 100)}%</span>
          <button className="btn small" onClick={() => { stop(); set({ calc: { status: 'idle', progress: 0, scope: calc.scope, result: null } }); }}>
            Stop
          </button>
        </div>
      )}
      {result && calc.status === 'done' && (
        <>
          {result.rooms.length === 0 ? (
            <p className="note">There are no closed rooms to measure yet.</p>
          ) : (
            <table className="sun-table" data-testid="sun-table">
              <thead>
                <tr>
                  <th scope="col">Room</th>
                  {result.dates.map((d) => (
                    <th key={d.id} scope="col">
                      {d.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rooms.map((r, i) => (
                  <tr key={`${r.levelId}-${i}`}>
                    <th scope="row">
                      {r.roomName}
                      {calc.scope === 'all' && <span className="sun-floor">{r.levelName}</span>}
                    </th>
                    {r.hours.map((h, k) => (
                      <td key={k}>{formatHours(h)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Daylight</th>
                  {result.daylight.map((h, k) => (
                    <td key={k}>{formatHours(h)}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          )}
          <p className="note">Ignores neighbouring buildings and trees, so real sun will be less.</p>
          {stale && <p className="badge-amber">The plan has changed since this was worked out. Run it again.</p>}
          <label className="toggle">
            <input type="checkbox" checked={heatOn} onChange={(e) => set({ heatOn: e.target.checked })} data-testid="sun-heat" />
            Show on the floor ({level.name})
          </label>
          {heatOn && (
            <>
              <div className="room-chips" role="radiogroup" aria-label="Date for the floor map">
                {result.dates.map((d, k) => (
                  <button key={d.id} role="radio" aria-checked={heatDate === k} className={heatDate === k ? 'chip on' : 'chip'} onClick={() => set({ heatDate: k })}>
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="sun-legend" aria-label="Colour scale">
                <span
                  className="sun-ramp"
                  style={{ background: `linear-gradient(90deg, ${[0, 0.5, 1].map((t) => `rgb(${heatColor(t).map((c) => Math.round(c * 255)).join(',')})`).join(', ')})` }}
                />
                <span className="sun-ramp-labels">
                  <span>No sun</span>
                  <span>{formatHours(maxHeat)} of sun</span>
                </span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
