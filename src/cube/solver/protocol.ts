import type { Move } from '../types';
import type { SolverPhase } from './solve';

export interface SolveRequest {
  readonly type: 'solve';
  readonly requestId: number;
  readonly facelets: string;
}

export type SolveResponse =
  | { readonly type: 'phase'; readonly requestId: number; readonly phase: SolverPhase }
  | { readonly type: 'result'; readonly requestId: number; readonly moves: readonly Move[]; readonly computationMs: number }
  | { readonly type: 'error'; readonly requestId: number; readonly message: string };

export interface SolverWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: SolveRequest): void;
  terminate(): void;
}
