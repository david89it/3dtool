import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PROFILES } from './quality';
import { boxProjectUVs } from './uvProject';

describe('quality profiles', () => {
  it('Beautiful turns on the expensive effects and Fast does not', () => {
    expect(PROFILES.fast.ao).toBe(false);
    expect(PROFILES.fast.bevelMm).toBe(0);
    expect(PROFILES.beautiful.ao).toBe(true);
    expect(PROFILES.beautiful.shadowMap).toBeGreaterThan(PROFILES.fast.shadowMap);
  });
});

describe('boxProjectUVs', () => {
  it('gives UVs in metres from world position', () => {
    const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    g.translate(2, 0.5, 3);
    boxProjectUVs(g);
    const uv = g.getAttribute('uv');
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(nor.getY(i)) > 0.9) {
        expect(uv.getX(i)).toBeCloseTo(pos.getX(i));
        expect(uv.getY(i)).toBeCloseTo(pos.getZ(i));
      }
    }
  });
});
