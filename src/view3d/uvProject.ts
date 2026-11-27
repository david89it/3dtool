// Box-projected texture coordinates in metres. Furniture parts are plain
// boxes and cylinders whose own UVs run 0 to 1 per face, which would stretch
// a wood grain or a weave differently on every piece. This gives every
// triangle UVs from its world position, projected along the axis its normal
// points most along, so a texture keeps the same scale and direction on
// every piece (and the grain runs along the long way of a plank).

import * as THREE from 'three';

/** Replace the UVs of a non-indexed geometry (already in world position) with box-projected metres. */
export function boxProjectUVs(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  if (!pos || !nor) return g;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = x;
      v = z; // top and bottom faces
    } else if (ax >= az) {
      u = z;
      v = y; // faces looking along x
    } else {
      u = x;
      v = y; // faces looking along z
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
