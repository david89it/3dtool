import type { Level } from '../model/types';

export function blankLevel(): Level {
  return { id: 'l', name: 'Test', elevation: 0, ceilingHeight: 2500, nodes: [], walls: [], rooms: [], items: [], stairs: [] };
}
