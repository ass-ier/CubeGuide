/// <reference lib="webworker" />
import { isFace } from '../types';
import { fromFacelets } from '../validation';
import type { SolveRequest, SolveResponse } from './protocol';
import { solveCube } from './solve';

const worker = self as DedicatedWorkerGlobalScope;
const send = (response: SolveResponse) => worker.postMessage(response);

worker.onmessage = (event: MessageEvent<SolveRequest>) => {
  const { requestId, facelets, type } = event.data;
  if (type !== 'solve') return;
  try {
    if (typeof facelets !== 'string') throw new Error('Expected a facelet string.');
    const stickers = facelets.split('');
    if (!stickers.every(isFace)) throw new Error('Unrecognized facelet in solver input.');
    const cube = fromFacelets(stickers);
    const result = solveCube(cube, (phase) => send({ type: 'phase', requestId, phase }));
    send({ type: 'result', requestId, moves: result.moves, computationMs: result.computationMs });
  } catch (error) {
    send({
      type: 'error', requestId,
      message: error instanceof Error ? error.message : 'An unknown solver error occurred. No solution was accepted.',
    });
  }
};
