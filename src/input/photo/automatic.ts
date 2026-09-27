import { cubeKey } from '../../cube/model';
import { FACE_NAMES, FACES, isColor, type Color, type Face } from '../../cube/types';
import { validateColors, type ValidationIssue } from '../../cube/validation';
import { classifyColor, classifyWithCenters, colorDistance, samplePhoto, type RGB } from './analysis';
import type { Pixels, Quad } from './geometry';
import { faceThumbnail, locateFace } from './locate';

export interface FaceReading {
  readonly center: Color;
  readonly samples: readonly RGB[];
  readonly provisional: readonly (Color | null)[];
  readonly quad: Quad;
  readonly confidence: number;
  readonly thumbnail: Pixels;
}

export interface CapturedFace {
  readonly face: Face;
  readonly samples: readonly RGB[];
}

export interface PhotoProblem {
  readonly code: 'incomplete' | 'center' | 'duplicate-center' | 'unclear' | 'invalid-cube' | 'orientation';
  readonly message: string;
  readonly faces: readonly Face[];
  readonly details?: readonly string[];
}

export type PhotoAssembly =
  | { readonly ok: true; readonly stickers: readonly Color[]; readonly rotations: readonly number[] }
  | { readonly ok: false; readonly problem: PhotoProblem };

export function readAutomaticFace(image: Pixels): FaceReading {
  const region = locateFace(image);
  const result = samplePhoto(image, region.quad);
  const center = result.predictions[4];
  if (!center.color || center.confidence < 0.45 || center.reason) {
    throw new Error('The center color is not clear enough. Retake this face in even light, without glare.');
  }
  if (result.predictions.some((prediction) => Math.max(...prediction.sample) < 48
    || prediction.reason?.startsWith('Mixed colors'))) {
    throw new Error('Some stickers are too dark or reflective to read. Retake the whole face in even light.');
  }
  return {
    center: center.color,
    samples: Object.freeze(result.predictions.map((prediction): RGB => Object.freeze([prediction.sample[0], prediction.sample[1], prediction.sample[2]]))),
    provisional: Object.freeze(result.predictions.map((prediction) => prediction.color)),
    quad: region.quad, confidence: region.confidence,
    thumbnail: faceThumbnail(image, region.quad),
  };
}

export function rotateFace<T>(face: readonly T[], turns: number): readonly T[] {
  if (face.length !== 9 || !Number.isInteger(turns)) throw new Error('A face rotation needs nine stickers and a whole number of quarter turns.');
  let result = [...face];
  for (let i = 0; i < (turns % 4 + 4) % 4; i++) result = [6, 3, 0, 7, 4, 1, 8, 5, 2].map((index) => result[index]);
  return result;
}

function invalid(issues: readonly ValidationIssue[]): PhotoAssembly {
  const affected = new Set(issues.flatMap((issue) => issue.indices.map((index) => FACES[Math.floor(index / 9)])));
  return {
    ok: false,
    problem: {
      code: 'invalid-cube', message: issues[0].message,
      faces: [...affected], details: issues.slice(1).map((issue) => issue.message),
    },
  };
}

