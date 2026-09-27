import { FACES, type Color, type ColorScheme, type CubeState, type Face } from './types';

export const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'] as const;
export const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'] as const;

export const CORNER_FACELETS: readonly (readonly number[])[] = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
export const EDGE_FACELETS: readonly (readonly number[])[] = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
];
export const CORNER_COLORS: readonly (readonly Face[])[] = [
  ['U', 'R', 'F'], ['U', 'F', 'L'], ['U', 'L', 'B'], ['U', 'B', 'R'],
  ['D', 'F', 'R'], ['D', 'L', 'F'], ['D', 'B', 'L'], ['D', 'R', 'B'],
];
export const EDGE_COLORS: readonly (readonly Face[])[] = [
  ['U', 'R'], ['U', 'F'], ['U', 'L'], ['U', 'B'], ['D', 'R'], ['D', 'F'],
  ['D', 'L'], ['D', 'B'], ['F', 'R'], ['F', 'L'], ['B', 'L'], ['B', 'R'],
];

export function immutableCube(cube: CubeState): CubeState {
  return Object.freeze({
    cp: Object.freeze([...cube.cp]), co: Object.freeze([...cube.co]),
    ep: Object.freeze([...cube.ep]), eo: Object.freeze([...cube.eo]),
  });
}

export function solvedCube(): CubeState {
  return immutableCube({
    cp: Array.from({ length: 8 }, (_, i) => i),
    co: Array(8).fill(0),
    ep: Array.from({ length: 12 }, (_, i) => i),
    eo: Array(12).fill(0),
  });
}

export function isSolved(cube: CubeState): boolean {
  return cube.cp.every((piece, i) => piece === i && cube.co[i] === 0)
    && cube.ep.every((piece, i) => piece === i && cube.eo[i] === 0);
}

export function toFacelets(cube: CubeState): readonly Face[] {
  const result: Face[] = FACES.flatMap((face) => Array<Face>(9).fill(face));
  CORNER_FACELETS.forEach((indices, position) => {
    for (let color = 0; color < 3; color++) {
      result[indices[(color + cube.co[position]) % 3]] = CORNER_COLORS[cube.cp[position]][color];
    }
  });
  EDGE_FACELETS.forEach((indices, position) => {
    for (let color = 0; color < 2; color++) {
      result[indices[(color + cube.eo[position]) % 2]] = EDGE_COLORS[cube.ep[position]][color];
    }
  });
  return Object.freeze(result);
}

export function cubeKey(cube: CubeState): string {
  return toFacelets(cube).join('');
}

export function toColors(cube: CubeState, scheme: ColorScheme): readonly Color[] {
  return Object.freeze(toFacelets(cube).map((face) => scheme[face]));
}

export function permutationParity(permutation: readonly number[]): number {
  let parity = 0;
  for (let i = 0; i < permutation.length; i++) {
    for (let j = i + 1; j < permutation.length; j++) {
      if (permutation[i] > permutation[j]) parity ^= 1;
    }
  }
  return parity;
}

export interface PieceDecode {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
  invalidCorners: number[];
  invalidEdges: number[];
}

// Decoding deliberately does not repair pieces; validation owns diagnostics.
export function decodePieces(facelets: readonly Face[]): PieceDecode {
  const cp: number[] = [], co: number[] = [], ep: number[] = [], eo: number[] = [];
  const invalidCorners: number[] = [], invalidEdges: number[] = [];
  CORNER_FACELETS.forEach((indices, position) => {
    const colors = indices.map((index) => facelets[index]);
    const orientation = colors.findIndex((color) => color === 'U' || color === 'D');
    const piece = CORNER_COLORS.findIndex((expected) =>
      orientation !== -1 && expected.every((color, i) => color === colors[(i + orientation) % 3]),
    );
    cp.push(piece);
    co.push(orientation);
    if (piece === -1) invalidCorners.push(position);
  });
  EDGE_FACELETS.forEach((indices, position) => {
    const colors = indices.map((index) => facelets[index]);
    const piece = EDGE_COLORS.findIndex((expected) =>
      expected.every((color, i) => color === colors[i])
      || expected.every((color, i) => color === colors[1 - i]),
    );
    ep.push(piece);
    eo.push(piece === -1 ? -1 : Number(colors[0] !== EDGE_COLORS[piece][0]));
    if (piece === -1) invalidEdges.push(position);
  });
  return { cp, co, ep, eo, invalidCorners, invalidEdges };
}
