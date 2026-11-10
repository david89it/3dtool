// A hand-made RoomPlan-style scan for tests: two rooms (4 m and 3 m wide,
// 3 m deep) sharing a wall, a door in the shared wall and a window in the
// bottom wall, the whole scan turned 20° and moved, as a phone would leave
// it. Units are metres, Y up, like a RoomPlan export.

function boxMesh(name: string, w: number, h: number, d: number): string {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const p = [
    [-x, -y, -z],
    [x, -y, -z],
    [x, y, -z],
    [-x, y, -z],
    [-x, -y, z],
    [x, -y, z],
    [x, y, z],
    [-x, y, z],
  ];
  const f = [0, 1, 2, 3, 4, 7, 6, 5, 0, 4, 5, 1, 3, 2, 6, 7, 0, 3, 7, 4, 1, 5, 6, 2];
  return `def Mesh "${name}"
        {
          point3f[] points = [${p.map((q) => `(${q.join(', ')})`).join(', ')}]
          int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]
          int[] faceVertexIndices = [${f.join(', ')}]
        }`;
}

/** USD row-vector transform: rotate about Y by `deg`, then translate. */
function xform(deg: number, tx: number, ty: number, tz: number): string {
  const a = (deg * Math.PI) / 180;
  const c = +Math.cos(a).toFixed(9);
  const s = +Math.sin(a).toFixed(9);
  return `matrix4d xformOp:transform = ( (${c}, 0, ${-s}, 0), (0, 1, 0, 0), (${s}, 0, ${c}, 0), (${tx}, ${ty}, ${tz}, 1) )
        uniform token[] xformOpOrder = ["xformOp:transform"]`;
}

interface Prim {
  name: string;
  /** Centre in the room's frame (x, y up, z). */
  at: [number, number, number];
  /** Direction: 0 = along x, 90 = along z. */
  deg: number;
  size: [number, number, number]; // along, height, thickness
}

const WALLS: Prim[] = [
  { name: 'Wall0', at: [3.5, 1.25, 0], deg: 0, size: [7, 2.5, 0.1] },
  { name: 'Wall1', at: [3.5, 1.25, 3], deg: 0, size: [7, 2.5, 0.1] },
  { name: 'Wall2', at: [0, 1.25, 1.5], deg: 90, size: [3, 2.5, 0.1] },
  { name: 'Wall3', at: [7, 1.25, 1.5], deg: 90, size: [3, 2.5, 0.1] },
  { name: 'Wall4', at: [4, 1.25, 1.5], deg: 90, size: [3, 2.5, 0.1] },
];
const DOORS: Prim[] = [{ name: 'Door0', at: [4, 1.0, 1.0], deg: 90, size: [0.8, 2.0, 0.1] }];
const WINDOWS: Prim[] = [{ name: 'Window0', at: [2, 1.5, 3], deg: 0, size: [1.2, 1.2, 0.1] }];

function prim(p: Prim): string {
  // Rotating about Y by -deg turns local +x towards +z for deg = 90.
  return `def Xform "${p.name}"
      {
        ${xform(-p.deg, p.at[0], p.at[1], p.at[2])}
        ${boxMesh(p.name, p.size[0], p.size[1], p.size[2])}
      }`;
}

export function fixtureUsda(): string {
  return `#usda 1.0
(
    defaultPrim = "Room"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Room"
{
  ${xform(20, 5, 0, -2)}
  def Xform "Arch_grp"
  {
    def Xform "Wall_grp"
    {
      ${WALLS.map(prim).join('\n      ')}
    }
    def Xform "Door_grp"
    {
      ${DOORS.map(prim).join('\n      ')}
    }
    def Xform "Window_grp"
    {
      ${WINDOWS.map(prim).join('\n      ')}
    }
  }
}
`;
}

/** A small DXF: a 4 × 3 m rectangle as an LWPOLYLINE plus one LINE, in metres. */
export function fixtureDxf(): string {
  const rows: (string | number)[] = [
    0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC',
    0, 'SECTION', 2, 'ENTITIES',
    0, 'LWPOLYLINE', 8, 'WALLS', 90, 4, 70, 1, 10, 0, 20, 0, 10, 4, 20, 0, 10, 4, 20, 3, 10, 0, 20, 3,
    0, 'LINE', 8, 'WALLS', 10, 2, 20, 0, 11, 2, 21, 3,
    0, 'CIRCLE', 8, 'X', 10, 1, 20, 1, 40, 0.5,
    0, 'ENDSEC', 0, 'EOF',
  ];
  return rows.join('\n');
}
