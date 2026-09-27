import { FACE_NAMES, isFace, type Move } from './types';

export function parseMove(token: string): Move {
  if (!/^[URFDLB](2|')?$/.test(token) || !isFace(token[0])) {
    throw new Error(`Unsupported move "${token}". Use U, R, F, D, L or B, optionally followed by ' or 2.`);
  }
  return Object.freeze({ face: token[0], turns: token.endsWith('2') ? 2 : token.endsWith("'") ? -1 : 1 });
}

export function parseAlgorithm(notation: string): readonly Move[] {
  return Object.freeze(notation.trim() ? notation.trim().split(/\s+/).map(parseMove) : []);
}

export function formatMove(move: Move): string {
  return `${move.face}${move.turns === -1 ? "'" : move.turns === 2 ? '2' : ''}`;
}

export function formatAlgorithm(moves: readonly Move[]): string {
  return moves.map(formatMove).join(' ');
}

export function inverseMove(move: Move): Move {
  return Object.freeze({ face: move.face, turns: move.turns === 2 ? 2 : move.turns === 1 ? -1 : 1 });
}

export function inverseAlgorithm(moves: readonly Move[]): readonly Move[] {
  return Object.freeze([...moves].reverse().map(inverseMove));
}

export function describeMove(move: Move): string {
  const direction = move.turns === 2 ? 'a half turn (180 degrees)' : move.turns === -1 ? 'counter-clockwise' : 'clockwise';
  return `Turn the ${FACE_NAMES[move.face].toLowerCase()} face ${direction}.`;
}
