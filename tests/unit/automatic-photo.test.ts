import { describe, expect, it } from 'vitest';
import { cubeKey, solvedCube, toColors } from '../../src/cube/model';
import { applyAlgorithm } from '../../src/cube/moves';
import { parseAlgorithm } from '../../src/cube/notation';
import { FACES, PRACTICE_SCHEME, type Color, type ColorScheme } from '../../src/cube/types';
import { validateColors } from '../../src/cube/validation';
import { assemblePhotos, readAutomaticFace, rotateFace, type CapturedFace } from '../../src/input/photo/automatic';
import { classifyColor, type RGB } from '../../src/input/photo/analysis';
import { locateFace } from '../../src/input/photo/locate';
import { fixtureCorners, fixturePhoto, PIGMENTS, type PhotoRegion } from '../fixtures/photo';

const PATTERN: Color[] = ['white', 'red', 'orange', 'blue', 'green', 'yellow', 'orange', 'white', 'blue'];
const REGIONS: Omit<PhotoRegion, 'colors'>[] = [
  { x: 100, y: 55, size: 300 },
  { x: 250, y: 130, size: 180 },
  { x: 30, y: 250, size: 120 },
  { x: 220, y: 30, size: 300, angle: 28 },
  { x: 80, y: 160, size: 290, angle: -25 },
  { x: 150, y: 50, size: 380, perspectiveX: 0.28, perspectiveY: 0.12 },
  { x: 70, y: 160, size: 290, angle: -15, perspectiveX: 0.2, perspectiveY: 0.15 },
];

describe('automatic face/grid location from pixels', () => {
  for (const [index, region] of REGIONS.entries()) {
    it(`finds and reads translated, scaled or perspective fixture ${index + 1} without crop coordinates`, () => {
      const fixture = { ...region, colors: PATTERN };
      const result = readAutomaticFace(fixturePhoto([fixture]));
      expect(result.center).toBe('green');
      expect(result.provisional).toEqual(PATTERN);
      expect(result.confidence).toBeGreaterThan(0.7);
      const expected = fixtureCorners(fixture);
      result.quad.forEach((point, i) => expect(Math.hypot(point.x - expected[i].x, point.y - expected[i].y)).toBeLessThan(7));
      expect(result.thumbnail.width).toBe(168);
      expect(result.thumbnail.data.length).toBe(168 * 168 * 4);
    });
  }

  it('finds a quarter-turned face without mirroring its sticker order', () => {
    const result = readAutomaticFace(fixturePhoto([{ colors: PATTERN, x: 380, y: 80, size: 270, angle: 90 }]));
    expect(result.provisional).toEqual(rotateFace(PATTERN, 1));
    expect(result.center).toBe('green');
  });

  for (const seam of [[120, 123, 125], [228, 228, 224]] as const) {
    it(`separates actual sticker boundaries on a ${seam[0] > 200 ? 'light' : 'gray'} cube body`, () => {
      const result = readAutomaticFace(fixturePhoto([{ colors: PATTERN, x: 100, y: 55, size: 300, seam }]));
      expect(result.provisional).toEqual(PATTERN);
    });
  }

  it('rejects blank, dark and multi-face frames instead of assuming a central crop', () => {
    expect(() => locateFace(fixturePhoto([]))).toThrow('nine stickers');
    expect(() => locateFace(fixturePhoto([], 640, 480, [10, 10, 10]))).toThrow('nine stickers');
    expect(() => locateFace(fixturePhoto([
      { colors: PATTERN, x: 30, y: 80, size: 220 },
      { colors: PATTERN, x: 380, y: 180, size: 200 },
    ]))).toThrow('More than one');
  });

  it('rejects missing, clipped and cluttered grids without inventing hidden stickers', () => {
    const samples = PATTERN.map((color) => PIGMENTS[color]);
    samples[0] = [10, 10, 10];
    expect(() => locateFace(fixturePhoto([{ colors: PATTERN, samples, x: 100, y: 55, size: 300 }]))).toThrow('nine stickers');
    expect(() => locateFace(fixturePhoto([{ colors: PATTERN, x: -40, y: 80, size: 300 }]))).toThrow(/outside|nine stickers/);
    const clutter = Array.from({ length: 7 }, (_, i) => ({
      colors: PATTERN, x: 20 + (i % 4) * 150, y: 30 + Math.floor(i / 4) * 205, size: 130,
    }));
    expect(() => locateFace(fixturePhoto(clutter))).toThrow('background detail');
  });

  it('rejects an uncertain center instead of choosing one to complete a scheme', () => {
    const samples = PATTERN.map((color) => PIGMENTS[color]);
    samples[4] = [170, 40, 180];
    expect(classifyColor(samples[4]).color).toBe(null);
    expect(() => readAutomaticFace(fixturePhoto([{ colors: PATTERN, samples, x: 100, y: 60, size: 300 }]))).toThrow('center color');
  });
});

