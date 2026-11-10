// Minimal ASCII DXF reader: LINE, LWPOLYLINE and POLYLINE/VERTEX entities,
// with $INSUNITS for the drawing unit (millimetres if it isn't set).
// DXF is y-up; the plan is y-down, so y is flipped.

export interface DxfResult {
  segments: [number, number, number, number][]; // plan mm
  unitsLabel: string;
}

const UNIT_MM: Record<number, [number, string]> = {
  0: [1, 'millimetres (not set in the file)'],
  1: [25.4, 'inches'],
  2: [304.8, 'feet'],
  4: [1, 'millimetres'],
  5: [10, 'centimetres'],
  6: [1000, 'metres'],
};

export function parseDxf(text: string): DxfResult {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push([code, lines[i + 1].trim()]);
  }
  if (pairs.length === 0) throw new Error('This file does not look like a DXF drawing.');

  // Units.
  let unit = 0;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0] === 9 && pairs[i][1] === '$INSUNITS') {
      const next = pairs[i + 1];
      if (next && next[0] === 70) unit = parseInt(next[1], 10);
      break;
    }
  }
  const [k, unitsLabel] = UNIT_MM[unit] ?? UNIT_MM[0];

  const segs: [number, number, number, number][] = [];
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    if (![x1, y1, x2, y2].every(Number.isFinite)) return;
    if (x1 === x2 && y1 === y2) return;
    segs.push([x1 * k, -y1 * k, x2 * k, -y2 * k]);
  };

  // Walk entities: each starts with a (0, TYPE) pair.
  let i = 0;
  while (i < pairs.length) {
    const [code, value] = pairs[i];
    if (code !== 0) {
      i++;
      continue;
    }
    // Collect this entity's pairs.
    let j = i + 1;
    while (j < pairs.length && pairs[j][0] !== 0) j++;
    const body = pairs.slice(i + 1, j);
    const num = (c: number) => {
      const p = body.find((x) => x[0] === c);
      return p ? parseFloat(p[1]) : NaN;
    };
    if (value === 'LINE') {
      add(num(10), num(20), num(11), num(21));
    } else if (value === 'LWPOLYLINE') {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [c, v] of body) {
        if (c === 10) xs.push(parseFloat(v));
        if (c === 20) ys.push(parseFloat(v));
      }
      const closed = (num(70) & 1) === 1;
      for (let n = 0; n + 1 < xs.length; n++) add(xs[n], ys[n], xs[n + 1], ys[n + 1]);
      if (closed && xs.length > 2) add(xs[xs.length - 1], ys[ys.length - 1], xs[0], ys[0]);
    } else if (value === 'POLYLINE') {
      const closed = (num(70) & 1) === 1;
      const pts: [number, number][] = [];
      let m = j;
      while (m < pairs.length && !(pairs[m][0] === 0 && pairs[m][1] === 'SEQEND')) {
        if (pairs[m][0] === 0 && pairs[m][1] === 'VERTEX') {
          let e = m + 1;
          let x = NaN;
          let y = NaN;
          while (e < pairs.length && pairs[e][0] !== 0) {
            if (pairs[e][0] === 10) x = parseFloat(pairs[e][1]);
            if (pairs[e][0] === 20) y = parseFloat(pairs[e][1]);
            e++;
          }
          pts.push([x, y]);
          m = e;
        } else m++;
      }
      for (let n = 0; n + 1 < pts.length; n++) add(pts[n][0], pts[n][1], pts[n + 1][0], pts[n + 1][1]);
      if (closed && pts.length > 2) add(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]);
      j = m;
    }
    i = j;
  }
  if (segs.length === 0) throw new Error('No lines found in this drawing. Export the floor plan as lines or polylines.');
  return { segments: segs, unitsLabel };
}
