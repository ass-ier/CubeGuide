import { describe, expect, it, vi } from 'vitest';
import { solvedCube } from '../../src/cube/model';
import { applyAlgorithm } from '../../src/cube/moves';
import { parseAlgorithm } from '../../src/cube/notation';
import { SolverClient } from '../../src/cube/solver/client';
import type { SolveRequest, SolverWorker } from '../../src/cube/solver/protocol';

class FakeWorker implements SolverWorker {
  onmessage: SolverWorker['onmessage'] = null;
  onerror: SolverWorker['onerror'] = null;
  requests: SolveRequest[] = [];
  terminated = false;
  postMessage(request: SolveRequest) { this.requests.push(request); }
  terminate() { this.terminated = true; }
  result(moves: ReturnType<typeof parseAlgorithm>, requestId = this.requests.at(-1)!.requestId) {
    this.onmessage?.({ data: { type: 'result', requestId, moves, computationMs: 10 } } as MessageEvent);
  }
}

describe('worker isolation, errors and races', () => {
  it('verifies responses independently against the original request', async () => {
    const worker = new FakeWorker();
    const client = new SolverClient(() => worker);
    const promise = client.solve(applyAlgorithm(solvedCube(), parseAlgorithm('R')), () => {});
    worker.result(parseAlgorithm("R'"));
    expect((await promise).moves).toEqual(parseAlgorithm("R'"));
    client.dispose();
  });

  it('rejects a worker result that does not actually solve the original cube', async () => {
    const worker = new FakeWorker();
    const client = new SolverClient(() => worker);
    const promise = client.solve(applyAlgorithm(solvedCube(), parseAlgorithm('R')), () => {});
    const assertion = expect(promise).rejects.toThrow('verification failed');
    worker.result(parseAlgorithm('U'));
    await assertion;
    expect(worker.terminated).toBe(true);
  });

  it('cancels changed input, terminates expensive work and ignores late results', async () => {
    const workers: FakeWorker[] = [];
    const client = new SolverClient(() => { const worker = new FakeWorker(); workers.push(worker); return worker; });
    const first = client.solve(solvedCube(), () => {});
    const aborted = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = client.solve(applyAlgorithm(solvedCube(), parseAlgorithm('U')), () => {});
    workers[0].result([]);
    workers[1].result(parseAlgorithm("U'"));
    await aborted;
    expect(workers[0].terminated).toBe(true);
    expect((await second).moves).toEqual(parseAlgorithm("U'"));
    client.dispose();
  });

  it('rejects malformed worker data with a visible error rather than accepting it', async () => {
    const worker = new FakeWorker();
    const client = new SolverClient(() => worker);
    const promise = client.solve(solvedCube(), () => {});
    const assertion = expect(promise).rejects.toThrow('malformed');
    worker.onmessage?.({ data: { type: 'result', requestId: worker.requests[0].requestId, moves: [{ face: 'X', turns: 1 }], computationMs: 2 } } as MessageEvent);
    await assertion;
  });

  it('terminates a stalled worker with a retryable timeout', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const client = new SolverClient(() => worker, 100);
    const promise = client.solve(solvedCube(), () => {});
    const assertion = expect(promise).rejects.toThrow('exceeded two minutes');
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
    expect(worker.terminated).toBe(true);
    vi.useRealTimers();
  });
});
