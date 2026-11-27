// "Save a photo": draws the view she is looking at once more, much larger,
// with the full ambient-occlusion pass and extra smoothing, and hands back a
// PNG. It runs on the live canvas (so it matches the view exactly) and puts
// the canvas back the way it was afterwards, so the screen never flickers to
// a different size for longer than the one frame the picture takes.

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { makeComposer } from './postfx';

/** Width in pixels of a saved photo for each quality level. */
export const PHOTO_WIDTH = { fast: 1920, beautiful: 3840 } as const;

export interface PhotoRequest {
  width: number;
  msaa: number;
  /** Resolves to a PNG, or null when the picture could not be made. */
  done: (png: Blob | null) => void;
}

/** Set by <PhotoRig/> while the 3D view is open. */
export const photoBridge: { shoot: ((req: PhotoRequest) => void) | null } = { shoot: null };

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export function PhotoRig() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const shoot = async (req: PhotoRequest) => {
      const prevSize = gl.getSize(new THREE.Vector2());
      const prevRatio = gl.getPixelRatio();
      let rig: ReturnType<typeof makeComposer> | null = null;
      try {
        const aspect = prevSize.x / Math.max(1, prevSize.y);
        const width = Math.min(req.width, gl.capabilities.maxTextureSize);
        const height = Math.max(1, Math.round(width / aspect));
        gl.setPixelRatio(1);
        gl.setSize(width, height, false);
        rig = makeComposer(gl, scene, camera, width, height, { msaa: req.msaa, aoSamples: 32 });
        rig.composer.render();
        req.done(await toBlob(gl.domElement));
      } catch {
        req.done(null);
      } finally {
        rig?.composer.dispose();
        rig?.ao.dispose();
        gl.setPixelRatio(prevRatio);
        gl.setSize(prevSize.x, prevSize.y, false);
      }
    };
    photoBridge.shoot = (req) => void shoot(req);
    return () => {
      photoBridge.shoot = null;
    };
  }, [gl, scene, camera]);
  return null;
}

/** Ask the open 3D view for a photo. Resolves to null when 3D is not open or drawing failed. */
export function takePhoto(width: number, msaa: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!photoBridge.shoot) return resolve(null);
    photoBridge.shoot({ width, msaa, done: resolve });
  });
}
