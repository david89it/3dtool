import { describe, expect, it } from 'vitest';
import { ceilingFinishId, findFinish, findSurface, FLOOR_FINISHES, leaseHint, surfaceColor, wallFaceFinishId, woodworkHex } from './finishes';

describe('finish resolution', () => {
  const room = { name: 'Reception', wallFinish: 'paint-sage' };

  it('a face override beats the room finish, which beats the default', () => {
    expect(wallFaceFinishId(room, { faces: { L: '#5a2a3a' } }, 'L')).toBe('#5a2a3a');
    expect(wallFaceFinishId(room, { faces: { L: '#5a2a3a' } }, 'R')).toBe('paint-sage');
    expect(wallFaceFinishId(room, {}, 'L')).toBe('paint-sage');
    expect(wallFaceFinishId({ name: 'Bedroom 1' }, {}, 'R')).toBe('wall-white');
    expect(wallFaceFinishId({ name: 'Bathroom' }, {}, 'R')).toBe('wall-tile-white');
    expect(wallFaceFinishId(undefined, { faces: { R: 'paint-inky-blue' } }, 'R')).toBe('paint-inky-blue');
    expect(wallFaceFinishId(undefined, {}, 'L')).toBe('wall-white');
  });

  it('ceilings are white and woodwork is the standard white unless chosen', () => {
    expect(ceilingFinishId({})).toBe('paint-chalk-white');
    expect(ceilingFinishId({ ceilingFinish: '#aabbcc' })).toBe('#aabbcc');
    expect(woodworkHex({})).toBeUndefined();
    expect(woodworkHex({ woodworkColor: 'paint-aubergine' })).toBe('#5a2a3a');
    expect(woodworkHex({ woodworkColor: '#ABCDEF' })).toBe('#abcdef');
  });

  it('finds any finish value: finish ids, paint ids and hex', () => {
    expect(findSurface('floor-oak')?.name).toBe('Oak boards');
    expect(findSurface('paint-sage')?.color).toBe('#b7c2a7');
    expect(surfaceColor('#5A2A3A')).toBe('#5a2a3a');
    expect(findSurface('nonsense')).toBeUndefined();
  });
});

describe('new floors and the lease hint', () => {
  const get = (id: string) => findFinish(id, FLOOR_FINISHES)!;

  it('adds the five new floors with unique ids', () => {
    for (const id of ['floor-herringbone', 'floor-chevron', 'floor-encaustic', 'floor-sisal', 'floor-rubber']) expect(get(id), id).toBeTruthy();
    expect(new Set(FLOOR_FINISHES.map((f) => f.id)).size).toBe(FLOOR_FINISHES.length);
  });

  it('rubber is fine in the kitchen and bathroom, and gets the plain note elsewhere', () => {
    expect(leaseHint('Kitchen', get('floor-rubber'))).toBeNull();
    expect(leaseHint('Bathroom', get('floor-rubber'))).toBeNull();
    expect(leaseHint('Bedroom 1', get('floor-rubber'))).toContain('carpet');
  });

  it('hard floors outside the kitchen and bathroom keep the carpet note; carpet has none', () => {
    for (const id of ['floor-herringbone', 'floor-chevron', 'floor-encaustic']) {
      expect(leaseHint('Reception', get(id))).toContain('carpet');
      expect(leaseHint('Kitchen', get(id))).toContain('cork or rubber');
    }
    expect(leaseHint('Reception', get('floor-carpet-grey'))).toBeNull();
    expect(leaseHint('Reception', get('floor-sisal'))).toContain('Sisal');
  });
});
