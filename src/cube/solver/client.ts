import { cubeKey } from '../model';
import { isMove, type CubeState } from '../types';
import type { SolverWorker } from './protocol';
import type { SolverPhase } from './solve';
import { verifySolution, type VerifiedSolution } from './verification';

interface PendingRequest {
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export class SolverClient {
  private worker: SolverWorker | null = null;
  private requestId = 0;
  private pending: PendingRequest | null = null;

  constructor(
    private readonly createWorker: () => SolverWorker = () =>
      new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' }),
    private readonly timeoutMs = 120_000,
  ) {}

  cancel(): void {
    this.requestId++;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new DOMException('Solving was cancelled because the cube changed.', 'AbortError'));
      this.pending = null;
      this.worker?.terminate();
      this.worker = null;
    }
  }

  dispose(): void {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }

  solve(original: CubeState, onPhase: (phase: SolverPhase) => void): Promise<VerifiedSolution> {
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
      const timer = setTimeout(() => fail(new Error('The solver exceeded two minutes. Your entry is preserved. Try solving again.')), this.timeoutMs);
      this.pending = { reject, timer };
      try {
        this.worker ??= this.createWorker();
        this.worker.onerror = (event) => {
          event.preventDefault();
          fail(new Error(`The solver worker could not run: ${event.message || 'worker initialization failed'}. Your entry is preserved; try again.`));
        };
        this.worker.onmessage = ({ data }) => {
          if (id !== this.requestId || !this.pending) return;
          if (typeof data !== 'object' || data === null || !('requestId' in data) || data.requestId !== id) return;
          try {
            if (!('type' in data)) throw new Error('The solver returned an unrecognized response.');
            if (data.type === 'phase' && 'phase' in data
              && (data.phase === 'initializing' || data.phase === 'solving' || data.phase === 'verifying')) {
              onPhase(data.phase);
            } else if (data.type === 'error' && 'message' in data && typeof data.message === 'string') {
              fail(new Error(data.message));
            } else if (data.type === 'result' && 'moves' in data && Array.isArray(data.moves)
              && data.moves.every(isMove) && 'computationMs' in data && typeof data.computationMs === 'number'
              && Number.isFinite(data.computationMs) && data.computationMs >= 0) {
              onPhase('verifying');
              // Do not trust even our worker: independently replay against this request's original.
              const solution = verifySolution(original, data.moves, data.computationMs);
              clearTimeout(timer);
              this.pending = null;
              resolve(solution);
            } else {
              throw new Error('The solver returned malformed data. No solution was accepted.');
            }
          } catch (error) {
            fail(error instanceof Error ? error : new Error('Could not verify the solver response.'));
          }
        };
        onPhase('initializing');
        this.worker.postMessage({ type: 'solve', requestId: id, facelets: cubeKey(original) });
      } catch (error) {
        fail(error instanceof Error ? error : new Error('Web Workers are not available in this browser.'));
      }
    });
  }
}