function captures(colors: readonly Color[]): CapturedFace[] {
  return FACES.map((face, index) => ({ face, samples: colors.slice(index * 9, index * 9 + 9).map((color) => PIGMENTS[color]) }));
}

describe('automatic center mapping, calibration and physical assembly', () => {
  const original = applyAlgorithm(solvedCube(), parseAlgorithm("F R2 U' L D2 B R U F2 D'"));
  const schemes: ColorScheme[] = [PRACTICE_SCHEME, { U: 'blue', R: 'orange', F: 'yellow', D: 'green', L: 'red', B: 'white' }];
  for (const scheme of schemes) {
    it(`derives ${scheme.U} Up / ${scheme.F} Front solely from six off-center photo centers`, () => {
      const colors = toColors(original, scheme);
      const photos = FACES.map((face, i) => {
        const reading = readAutomaticFace(fixturePhoto([{ ...REGIONS[i], colors: colors.slice(i * 9, i * 9 + 9) }]));
        return { face, samples: reading.samples };
      });
      const assembled = assemblePhotos(photos);
      expect(assembled.ok).toBe(true);
      if (!assembled.ok) return;
      expect(assembled.stickers).toEqual(colors);
      const result = validateColors(assembled.stickers);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(cubeKey(result.cube)).toBe(cubeKey(original));
        expect(result.scheme).toEqual(scheme);
      }
    });
  }
  it('rejects missing and duplicate centers, without forcing a six-color assignment', () => {
    const photos = captures(toColors(original, PRACTICE_SCHEME));
    expect(assemblePhotos(photos.slice(1))).toMatchObject({ ok: false, problem: { code: 'incomplete' } });
    photos[1] = { ...photos[1], samples: [...photos[0].samples] };
    expect(assemblePhotos(photos)).toMatchObject({ ok: false, problem: { code: 'duplicate-center', faces: ['U', 'R'] } });
  });
  it('rejects unclear stickers rather than silently committing a guess', () => {
    const photos = captures(toColors(original, PRACTICE_SCHEME));
    const samples: RGB[] = [...photos[0].samples];
    samples[0] = [12, 10, 10];
    photos[0] = { ...photos[0], samples };
    expect(assemblePhotos(photos)).toMatchObject({
      ok: false, problem: { code: 'unclear', faces: ['U'], details: [expect.stringContaining('Up, sticker 1')] },
    });
  });
  it('recovers a unique within-face quarter-turn interpretation using full physical validation', () => {
    const colors = toColors(original, PRACTICE_SCHEME), photos = captures(colors);
    photos[2] = { ...photos[2], samples: rotateFace(photos[2].samples, 1) };
    const result = assemblePhotos(photos);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stickers).toEqual(colors);
      expect(result.rotations[2]).toBe(3);
    }
  });
  it('refuses multiple valid orientation recoveries instead of choosing an arbitrary cube', () => {
    const photos = captures(toColors(applyAlgorithm(solvedCube(), parseAlgorithm('R')), PRACTICE_SCHEME));
    photos[2] = { ...photos[2], samples: rotateFace(photos[2].samples, 1) };
    expect(assemblePhotos(photos)).toMatchObject({ ok: false, problem: { code: 'orientation' } });
  });
  it('keeps global flip/parity failures as physical errors instead of trying to repair the cube', () => {
    const colors = [...toColors(solvedCube(), PRACTICE_SCHEME)];
    [colors[7], colors[19]] = [colors[19], colors[7]];
    const result = assemblePhotos(captures(colors));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.code).toBe('invalid-cube');
      expect(result.problem.message).toContain('odd flip total');
    }
  });
});
