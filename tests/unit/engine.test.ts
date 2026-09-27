import { describe, expect, it } from 'vitest';
import Cube from 'cubejs';
import { cubeKey, isSolved, solvedCube, toColors, toFacelets } from '../../src/cube/model';
import { applyAlgorithm, applyMove } from '../../src/cube/moves';
import { formatAlgorithm, inverseAlgorithm, inverseMove, parseAlgorithm, parseMove } from '../../src/cube/notation';
import { generateScramble } from '../../src/cube/scramble';
import { COLORS, FACES, PRACTICE_SCHEME, type ColorScheme, type Turns } from '../../src/cube/types';
import { fromFacelets, validateColors } from '../../src/cube/validation';
import { seededRandom } from './helpers';

describe('all Singmaster moves', () => {
  for (const face of FACES) {
    for (const turns of [1, -1, 2] as const) {
      it(`${face}/${turns} matches independent cubejs facelets and is invertible`, () => {
        const move = { face, turns };
        const actual = applyMove(solvedCube(), move);
        expect(cubeKey(actual)).toBe(new Cube().move(formatAlgorithm([move])).asString());
        expect(applyMove(actual, inverseMove(move))).toEqual(solvedCube());
        expect(fromFacelets(toFacelets(actual))).toEqual(actual);
      });
    }
    it(`${face} has a four-quarter-turn identity and a two-half-turn identity`, () => {
      expect(isSolved(applyAlgorithm(solvedCube(), parseAlgorithm(`${face} ${face} ${face} ${face}`)))).toBe(true);
      expect(isSolved(applyAlgorithm(solvedCube(), parseAlgorithm(`${face}2 ${face}2`)))).toBe(true);
      expect(cubeKey(applyAlgorithm(solvedCube(), parseAlgorithm(`${face} ${face}`))))
        .toBe(cubeKey(applyMove(solvedCube(), { face, turns: 2 })));
    });
  }

  it('clockwise F maps the up bottom row to the right left column', () => {
    const result = toFacelets(applyMove(solvedCube(), parseMove('F')));
    expect([9, 12, 15].map((index) => result[index])).toEqual(['U', 'U', 'U']);
  });

  it('parses all moves strictly and never guesses unsupported notation', () => {
    const notation = FACES.flatMap((face) => ['', "'", '2'].map((suffix) => `${face}${suffix}`)).join(' ');
    expect(formatAlgorithm(parseAlgorithm(notation))).toBe(notation);
    expect(parseAlgorithm(' \n ')).toEqual([]);
    for (const bad of ['r', 'X', 'R3', "U2'", "R''", 'R U', '']) expect(() => parseMove(bad)).toThrow();
  });
});

describe('property-style legal state checks', () => {
  it('round-trips and matches an independent engine for 200 seeded scrambles', () => {
    const random = seededRandom(20260927);
    for (let i = 0; i < 200; i++) {
      const scramble = generateScramble(25, random);
      const cube = applyAlgorithm(solvedCube(), scramble);
      expect(cubeKey(cube)).toBe(new Cube().move(formatAlgorithm(scramble)).asString());
      expect(fromFacelets(toFacelets(cube))).toEqual(cube);
      expect(applyAlgorithm(cube, inverseAlgorithm(scramble))).toEqual(solvedCube());
      const entry = validateColors(toColors(cube, PRACTICE_SCHEME));
      expect(entry.ok).toBe(true);
      if (entry.ok) expect(entry.cube).toEqual(cube);
    }
  });

  it('accepts user-entered centers with all six cyclic color mappings', () => {
    const cube = applyAlgorithm(solvedCube(), parseAlgorithm("R U2 F' L D B2"));
    for (let shift = 0; shift < 6; shift++) {
      const scheme = Object.fromEntries(FACES.map((face, i) => [face, COLORS[(i + shift) % 6]])) as ColorScheme;
      const result = validateColors(toColors(cube, scheme));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.scheme).toEqual(scheme);
        expect(result.cube).toEqual(cube);
      }
    }
  });

  it('does not mutate inputs and freezes resulting cubie arrays', () => {
    const initial = solvedCube();
    const next = applyMove(initial, { face: 'U', turns: 1 as Turns });
    expect(isSolved(initial)).toBe(true);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.cp)).toBe(true);
    expect(() => { (next.cp as number[])[0] = 99; }).toThrow();
  });

  it('generates real randomized, nonredundant, reproducible scrambles', () => {
    const a = generateScramble(25, seededRandom(4));
    expect(a).toEqual(generateScramble(25, seededRandom(4)));
    expect(a).not.toEqual(generateScramble(25, seededRandom(5)));
    expect(new Set(a.map((move) => move.face)).size).toBeGreaterThan(3);
    expect(() => generateScramble(0)).toThrow();
    expect(() => generateScramble(3, () => 1)).toThrow();
  });
});
