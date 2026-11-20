// The picture of the plan for a report, and the clipboard helpers. A picture cannot go inside an
// email link, so she copies it (and pastes it into the email) or downloads it and attaches it.

import { useStore } from '../model/store';
import { canvasApi } from '../editor2d/canvasApi';

/** A PNG of the floor she is looking at, or null when there is nothing to draw (or it cannot be drawn). */
export async function makePlanPicture(): Promise<string | null> {
  try {
    const s = useStore.getState();
    let url = s.mode !== '3d' ? canvasApi.exportPng() : null;
    if (!url) url = await canvasApi.renderLevelImage(s.levelId, { width: 1400, height: 900, pixelRatio: 1 });
    return url || null;
  } catch {
    return null;
  }
}

export function dataUrlToBlob(url: string): Blob {
  const [head, data = ''] = url.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/png';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Copy a PNG so it can be pasted into an email. False when the browser will not allow it. */
export async function copyPicture(dataUrl: string): Promise<boolean> {
  try {
    const Item = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (!Item || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new Item({ 'image/png': dataUrlToBlob(dataUrl) })]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy text. Tries the clipboard first; if the browser refuses, tries the old copy command on the
 * given box. Returns 'copied', or 'select' when the text is selected in the box and she must press
 * Ctrl/⌘ C herself.
 */
export async function copyText(text: string, box: HTMLTextAreaElement | null): Promise<'copied' | 'select'> {
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    // fall through to the old way
  }
  if (box) {
    box.focus();
    box.select();
    try {
      if (document.execCommand('copy')) return 'copied';
    } catch {
      // select-and-copy by hand
    }
  }
  return 'select';
}
