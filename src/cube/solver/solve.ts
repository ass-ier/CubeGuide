import Cube from 'cubejs';
import { cubeKey, isSolved } from '../model';
import { parseAlgorithm } from '../notation';
import type { CubeState } from '../types';
import { fromFacelets } from '../validation';
import { toFacelets } from '../model';
import { verifySolution, type VerifiedSolution } from './verification';

export type SolverPhase = 'initializing' | 'solving' | 'verifying';
let initialized = false;

export function initializeSolver(): void {
  if (!initialized) {
    Cube.initSolver();
    initialized = true;
  }
}

// Import this module only in a worker (or Node tests), never in UI code.
export function solveCube(cube: CubeState, onPhase: (phase: SolverPhase) => void = () => {}): VerifiedSolution {
  fromFacelets(toFacelets(cube));
  const started = performance.now();
  if (isSolved(cube)) return verifySolution(cube, [], performance.now() - started);
  if (!initialized) {
    onPhase('initializing');
    initializeSolver();
  }
  onPhase('solving');
  const notation = Cube.fromString(cubeKey(cube)).solve(22);
  if (typeof notation !== 'string') throw new Error('The two-phase solver did not return a solution.');
  onPhase('verifying');
  return verifySolution(cube, parseAlgorithm(notation), performance.now() - started);
}
