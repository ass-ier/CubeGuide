import type { CapturedFace, FaceReading, PhotoAssembly } from './automatic';
import type { Pixels } from './geometry';

export type PhotoJob =
  | { readonly type: 'read'; readonly image: Pixels }
  | { readonly type: 'assemble'; readonly photos: readonly CapturedFace[] };

export type PhotoRequest = PhotoJob & { readonly requestId: number };
export type PhotoResponse =
  | { readonly type: 'result'; readonly requestId: number; readonly output: FaceReading | PhotoAssembly }
  | { readonly type: 'error'; readonly requestId: number; readonly message: string };

export interface PhotoWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: PhotoRequest, transfer: Transferable[]): void;
  terminate(): void;
}
