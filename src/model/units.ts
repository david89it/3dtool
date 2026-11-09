// Millimetres inside, metres/centimetres or feet/inches outside.

export type UnitSystem = 'metric' | 'imperial';
/** How a bare number she types is read: as a room-scale length or as a thickness. */
export type LengthContext = 'length' | 'small';

const MM_PER_IN = 25.4;

export function formatLength(mm: number, sys: UnitSystem, ctx: LengthContext = 'length'): string {
  if (!Number.isFinite(mm)) return '–';
  if (sys === 'metric') {
    if (ctx === 'length' && Math.abs(mm) >= 1000) return `${(mm / 1000).toFixed(2)} m`;
    return `${Math.round(mm / 10)} cm`;
  }
  const totalIn = mm / MM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) {
    ft += 1;
    inch = 0;
  }
  if (ft === 0) return `${inch}″`;
  return `${ft}′ ${inch}″`;
}

export function formatArea(mm2: number, sys: UnitSystem): string {
  if (sys === 'metric') return `${(mm2 / 1e6).toFixed(1)} m²`;
  return `${Math.round(mm2 / (304.8 * 304.8))} sq ft`;
}

export function formatScale(mmPerPx: number): string {
  return `1 image pixel = ${mmPerPx >= 10 ? mmPerPx.toFixed(1) : mmPerPx.toFixed(2)} mm`;
}

/**
 * Read what she typed. Accepts "3.32", "3,32 m", "332cm", "3320 mm",
 * "10' 11\"", "10ft 11in", "131\"". A bare number is read in the unit the
 * value was shown in, with sanity fallbacks (a 332 m wall is 332 cm).
 * Returns millimetres, or null if it cannot be read.
 */
export function parseLength(text: string, sys: UnitSystem, ctx: LengthContext = 'length'): number | null {
  const s = text.trim().toLowerCase().replace(/,/g, '.').replace(/[′’]/g, "'").replace(/[″”]/g, '"');
  if (!s) return null;
  const num = '(\\d+(?:\\.\\d+)?|\\.\\d+)';

  let m = s.match(new RegExp(`^${num}\\s*(?:'|ft|feet|foot)\\s*(?:${num}\\s*(?:"|in|inch|inches)?)?$`));
  if (m) return (parseFloat(m[1]) * 12 + (m[2] ? parseFloat(m[2]) : 0)) * MM_PER_IN;
  m = s.match(new RegExp(`^${num}\\s*(?:"|in|inch|inches)$`));
  if (m) return parseFloat(m[1]) * MM_PER_IN;
  m = s.match(new RegExp(`^${num}\\s*(mm|cm|m)$`));
  if (m) {
    const val = parseFloat(m[1]);
    return m[2] === 'mm' ? val : m[2] === 'cm' ? val * 10 : val * 1000;
  }
  m = s.match(new RegExp(`^${num}$`));
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (sys === 'imperial') return ctx === 'length' ? val * 12 * MM_PER_IN : val * MM_PER_IN;
  if (ctx === 'length') {
    if (val <= 50) return val * 1000;
    if (val <= 1000) return val * 10;
    return val;
  }
  return val < 100 ? val * 10 : val;
}
