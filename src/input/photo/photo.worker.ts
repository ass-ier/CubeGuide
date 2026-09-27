/// <reference lib="webworker" />
import { assemblePhotos, readAutomaticFace } from './automatic';
import type { PhotoRequest, PhotoResponse } from './protocol';

const worker = self as DedicatedWorkerGlobalScope;
const send = (response: PhotoResponse) => worker.postMessage(response);

worker.onmessage = ({ data }: MessageEvent<PhotoRequest>) => {
  const { requestId } = data;
  try {
    const output = data.type === 'read' ? readAutomaticFace(data.image) : assemblePhotos(data.photos);
    send({ type: 'result', requestId, output });
  } catch (error) {
    send({
      type: 'error', requestId,
      message: error instanceof Error ? error.message : 'The photo could not be read. Retake this face or use manual entry.',
    });
  }
};
