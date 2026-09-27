import { FACES, type Face, type Move } from './types';

export type Vector = readonly [number, number, number];
export type Axis = 0 | 1 | 2;

export const FACE_AXES: Record<Face, { axis: Axis; sign: 1 | -1; normal: Vector }> = {
  U: { axis: 1, sign: 1, normal: [0, 1, 0] },
  R: { axis: 0, sign: 1, normal: [1, 0, 0] },
  F: { axis: 2, sign: 1, normal: [0, 0, 1] },
  D: { axis: 1, sign: -1, normal: [0, -1, 0] },
  L: { axis: 0, sign: -1, normal: [-1, 0, 0] },
  B: { axis: 2, sign: -1, normal: [0, 0, -1] },
};

export interface StickerGeometry {
  readonly face: Face;
  readonly index: number;
  readonly position: Vector;
  readonly normal: Vector;
}

export function faceletPosition(face: Face, row: number, col: number): Vector {
  switch (face) {
    case 'U': return [col - 1, 1, row - 1];
    case 'R': return [1, 1 - row, 1 - col];
    case 'F': return [col - 1, 1 - row, 1];
    case 'D': return [col - 1, -1, 1 - row];
    case 'L': return [-1, 1 - row, col - 1];
    case 'B': return [1 - col, 1 - row, -1];
  }
}

export const STICKER_GEOMETRY: readonly StickerGeometry[] = Object.freeze(
  FACES.flatMap((face, faceIndex) =>
    Array.from({ length: 9 }, (_, cell) => ({
      face,
      index: faceIndex * 9 + cell,
      position: faceletPosition(face, Math.floor(cell / 3), cell % 3),
      normal: FACE_AXES[face].normal,
    })),
  ),
);

export function vectorKey(position: Vector, normal: Vector): string {
  return `${position.join(',')}:${normal.join(',')}`;
}

export function rotateQuarter(vector: Vector, axis: Axis, direction: 1 | -1): Vector {
  const [x, y, z] = vector;
  if (axis === 0) return [x, -direction * z, direction * y];
  if (axis === 1) return [direction * z, y, -direction * x];
  return [-direction * y, direction * x, z];
}

export function moveAngle(move: Move): number {
  return -FACE_AXES[move.face].sign * move.turns * Math.PI / 2;
}

export function isInLayer(position: Vector, face: Face): boolean {
  const { axis, sign } = FACE_AXES[face];
  return position[axis] === sign;
}

export function quarterPermutation(face: Face): readonly number[] {
  const { axis, sign } = FACE_AXES[face];
  const lookup = new Map(STICKER_GEOMETRY.map((s) => [vectorKey(s.position, s.normal), s.index]));
  const result = Array.from({ length: 54 }, (_, i) => i);
  for (const sticker of STICKER_GEOMETRY) {
    if (!isInLayer(sticker.position, face)) continue;
    const direction = sign === 1 ? -1 : 1;
    const target = lookup.get(vectorKey(
      rotateQuarter(sticker.position, axis, direction),
      rotateQuarter(sticker.normal, axis, direction),
    ));
    if (target === undefined) throw new Error(`No geometric destination for ${face} sticker ${sticker.index}.`);
    result[target] = sticker.index;
  }
  return Object.freeze(result);
}
