import { describe, expect, it } from 'vitest';
import { cubeKey, solvedCube, toColors } from '../../src/cube/model';
import { applyAlgorithm } from '../../src/cube/moves';
import { parseAlgorithm } from '../../src/cube/notation';
import { COLORS, FACES, PRACTICE_SCHEME, type Color, type ColorScheme } from '../../src/cube/types';
import { validateColors } from '../../src/cube/validation';
import { classifyColor, classifyWithCenters, samplePhoto, type RGB } from '../../src/input/photo/analysis';
import { assemblePhotos, readAutomaticFace } from '../../src/input/photo/automatic';
import { locateFace } from '../../src/input/photo/locate';
import { degradedPhoto, fixtureCorners, fixturePhoto, PIGMENTS, WORN_SURFACES, type PhotoRegion } from '../fixtures/photo';

const PATTERN: Color[] = ['white', 'red', 'orange', 'blue', 'green', 'yellow', 'orange', 'white', 'blue'];
const POSE = { x: 170, y: 48, size: 330, angle: 17, perspectiveX: 0.16, perspectiveY: 0.07 };

describe('low-light, worn and real-world-shaped face recognition', () => {
  for (const exposure of [0.45, 0.28, 0.18]) {
    it(`reads all nine stickers at ${Math.round(exposure * 100)}% exposure with sensor noise`, () => {
      const reading = readAutomaticFace(degradedPhoto(fixturePhoto([{ ...POSE, colors: PATTERN }]), { exposure, noise: 2 }));
      expect(reading.provisional).toEqual(PATTERN);
      expect(reading.center).toBe('green');
    });
  }
  for (const [index, wear] of WORN_SURFACES.entries()) {
    it(`locates and reads damaged/rounded fixture ${index + 1} from pixels, not supplied corners`, () => {
      const region = { ...POSE, ...wear, colors: PATTERN };
      const reading = readAutomaticFace(fixturePhoto([region]));
      expect(reading.provisional).toEqual(PATTERN);
      fixtureCorners(region).forEach((point, i) => {
        expect(Math.hypot(reading.quad[i].x - point.x, reading.quad[i].y - point.y)).toBeLessThan(12);
      });
    });
  }
  it('keeps the intact pigment instead of reading a dark printed center logo as the sticker', () => {
    const region = { ...POSE, colors: PATTERN, logo: true, scratches: true };
    const sampled = samplePhoto(fixturePhoto([region]), fixtureCorners(region));
    expect(sampled.predictions.map((prediction) => prediction.color)).toEqual(PATTERN);
    expect(sampled.predictions[4].reason).toBe(null);
  });
  for (const color of COLORS) {
    it(`recognizes faded ${color} without requiring its original saturation`, () => {
      const pigment = PIGMENTS[color];
      const sample = pigment.map((channel) => (channel * 0.45 + 225 * 0.55) * 0.4);
      expect(classifyColor([sample[0], sample[1], sample[2]]).color).toBe(color);
    });
  }
  it('keeps dark, chromatically ambiguous and unsupported colors uncertain', () => {
    expect(classifyColor([12, 11, 11]).color).toBe(null);
    expect(classifyColor([170, 40, 180]).color).toBe(null);
    expect(classifyColor([205, 86, 42]).confidence).toBeLessThan(0.6);
    expect(classifyColor([110, 95, 95]).color).toBe(null);
    expect(classifyWithCenters([205, 86, 42], PIGMENTS).confidence).toBeLessThan(0.45);
  });
  it('still rejects near-black images rather than amplifying sensor noise into sticker colors', () => {
    const photo = degradedPhoto(fixturePhoto([{ ...POSE, colors: PATTERN }]), { exposure: 0.045, noise: 2 });
    expect(() => readAutomaticFace(photo)).toThrow();
  });
  it('does not overlook a worn second grid just because the first grid is pristine', () => {
    const image = degradedPhoto(fixturePhoto([
      { colors: PATTERN, x: 20, y: 55, size: 260 },
      { colors: PATTERN, x: 345, y: 160, size: 260, scratches: true, logo: true, rounded: 0.12 },
    ]), { blur: 1 });
    expect(() => locateFace(image)).toThrow(/More than one|background detail/);
  });
  for (const damage of ['mixed', 'covered', 'glare'] as const) {
    it(`does not reconstruct ${damage} cells from a tiny patch of convenient color`, () => {
      const region = { colors: PATTERN, x: 100, y: 65, size: 300 };
      const image = fixturePhoto([region]);
      for (let y = 72; y < 158; y++) for (let x = 107; x < 193; x++) {
        const obscured = damage === 'mixed' ? x < 150 : x < 173;
        if (obscured) image.data.set([...(damage === 'mixed' ? PIGMENTS.red : damage === 'glare' ? [255, 255, 255] : [7, 7, 7]), 255], (y * image.width + x) * 4);
      }
      const prediction = samplePhoto(image, fixtureCorners(region)).predictions[0];
      expect(prediction.readable).toBe(false);
      expect(prediction.confidence).toBe(0);
      expect(() => readAutomaticFace(image)).toThrow();
    });
  }
  it('matches observed pigment consistently over a bounded range of fading and exposure', () => {
    for (const color of COLORS) for (const fade of [0, 0.2, 0.4, 0.6]) for (const exposure of [0.22, 0.45, 0.75, 1]) {
      const values = PIGMENTS[color].map((channel) => (channel * (1 - fade) + 225 * fade) * exposure);
      const sample: RGB = [values[0], values[1], values[2]];
      expect(classifyColor(sample).color, `${color}, fade ${fade}, exposure ${exposure}`).toBe(color);
      expect(classifyWithCenters(sample, PIGMENTS).color).toBe(color);
    }
  });
});

describe('degraded six-photo reconstruction stays exact', () => {
  const original = applyAlgorithm(solvedCube(), parseAlgorithm("R U2 B' D L2 F R' D2 B U' F2"));
  const schemes: ColorScheme[] = [PRACTICE_SCHEME, { U: 'green', R: 'red', F: 'yellow', D: 'blue', L: 'orange', B: 'white' }];
  for (const scheme of schemes) {
    it(`reconstructs all 54 photographed colors with ${scheme.U} Up, including worn centers and dim faces`, () => {
      const colors = toColors(original, scheme);
      const photos = FACES.map((face, index) => {
        const region: PhotoRegion = {
          ...POSE, ...WORN_SURFACES[index % WORN_SURFACES.length], colors: colors.slice(index * 9, index * 9 + 9),
          x: 145 + index * 7, angle: index % 2 ? -9 : 17, y: index % 2 ? 135 : 45,
        };
        const reading = readAutomaticFace(degradedPhoto(fixturePhoto([region]), {
          exposure: index % 2 ? 0.32 : 0.75, noise: 1.5, blur: 1,
        }));
        return { face, samples: reading.samples };
      });
      const result = assemblePhotos(photos);
      expect(result.ok ? result.stickers : result.problem).toEqual(colors);
      if (!result.ok) return;
      const valid = validateColors(result.stickers);
      expect(valid.ok).toBe(true);
      if (valid.ok) {
        expect(cubeKey(valid.cube)).toBe(cubeKey(original));
        expect(valid.scheme).toEqual(scheme);
      }
    });
  }
});
