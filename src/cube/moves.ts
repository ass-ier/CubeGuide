import { quarterPermutation } from './geometry';
import { decodePieces, immutableCube, solvedCube, toFacelets } from './model';
import { FACES, type CubeState, type Face, type Move } from './types';

function createTransform(face: Face): CubeState {
  const facelets = toFacelets(solvedCube());
  const decoded = decodePieces(quarterPermutation(face).map((source) => facelets[source]));
  if (decoded.invalidCorners.length || decoded.invalidEdges.length) {
    throw new Error(`Internal ${face} move geometry is inconsistent.`);
  }
  return immutableCube(decoded);
}

const TRANSFORMS = Object.fromEntries(FACES.map((face) => [face, createTransform(face)])) as Record<Face, CubeState>;

function multiply(cube: CubeState, transform: CubeState): CubeState {
  return immutableCube({
    cp: transform.cp.map((source) => cube.cp[source]),
    co: transform.cp.map((source, i) => (cube.co[source] + transform.co[i]) % 3),
    ep: transform.ep.map((source) => cube.ep[source]),
    eo: transform.ep.map((source, i) => (cube.eo[source] + transform.eo[i]) % 2),
  });
}

export function applyMove(cube: CubeState, move: Move): CubeState {
  let result = cube;
  const repetitions = move.turns === -1 ? 3 : move.turns;
  for (let i = 0; i < repetitions; i++) result = multiply(result, TRANSFORMS[move.face]);
  return result;
}

export function applyAlgorithm(cube: CubeState, moves: readonly Move[]): CubeState {
  return moves.reduce(applyMove, cube);
}
