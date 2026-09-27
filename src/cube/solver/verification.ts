import { immutableCube, isSolved } from '../model';
import { applyMove } from '../moves';
import { isMove, type CubeState, type Move } from '../types';

export interface SolutionMetrics {
  readonly moves: number;
  readonly quarterTurns: number;
  readonly doubleTurns: number;
  readonly quarterTurnMetric: number;
}

export interface VerifiedSolution {
  readonly moves: readonly Move[];
  readonly snapshots: readonly CubeState[];
  readonly metrics: SolutionMetrics;
  readonly computationMs: number;
}

export function verifySolution(original: CubeState, moves: readonly Move[], computationMs = 0): VerifiedSolution {
  if (moves.length > 1000 || !moves.every(isMove)) {
    throw new Error('Internal solver error: the returned move sequence is malformed. No solution was accepted.');
  }
  const snapshots: CubeState[] = [immutableCube(original)];
  for (const move of moves) snapshots.push(applyMove(snapshots[snapshots.length - 1], move));
  if (!isSolved(snapshots[snapshots.length - 1])) {
    throw new Error('Internal solver verification failed: replaying the returned moves did not solve the original cube. No solution was accepted.');
  }
  const doubleTurns = moves.filter((move) => move.turns === 2).length;
  const quarterTurns = moves.length - doubleTurns;
  return Object.freeze({
    moves: Object.freeze(moves.map((move) => Object.freeze({ ...move }))),
    snapshots: Object.freeze(snapshots),
    metrics: Object.freeze({ moves: moves.length, doubleTurns, quarterTurns, quarterTurnMetric: quarterTurns + doubleTurns * 2 }),
    computationMs,
  });
}
