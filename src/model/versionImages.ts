// Underlay pictures are big and repeat between versions: each one is stored once under its hash.
import type { Project } from './types';


export const IMG_PREFIX = 'img:';

/** SHA-256 of a string as hex. Falls back to a plain hash where WebCrypto is missing (http pages). */
export async function hashString(s: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `f${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}${s.length.toString(16)}`;
}

/**
 * Copy of the plan with each underlay image replaced by `img:<hash>`.
 * `put` is called once for each distinct image so the caller can store it.
 */
export async function externalizeImages(
  project: Project,
  put: (hash: string, dataUrl: string) => Promise<void> | void,
): Promise<{ project: Project; images: string[] }> {
  const seen = new Map<string, string>(); // data url -> hash
  const images: string[] = [];
  const levels = [];
  for (const l of project.levels) {
    const url = l.underlay?.imageDataUrl;
    if (!l.underlay || !url || url.startsWith(IMG_PREFIX)) {
      levels.push(l);
      continue;
    }
    let hash = seen.get(url);
    if (!hash) {
      hash = await hashString(url);
      seen.set(url, hash);
      images.push(hash);
      await put(hash, url);
    }
    levels.push({ ...l, underlay: { ...l.underlay, imageDataUrl: IMG_PREFIX + hash } });
  }
  return { project: { ...project, levels }, images };
}

/** Swap `img:<hash>` references back for the images. An image that is gone drops that floor's picture. */
export async function restoreImages(
  project: Project,
  fetchImage: (hash: string) => Promise<string | undefined>,
): Promise<{ project: Project; missing: number }> {
  let missing = 0;
  const cache = new Map<string, string | undefined>();
  const levels = [];
  for (const l of project.levels) {
    const ref = l.underlay?.imageDataUrl;
    if (!l.underlay || !ref || !ref.startsWith(IMG_PREFIX)) {
      levels.push(l);
      continue;
    }
    const hash = ref.slice(IMG_PREFIX.length);
    if (!cache.has(hash)) cache.set(hash, await fetchImage(hash));
    const url = cache.get(hash);
    if (url) levels.push({ ...l, underlay: { ...l.underlay, imageDataUrl: url } });
    else {
      missing++;
      const { underlay: _gone, ...rest } = l;
      void _gone;
      levels.push(rest);
    }
  }
  return { project: { ...project, levels }, missing };
}
