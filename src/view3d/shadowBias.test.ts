import { describe, expect, it } from 'vitest';
import { biasForTexel, texelSize } from './shadowBias';
import { tokenMaterial, tintedMaterial } from './materials';
import * as THREE from 'three';

describe('shadow bias follows the texel size', () => {
  it('a bigger frustum or a smaller map means bigger texels', () => {
    expect(texelSize(-10, 10, -5, 5, 1024)).toBeCloseTo(20 / 1024, 9);
    expect(texelSize(-10, 10, -5, 5, 4096)).toBeLessThan(texelSize(-10, 10, -5, 5, 1024));
    expect(texelSize(0, 10, 0, 30, 1024)).toBeCloseTo(30 / 1024, 9);
    expect(texelSize(0, 10, 0, 10, 0)).toBe(0);
  });

  it('pushes the lookup out by about two texels, within sane limits', () => {
    expect(biasForTexel(0.02).normalBias).toBeCloseTo(0.04, 9);
    expect(biasForTexel(0).normalBias).toBe(0.01);
    expect(biasForTexel(5).normalBias).toBe(0.12);
    expect(biasForTexel(0.02).bias).toBeLessThan(0);
  });
});

describe('pieces win depth ties against walls', () => {
  it('piece materials are pulled towards the camera so a flush face does not flicker', () => {
    for (const m of [tokenMaterial('masonry'), tintedMaterial('masonry', '#ccddee')] as THREE.Material[]) {
      expect(m.polygonOffset).toBe(true);
      expect(m.polygonOffsetFactor).toBeLessThan(0);
      expect(m.polygonOffsetUnits).toBeLessThan(0);
    }
  });
});
