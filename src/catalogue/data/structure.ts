// Catalogue items: structure.
import type { CatalogueItem } from '../../model/types';
import { slab } from '../parts';
import { front } from './helpers';

export const STRUCTURE_ITEMS: CatalogueItem[] = [
  {
    id: 'radiator',
    name: 'Radiator',
    aliases: ['heater', 'rad', 'convector', 'panel radiator', 'column radiator'],
    category: 'structure',
    defaultDims: { w: 1000, d: 110, h: 750 },
    resizable: { w: [400, 2000], h: [300, 1800] },
    mount: 'wall',
    geometry: [slab(0, 150, 0, 1000, 600, 90, 'white')],
    clearance: [front(150, 300, 'Keep clear so the heat gets into the room')],
    rules: [],
  },
  {
    id: 'chimney-breast',
    name: 'Chimney breast',
    aliases: ['chimney', 'chimney breast', 'breast', 'flue', 'stack', 'chimney block'],
    category: 'structure',
    // A solid masonry box against a wall, up to the ceiling. Set the height to the ceiling height.
    defaultDims: { w: 1500, d: 350, h: 2700 },
    resizable: { w: [400, 3000], d: [100, 900], h: [1000, 4000] },
    mount: 'wall',
    geometry: [slab(0, 0, 0, 1500, 2700, 350, 'masonry')],
    clearance: [],
    rules: ['door-swing', 'window-obstruction'],
    measureNote: 'Measure me: how far it sticks out, how wide it is, and which side the flue is on. Sizes here are a guess from the plan and photos.',
  },
  {
    id: 'fireplace',
    name: 'Fireplace and hearth',
    aliases: ['fire', 'fire surround', 'wood burner', 'log burner', 'stove', 'mantelpiece'],
    category: 'structure',
    defaultDims: { w: 1400, d: 550, h: 1150 },
    resizable: { w: [900, 1800] },
    mount: 'floor',
    geometry: [slab(0, 0, 100, 1400, 40, 350, 'stone'), slab(0, 0, -150, 1400, 1100, 250, 'plaster'), slab(0, 1100, -100, 1500, 50, 350, 'wood'), slab(0, 40, -40, 600, 600, 30, 'dark')],
    clearance: [front(500, 900, 'Hearth: keep anything that burns well back')],
    rules: [],
  },
  {
    id: 'column',
    name: 'Column or pillar',
    aliases: ['pillar', 'post', 'pier', 'steel column', 'boxed-in pipe'],
    category: 'structure',
    defaultDims: { w: 300, d: 300, h: 2700 },
    resizable: { w: [100, 800], d: [100, 800], h: [1000, 3500] },
    mount: 'floor',
    geometry: [slab(0, 0, 0, 300, 2700, 300, 'plaster')],
    clearance: [],
    rules: [],
  },
  {
    id: 'boiler-wall',
    name: 'Boiler (wall-hung)',
    aliases: ['boiler', 'combi', 'combi boiler'],
    category: 'structure',
    defaultDims: { w: 450, d: 350, h: 2000 },
    resizable: {},
    mount: 'wall',
    geometry: [slab(0, 1300, 0, 450, 700, 350, 'white')],
    clearance: [front(600, 1000, 'Access for servicing')],
    rules: [],
  },
];
