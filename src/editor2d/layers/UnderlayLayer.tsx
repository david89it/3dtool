import { useEffect, useState } from 'react';
import { Image as KImage } from 'react-konva';
import type { Underlay } from '../../model/types';
import { underlaySize } from '../view';

const cache = new Map<string, HTMLImageElement>();

export function useHtmlImage(src: string | undefined): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement | undefined>(() => (src ? cache.get(src) : undefined));
  useEffect(() => {
    if (!src) {
      setImg(undefined);
      return;
    }
    const hit = cache.get(src);
    if (hit) {
      setImg(hit);
      return;
    }
    const el = new window.Image();
    el.onload = () => {
      cache.set(src, el);
      underlaySize.set(src, { w: el.naturalWidth, h: el.naturalHeight });
      setImg(el);
    };
    el.src = src;
  }, [src]);
  return img;
}

export function UnderlayImage({ underlay }: { underlay: Underlay }) {
  const img = useHtmlImage(underlay.imageDataUrl);
  if (!img) return null;
  return (
    <KImage
      image={img}
      x={underlay.offset.x}
      y={underlay.offset.y}
      scaleX={underlay.scaleMmPerPx}
      scaleY={underlay.scaleMmPerPx}
      rotation={underlay.rotationDeg}
      opacity={underlay.opacity}
      listening={false}
    />
  );
}