export function assemblePhotos(photos: readonly CapturedFace[]): PhotoAssembly {
  const ordered = FACES.map((face) => photos.find((photo) => photo.face === face));
  if (photos.length !== 6 || new Set(photos.map((photo) => photo.face)).size !== 6 || ordered.some((photo) => !photo || photo.samples.length !== 9)) {
    return { ok: false, problem: { code: 'incomplete', message: 'Add one photo for each of the six named faces.', faces: FACES.filter((_, i) => !ordered[i]) } };
  }
  const captures: CapturedFace[] = [];
  const centers: Color[] = [];
  const calibration: Partial<Record<Color, RGB>> = {};
  for (const face of FACES) {
    const photo = photos.find((candidate) => candidate.face === face);
    if (!photo || photo.samples.some((sample) => sample.length !== 3 || sample.some((value) => !Number.isFinite(value) || value < 0 || value > 255))) {
      return { ok: false, problem: { code: 'unclear', message: `The ${FACE_NAMES[face].toLowerCase()} photo could not be read. Retake this face.`, faces: [face] } };
    }
    const prediction = classifyColor(photo.samples[4]);
    if (!prediction.color || prediction.confidence < 0.45 || prediction.reason) {
      return { ok: false, problem: { code: 'center', message: `The ${FACE_NAMES[face].toLowerCase()} center is unclear. Retake it in even light.`, faces: [face] } };
    }
    const duplicate = centers.indexOf(prediction.color);
    if (duplicate >= 0) {
      return {
        ok: false,
        problem: {
          code: 'duplicate-center',
          message: `${FACE_NAMES[FACES[duplicate]]} and ${FACE_NAMES[face]} show the same ${prediction.color} center. Retake the mislabeled face.`,
          faces: [FACES[duplicate], face],
        },
      };
    }
    centers.push(prediction.color);
    calibration[prediction.color] = photo.samples[4];
    captures.push(photo);
  }
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) {
    if (colorDistance(captures[a].samples[4], captures[b].samples[4]) < 12) {
      return {
        ok: false,
        problem: {
          code: 'center', message: `The ${FACE_NAMES[FACES[a]]} and ${FACE_NAMES[FACES[b]]} centers look too similar. Retake them in neutral light.`,
          faces: [FACES[a], FACES[b]],
        },
      };
    }
  }
  const matched = captures.map((photo) => photo.samples.map((sample) => classifyWithCenters(sample, calibration)));
  const unclear = FACES.filter((_, i) => matched[i].some((prediction) => !prediction.color || prediction.confidence < 0.45 || prediction.reason));
  if (unclear.length) {
    return { ok: false, problem: { code: 'unclear', message: `Some colors are hard to distinguish in ${unclear.map((face) => FACE_NAMES[face]).join(', ')}. Retake those faces in even light.`, faces: unclear } };
  }
  const faces = matched.map((predictions) => predictions.map((prediction) => {
    if (!isColor(prediction.color)) throw new Error('A checked photo unexpectedly contains an unknown color.');
    return prediction.color;
  }));
  const stickers = faces.flat();
  const literal = validateColors(stickers);
  if (literal.ok) return { ok: true, stickers: Object.freeze(stickers), rotations: Object.freeze(FACES.map(() => 0)) };
  if (literal.issues.some((issue) => ['color-count', 'centers', 'incomplete', 'edge-flip', 'corner-twist', 'parity'].includes(issue.code))) {
    return invalid(literal.issues);
  }

  const choices = faces.map((face) => {
    const unique = new Map<string, { colors: readonly Color[]; turns: number }>();
    for (let turns = 0; turns < 4; turns++) {
      const colors = rotateFace(face, turns);
      if (!unique.has(colors.join(','))) unique.set(colors.join(','), { colors, turns });
    }
    return [...unique.values()];
  });
  const solutions = new Map<string, { stickers: readonly Color[]; rotations: readonly number[] }>();
  const visit = (index: number, colors: readonly Color[], rotations: readonly number[]) => {
    if (solutions.size > 1) return;
    if (index === 6) {
      const valid = validateColors(colors);
      if (valid.ok) solutions.set(cubeKey(valid.cube), { stickers: Object.freeze([...colors]), rotations: Object.freeze([...rotations]) });
      return;
    }
    for (const choice of choices[index]) visit(index + 1, [...colors, ...choice.colors], [...rotations, choice.turns]);
  };
  visit(0, [], []);
  const unique = solutions.values().next().value;
  if (solutions.size === 1 && unique) return { ok: true, ...unique };
  if (solutions.size > 1) {
    return {
      ok: false,
      problem: {
        code: 'orientation',
        message: 'These face orientations have more than one valid reading. Retake the side faces with the original top up, and follow the Up/Down guide.',
        faces: [...FACES],
      },
    };
  }
  return {
    ok: false,
    problem: {
      code: 'orientation', message: 'The face photos do not agree. Retake any unclear face and follow its top-edge guide.',
      faces: [...FACES], details: literal.issues.map((issue) => issue.message),
    },
  };
}
