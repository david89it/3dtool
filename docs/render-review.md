# 3D render review

There was no rendering agent or photo feature. The 3D view (`src/view3d/`) used flat lights, no environment, untextured furniture boxes, a hard-edged 2048 shadow and a grey-green ground. The print pack has an offscreen overview renderer (`Offscreen3D.tsx`), now given the same lighting.

Screenshots (software renderer, 1100x720, June afternoon sun, demo furniture added to the first floor):
- `render/before-overview.png`, `render/after-overview.png`
- `render/before-walk.png` (an awkward spawn), `render/after-walk-reception.png`

## Findings, by payoff
1. Flat lighting: no image-based light, so timber, tile, metal and glass looked matte. Fixed with a generated room environment map.
2. No contact shading: furniture floated. Fixed with GTAO ambient occlusion (Beautiful).
3. Furniture was untextured sharp boxes. Fixed with grain, weave and speckle bump maps, clearcoat on joinery, ceramic and screens, metal at 0.95 metalness, and 6 mm rounded edges (Beautiful).
4. Shadows: hard 2048 map. Now 1024 (Fast) or 4096 soft (Beautiful), fitted to the flat as before.
5. Ground and horizon: distance haze in the sky colour, a neutral paving tone.
6. Glass is a physical material with a clear coat, so it reflects the room.
7. No way to save a good picture: added *Save a photo (PNG)* (1920 px Fast, 3840 px Beautiful, 32-sample AO).

## Not done
Per-room default camera angles (frame-room exists), glass transmission, sun shafts, a real sky dome. Shots came from a software renderer, so real GPUs will look smoother.

## Performance
Fast adds only the environment map (one-off) and textures. Beautiful adds a normal pre-pass, GTAO, 4x multisampling and a larger shadow map, roughly 2x frame cost; it defaults off on touch devices.
