// "Beautiful" post-processing: the scene is drawn into a multisampled
// half-float target, ambient occlusion (GTAO, from three.js itself, so no new
// dependency) darkens corners, creases and the ground under furniture, and
// the output pass applies tone mapping and the sRGB conversion. Only mounted
// in Beautiful quality; Fast draws straight to the screen.

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface PostOptions {
  /** Multisample count of the render target (0 for none). */
  msaa: number;
  /** AO sample count: more is smoother and slower. */
  aoSamples: number;
}

/** Build a composer for `scene` at `width` x `height` device pixels. The caller disposes it. */
export function makeComposer(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  opts: PostOptions,
): { composer: EffectComposer; ao: GTAOPass } {
  const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: opts.msaa });
  const composer = new EffectComposer(gl, target);
  composer.setPixelRatio(1);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, width, height);
  ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: opts.aoSamples, distanceFallOff: 1 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
  ao.blendIntensity = 0.9;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  return { composer, ao };
}

/** Takes over drawing the canvas each frame while mounted. */
export function BeautifulPost({ msaa, aoSamples = 16 }: { msaa: number; aoSamples?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  const built = useMemo(
    () => makeComposer(gl, scene, camera, Math.max(1, Math.round(size.width * dpr)), Math.max(1, Math.round(size.height * dpr)), { msaa, aoSamples }),
    // The camera object is stable; size changes are handled below without a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gl, scene, msaa, aoSamples],
  );

  useEffect(() => {
    built.composer.setSize(Math.max(1, Math.round(size.width * dpr)), Math.max(1, Math.round(size.height * dpr)));
  }, [built, size.width, size.height, dpr]);

  useEffect(
    () => () => {
      built.composer.dispose();
      built.ao.dispose();
    },
    [built],
  );

  // Priority above zero tells react-three-fiber that this component does the drawing.
  useFrame(() => built.composer.render(), 1);
  return null;
}
