import { FACE_AXES } from './geometry';
import { FACES, type Move, type Turns } from './types';

export type RandomSource = () => number;

export function secureRandom(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] / 0x1_0000_0000;
}

export function generateScramble(length = 25, random: RandomSource = secureRandom): readonly Move[] {
  if (!Number.isInteger(length) || length < 1 || length > 1000) throw new Error('Scramble length must be an integer from 1 to 1000.');
  const moves: Move[] = [];
  const pick = (max: number): number => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Random source must return a number in [0, 1).');
    return Math.floor(value * max);
  };
  for (let i = 0; i < length; i++) {
    // Changing axis avoids both immediate cancellations and redundant commuting runs.
    const last = moves.at(-1);
    const candidates = FACES.filter((face) => !last || FACE_AXES[face].axis !== FACE_AXES[last.face].axis);
    const turns: readonly Turns[] = [1, -1, 2];
    moves.push(Object.freeze({ face: candidates[pick(candidates.length)], turns: turns[pick(3)] }));
  }
  return Object.freeze(moves);
}
