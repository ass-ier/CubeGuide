import { MAX_FILE_BYTES, MAX_IMAGE_SIDE, validatePhotoFile } from './decode';
import type { Pixels } from './geometry';

export interface PhotoImage extends Pixels { readonly url: string; readonly name: string }

function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Photo operation cancelled.', 'AbortError');
}

async function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (blob) resolve(blob); else reject(new Error('The browser could not prepare the photo preview. Try another image or use manual entry.'));
  }, 'image/png'));
}

export async function previewFromPixels(pixels: Pixels, name: string, signal: AbortSignal): Promise<PhotoImage> {
  checkAbort(signal);
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot read photo pixels. Use manual color entry.');
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
  const blob = await blobFromCanvas(canvas);
  checkAbort(signal);
  return { ...pixels, url: URL.createObjectURL(blob), name };
}

async function fallbackImage(file: File, signal: AbortSignal): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      const abort = () => { image.src = ''; reject(new DOMException('Photo operation cancelled.', 'AbortError')); };
      const cleanup = () => signal.removeEventListener('abort', abort);
      signal.addEventListener('abort', abort, { once: true });
      image.onload = () => { cleanup(); resolve(image); };
      image.onerror = () => { cleanup(); reject(new Error('This photo could not be decoded. It may be corrupt or unsupported; choose another JPEG, PNG, or WebP.')); };
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

export async function loadPhoto(file: File, signal: AbortSignal): Promise<PhotoImage> {
  if (file.size > MAX_FILE_BYTES) throw new Error('The photo exceeds 16 MB. Choose a smaller image; your entered colors are unchanged.');
  checkAbort(signal);
  const bytes = new Uint8Array(await file.arrayBuffer());
  validatePhotoFile(bytes, file.type);
  checkAbort(signal);
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = typeof createImageBitmap === 'function'
      ? await createImageBitmap(file, { imageOrientation: 'from-image' })
      : await fallbackImage(file, signal);
  } catch (error) {
    checkAbort(signal);
    throw new Error(`The photo could not be decoded. It may be corrupt or unsupported. ${error instanceof Error ? error.message : 'Try another image.'}`);
  }
  try {
    checkAbort(signal);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Photo analysis is unavailable in this browser. Use the manual sticker grids.');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const blob = await blobFromCanvas(canvas);
    checkAbort(signal);
    return { width: canvas.width, height: canvas.height, data, url: URL.createObjectURL(blob), name: file.name };
  } finally {
    if ('close' in source) source.close();
  }
}
