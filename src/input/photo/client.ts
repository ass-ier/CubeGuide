import { isColor, isFace } from '../../cube/types';
import { validateColors } from '../../cube/validation';
import type { CapturedFace, FaceReading, PhotoAssembly } from './automatic';
import type { Pixels } from './geometry';
import type { PhotoJob, PhotoWorker } from './protocol';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const rgb = (value: unknown) => Array.isArray(value) && value.length === 3
  && value.every((channel) => typeof channel === 'number' && Number.isFinite(channel) && channel >= 0 && channel <= 255);

function isReading(value: unknown): value is FaceReading {
  return record(value) && isColor(value.center)
    && Array.isArray(value.samples) && value.samples.length === 9 && value.samples.every(rgb)
    && Array.isArray(value.provisional) && value.provisional.length === 9 && value.provisional.every((color) => color === null || isColor(color))
    && typeof value.confidence === 'number' && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1
    && Array.isArray(value.quad) && value.quad.length === 4 && value.quad.every((point) => record(point)
      && typeof point.x === 'number' && Number.isFinite(point.x) && point.x >= 0 && point.x <= 1024
      && typeof point.y === 'number' && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1024)
    && record(value.thumbnail) && Number.isInteger(value.thumbnail.width) && Number.isInteger(value.thumbnail.height)
    && typeof value.thumbnail.width === 'number' && value.thumbnail.width >= 32 && value.thumbnail.width <= 256
    && typeof value.thumbnail.height === 'number' && value.thumbnail.height >= 32 && value.thumbnail.height <= 256
    && value.thumbnail.data instanceof Uint8ClampedArray && value.thumbnail.data.length === value.thumbnail.width * value.thumbnail.height * 4;
}

function isAssembly(value: unknown): value is PhotoAssembly {
  if (!record(value)) return false;
  if (value.ok === true) return Array.isArray(value.stickers) && value.stickers.length === 54 && value.stickers.every(isColor)
    && Array.isArray(value.rotations) && value.rotations.length === 6 && value.rotations.every((turns) => Number.isInteger(turns) && turns >= 0 && turns <= 3);
  return value.ok === false && record(value.problem) && typeof value.problem.code === 'string'
    && ['incomplete', 'center', 'duplicate-center', 'unclear', 'invalid-cube', 'orientation'].includes(value.problem.code)
    && typeof value.problem.message === 'string' && Array.isArray(value.problem.faces) && value.problem.faces.every(isFace)
    && (value.problem.details === undefined || Array.isArray(value.problem.details) && value.problem.details.every((detail) => typeof detail === 'string'));
}

export class PhotoClient {
  private worker: PhotoWorker | null = null;
  private requestId = 0;
  private pending: { reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor(
    private readonly createWorker: () => PhotoWorker = () =>
      new Worker(new URL('./photo.worker.ts', import.meta.url), { type: 'module' }),
    private readonly timeoutMs = 20_000,
  ) {}

  cancel(): void {
    this.requestId++;
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending.reject(new DOMException('Photo processing cancelled. Accepted photos are preserved.', 'AbortError'));
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
  }

  dispose(): void {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }

  read(image: Pixels): Promise<FaceReading> {
    if (!(image.data.buffer instanceof ArrayBuffer)) return Promise.reject(new Error('This photo buffer is not supported. Choose another image.'));
    return this.run({ type: 'read', image }, (output) => {
      if (!isReading(output)) throw new Error('Photo processing returned malformed data. No photo was accepted.');
      return output;
    }, [image.data.buffer]);
  }

  assemble(photos: readonly CapturedFace[]): Promise<PhotoAssembly> {
    return this.run({ type: 'assemble', photos }, (output) => {
      if (!isAssembly(output)) throw new Error('Photo checking returned malformed data. No cube was accepted.');
      if (output.ok && !validateColors(output.stickers).ok) throw new Error('Photo checking failed independent physical validation. No cube was accepted.');
      return output;
    });
  }

  private run<T>(job: PhotoJob, parse: (output: unknown) => T, transfer: Transferable[] = []): Promise<T> {
    this.cancel();
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const fail = (error: Error) => {
        if (id !== this.requestId) return;
        if (this.pending) clearTimeout(this.pending.timer);
        this.pending = null;
        this.worker?.terminate();
        this.worker = null;
        reject(error);
      };
      const timer = setTimeout(() => fail(new Error('Photo processing took too long. Your accepted photos are preserved; try a clearer image.')), this.timeoutMs);
      this.pending = { reject, timer };
      try {
        this.worker ??= this.createWorker();
        this.worker.onerror = (event) => {
          event.preventDefault();
          fail(new Error(`Photo processing could not run: ${event.message || 'worker unavailable'}. Try again or enter colors manually.`));
        };
        this.worker.onmessage = ({ data }) => {
          if (id !== this.requestId || !this.pending || !record(data) || data.requestId !== id) return;
          try {
            if (data.type === 'error' && typeof data.message === 'string') fail(new Error(data.message));
            else if (data.type === 'result') {
              const result = parse(data.output);
              clearTimeout(timer);
              this.pending = null;
              resolve(result);
            } else fail(new Error('Photo processing returned an unrecognized response. Your accepted photos are preserved.'));
          } catch (error) {
            fail(error instanceof Error ? error : new Error('The photo response could not be checked. No photo was accepted.'));
          }
        };
        this.worker.postMessage({ ...job, requestId: id }, transfer);
      } catch (error) {
        fail(error instanceof Error ? error : new Error('Photo processing is unavailable. Use manual color entry.'));
      }
    });
  }
}
