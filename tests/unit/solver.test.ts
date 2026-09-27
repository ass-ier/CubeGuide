import { beforeAll, describe, expect, it } from 'vitest';
import Cube from 'cubejs';
import { cubeKey, isSolved, solvedCube, toColors } from '../../src/cube/model';
import { applyAlgorithm } from '../../src/cube/moves';
import { parseAlgorithm } from '../../src/cube/notation';
import { generateScramble } from '../../src/cube/scramble';
import { initializeSolver, solveCube } from '../../src/cube/solver/solve';
import { verifySolution } from '../../src/cube/solver/verification';
import { COLORS, FACES, isFace, PRACTICE_SCHEME, type ColorScheme } from '../../src/cube/types';
import { fromFacelets, validateColors } from '../../src/cube/validation';
import { seededRandom } from './helpers';

beforeAll(() => initializeSolver());

describe('established two-phase solver, not inverse-scramble solving', () => {
  it('solves 120 deterministic legal scrambles through manual color/center entry', () => {
    const random = seededRandom(0xc0ffee);
    for (let i = 0; i < 120; i++) {
      const original = applyAlgorithm(solvedCube(), generateScramble(25 + (i % 16), random));
      const scheme = Object.fromEntries(FACES.map((face, j) => [face, COLORS[(i + j) % 6]])) as ColorScheme;
      const entry = validateColors(toColors(original, scheme));
      expect(entry.ok).toBe(true);
      if (!entry.ok) throw new Error('Generated legal color entry failed validation.');
      const solution = solveCube(entry.cube);
      expect(isSolved(applyAlgorithm(original, solution.moves))).toBe(true);
      expect(solution.snapshots[0]).toEqual(original);
      expect(solution.snapshots).toHaveLength(solution.moves.length + 1);
      expect(isSolved(solution.snapshots.at(-1)!)).toBe(true);
      expect(cubeKey(original)).toBe(cubeKey(entry.cube));
    }
  });

  it('solves 24 fresh cryptographically random 25-move scrambles', () => {
    for (let i = 0; i < 24; i++) {
      const original = applyAlgorithm(solvedCube(), generateScramble());
      const result = validateColors(toColors(original, PRACTICE_SCHEME));
      if (!result.ok) throw new Error('Fresh scramble did not round-trip through colors.');
      const solution = solveCube(result.cube);
      expect(isSolved(applyAlgorithm(original, solution.moves))).toBe(true);
    }
  });

  it('solves 16 random cubie states from the independent library, with no scramble history', () => {
    for (let i = 0; i < 16; i++) {
      const libraryCube = Cube.random();
      const facelets = libraryCube.asString().split('');
      if (!facelets.every(isFace)) throw new Error('Unexpected library facelet format.');
      const original = fromFacelets(facelets);
      const solution = solveCube(original);
      expect(isSolved(applyAlgorithm(original, solution.moves))).toBe(true);
      expect(Cube.fromString(cubeKey(original)).move(solution.moves.map((m) => `${m.face}${m.turns === 2 ? '2' : m.turns === -1 ? "'" : ''}`).join(' ')).isSolved()).toBe(true);
    }
  });

  it('returns an empty verified solution for an already solved cube', () => {
    const solution = solveCube(solvedCube());
    expect(solution.moves).toEqual([]);
    expect(solution.snapshots).toEqual([solvedCube()]);
  });

  it('refuses incorrect solutions at runtime', () => {
    const original = applyAlgorithm(solvedCube(), parseAlgorithm('R U F'));
    expect(() => verifySolution(original, parseAlgorithm("F' U'"))).toThrow('verification failed');
  });

  it('freezes every snapshot and counts both turn metrics correctly', () => {
    const solution = verifySolution(
      applyAlgorithm(solvedCube(), parseAlgorithm('R2 U')),
      parseAlgorithm("U' R2"),
    );
    expect(solution.metrics).toEqual({ moves: 2, quarterTurns: 1, doubleTurns: 1, quarterTurnMetric: 3 });
    expect(Object.isFrozen(solution.moves)).toBe(true);
    expect(Object.isFrozen(solution.moves[0])).toBe(true);
    expect(Object.isFrozen(solution.snapshots)).toBe(true);
    for (const snapshot of solution.snapshots) {
      expect(Object.isFrozen(snapshot)).toBe(true);
      for (const values of Object.values(snapshot)) expect(Object.isFrozen(values)).toBe(true);
    }
  });
});
