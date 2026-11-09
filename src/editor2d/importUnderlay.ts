// Turn a PNG, JPG or PDF (page 1) into an image data URL for the underlay.

const MAX_SIDE = 4000;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
}

async function pdfToDataUrl(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, MAX_SIDE / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const url = canvas.toDataURL('image/png');
  await task.destroy();
  return url;
}

export interface ImportedImage {
  dataUrl: string;
  width: number;
  height: number;
}

function measure(dataUrl: string): Promise<ImportedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('That image could not be opened.'));
    img.src = dataUrl;
  });
}

export async function importPlanFile(file: File): Promise<ImportedImage> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) return measure(await pdfToDataUrl(file));
  if (!file.type.startsWith('image/')) throw new Error('Please choose a PNG, JPG or PDF file.');
  return measure(await readAsDataUrl(file));
}
