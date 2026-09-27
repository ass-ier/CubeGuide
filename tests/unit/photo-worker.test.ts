import { describe, expect, it, vi } from 'vitest';
import { solvedCube, toColors } from '../../src/cube/model';
import { FACES, PRACTICE_SCHEME } from '../../src/cube/types';
import { readAutomaticFace } from '../../src/input/photo/automatic';
import { PhotoClient } from '../../src/input/photo/client';
import type { PhotoRequest, PhotoWorker } from '../../src/input/photo/protocol';
import { fixturePhoto, PIGMENTS } from '../fixtures/photo';

class FakePhotoWorker implements PhotoWorker {
  onmessage: PhotoWorker['onmessage'] = null;
  onerror: PhotoWorker['onerror'] = null;
  requests: PhotoRequest[] = [];
  transfers: Transferable[][] = [];
  terminated = false;
  postMessage(request: PhotoRequest, transfer: Transferable[]) { this.requests.push(request); this.transfers.push(transfer); }
  terminate() { this.terminated = true; }
  result(output: unknown, requestId = this.requests.at(-1)?.requestId) {
    this.onmessage?.({ data: { type: 'result', requestId, output } } as MessageEvent<unknown>);
  }
}

const photo = () => fixturePhoto([{ x: 25, y: 25, size: 100, colors: Array(9).fill('green') }], 160, 160);
const reading = readAutomaticFace(photo());
const colors = toColors(solvedCube(), PRACTICE_SCHEME);
const captures = FACES.map((face, i) => ({ face, samples: colors.slice(i * 9, i * 9 + 9).map((color) => PIGMENTS[color]) }));

describe('photo worker lifecycle and boundaries', () => {
  it('transfers the bounded pixel buffer and accepts a correctly shaped detected face', async () => {
    const worker = new FakePhotoWorker(), client = new PhotoClient(() => worker), pixels = photo();
    const result = client.read(pixels);
    expect(worker.requests[0].type).toBe('read');
    expect(worker.transfers[0]).toEqual([pixels.data.buffer]);
    worker.result(reading);
    expect((await result).center).toBe('green');
    client.dispose();
    expect(worker.terminated).toBe(true);
  });

  it('cancels superseded work and ignores a late result', async () => {
    const workers: FakePhotoWorker[] = [];
    const client = new PhotoClient(() => { const worker = new FakePhotoWorker(); workers.push(worker); return worker; });
    const first = client.read(photo());
    const aborted = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = client.read(photo());
    workers[0].result(reading);
    workers[1].result(reading);
    await aborted;
    expect(workers[0].terminated).toBe(true);
    expect((await second).center).toBe('green');
    client.dispose();
  });

  it('rejects malformed centers, sample arrays and preview buffers', async () => {
    for (const output of [{ ...reading, center: 'purple' }, { ...reading, samples: [] }, { ...reading, thumbnail: { width: 168, height: 168, data: [] } }]) {
      const worker = new FakePhotoWorker(), client = new PhotoClient(() => worker);
      const result = client.read(photo());
      const rejected = expect(result).rejects.toThrow('malformed');
      worker.result(output);
      await rejected;
      expect(worker.terminated).toBe(true);
    }
  });

  it('independently rejects a success-shaped physically impossible reconstruction', async () => {
    const worker = new FakePhotoWorker(), client = new PhotoClient(() => worker);
    const result = client.assemble(captures);
    const rejected = expect(result).rejects.toThrow('physical validation');
    const impossible = [...colors];
    [impossible[7], impossible[19]] = [impossible[19], impossible[7]];
    worker.result({ ok: true, stickers: impossible, rotations: [0, 0, 0, 0, 0, 0] });
    await rejected;
  });

  it('preserves explicit ambiguity errors rather than returning an arbitrary cube', async () => {
    const worker = new FakePhotoWorker(), client = new PhotoClient(() => worker);
    const result = client.assemble(captures);
    const output = { ok: false, problem: { code: 'orientation', message: 'More than one valid reading. Retake the face.', faces: ['F'] } };
    worker.result(output);
    expect(await result).toEqual(output);
    client.dispose();
  });

  it('bounds expensive processing and reports a retryable timeout', async () => {
    vi.useFakeTimers();
    const worker = new FakePhotoWorker(), client = new PhotoClient(() => worker, 100);
    const result = client.read(photo());
    const rejected = expect(result).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(101);
    await rejected;
    expect(worker.terminated).toBe(true);
    vi.useRealTimers();
  });
});
