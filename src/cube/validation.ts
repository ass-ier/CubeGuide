import {
  CORNER_COLORS, CORNER_FACELETS, CORNER_NAMES, decodePieces, EDGE_COLORS, EDGE_FACELETS,
  EDGE_NAMES, immutableCube, permutationParity,
} from './model';
import { COLORS, FACE_NAMES, FACES, isColor, type Color, type ColorScheme, type CubeState, type Face } from './types';

export interface ValidationIssue {
  readonly code: 'length' | 'incomplete' | 'color-count' | 'centers' | 'edge' | 'corner' | 'duplicate' | 'edge-flip' | 'corner-twist' | 'parity';
  readonly message: string;
  readonly indices: readonly number[];
}

export type ValidationResult =
  | { readonly ok: true; readonly cube: CubeState; readonly scheme: ColorScheme }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export function validateColors(input: readonly unknown[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (input.length !== 54) {
    return { ok: false, issues: [{ code: 'length', message: `Received ${input.length} stickers; a 3x3 cube needs exactly 54 (nine on each face).`, indices: [] }] };
  }
  const missing = input.flatMap((color, i) => isColor(color) ? [] : [i]);
  if (missing.length) {
    const faces = FACES.filter((_, i) => missing.some((index) => Math.floor(index / 9) === i));
    issues.push({
      code: 'incomplete',
      message: `${missing.length} sticker${missing.length === 1 ? ' is' : 's are'} still empty or unrecognized. Complete ${faces.map((face) => FACE_NAMES[face]).join(', ')}.`,
      indices: missing,
    });
  }
  const centers = FACES.map((_, i) => input[i * 9 + 4]);
  if (centers.some((color) => !isColor(color)) || new Set(centers).size !== 6) {
    issues.push({
      code: 'centers',
      message: 'Choose six different center colors, one for each face. Centers establish your cube orientation; check them before entering the other stickers.',
      indices: FACES.map((_, i) => i * 9 + 4),
    });
  }
  for (const color of COLORS) {
    const indices = input.flatMap((value, i) => value === color ? [i] : []);
    if (indices.length > 9 || (!missing.length && indices.length !== 9)) {
      issues.push({
        code: 'color-count',
        message: `There are ${indices.length} ${color} stickers. A valid cube must have exactly 9. Recheck ${color} stickers on all six faces.`,
        indices,
      });
    }
  }
  if (issues.length) return { ok: false, issues };
  const scheme = Object.freeze(Object.fromEntries(FACES.map((face, i) => [face, centers[i]]))) as ColorScheme;
  const reverse = new Map<Color, Face>(FACES.map((face) => [scheme[face], face]));
  const facelets: Face[] = input.map((value) => {
    const face = isColor(value) ? reverse.get(value) : undefined;
    if (face === undefined) throw new Error('Validated center mapping unexpectedly has an unmapped color.');
    return face;
  });
  return validateMappedFacelets(facelets, scheme);
}

function validateMappedFacelets(facelets: readonly Face[], scheme: ColorScheme): ValidationResult {
  const issues: ValidationIssue[] = [];
  const decoded = decodePieces(facelets);
  const colorNames = (indices: readonly number[]) => indices.map((index) => scheme[facelets[index]]).join('/');
  for (const position of decoded.invalidEdges) {
    const indices = EDGE_FACELETS[position];
    issues.push({
      code: 'edge',
      message: `The ${EDGE_NAMES[position]} edge has ${colorNames(indices)}. Those colors cannot form an edge with these centers. Recheck this piece and the center orientation.`,
      indices,
    });
  }
  for (const position of decoded.invalidCorners) {
    const indices = CORNER_FACELETS[position];
    issues.push({
      code: 'corner',
      message: `The ${CORNER_NAMES[position]} corner has ${colorNames(indices)} in an impossible order. Check all three stickers and whether a face was entered mirrored or rotated.`,
      indices,
    });
  }
  for (const kind of ['edge', 'corner'] as const) {
    const permutation = kind === 'edge' ? decoded.ep : decoded.cp;
    const definitions = kind === 'edge' ? EDGE_COLORS : CORNER_COLORS;
    const positions = kind === 'edge' ? EDGE_FACELETS : CORNER_FACELETS;
    const names = kind === 'edge' ? EDGE_NAMES : CORNER_NAMES;
    definitions.forEach((colors, piece) => {
      const occurrences = permutation.flatMap((value, i) => value === piece ? [i] : []);
      if (occurrences.length > 1) {
        issues.push({
          code: 'duplicate',
          message: `The ${colors.map((face) => scheme[face]).join('/')} ${kind} appears ${occurrences.length} times (${occurrences.map((i) => names[i]).join(', ')}). Every physical piece must appear exactly once.`,
          indices: occurrences.flatMap((i) => [...positions[i]]),
        });
      }
    });
  }
  if (issues.length) return { ok: false, issues };
  if (decoded.eo.reduce((sum, value) => sum + value, 0) % 2 !== 0) {
    issues.push({
      code: 'edge-flip',
      message: 'The edge orientations have an odd flip total, which face turns cannot create. Recheck edge sticker pairs and face orientation. This global check cannot identify which edge was entered incorrectly.',
      indices: [],
    });
  }
  if (decoded.co.reduce((sum, value) => sum + value, 0) % 3 !== 0) {
    issues.push({
      code: 'corner-twist',
      message: 'The corner twists do not balance. Recheck the three stickers of each corner and the orientation of the entered faces. A single twisted corner cannot be corrected with face turns; this check cannot localize the error.',
      indices: [],
    });
  }
  if (permutationParity(decoded.cp) !== permutationParity(decoded.ep)) {
    issues.push({
      code: 'parity',
      message: 'The corner and edge permutations have different parity. This arrangement cannot be reached by face turns. Recheck your face entries; if they match, two pieces may have been swapped during reassembly. No single offending piece can be identified from parity alone.',
      indices: [],
    });
  }
  return issues.length ? { ok: false, issues } : { ok: true, cube: immutableCube(decoded), scheme };
}

export function fromFacelets(facelets: readonly Face[]): CubeState {
  const scheme: ColorScheme = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' };
  if (facelets.length !== 54 || FACES.some((face, i) => facelets[i * 9 + 4] !== face)) {
    throw new Error('Facelets must contain 54 entries with fixed U/R/F/D/L/B centers.');
  }
  const result = validateColors(facelets.map((face) => scheme[face]));
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join(' '));
  return result.cube;
}
