import { describe, expect, it } from 'vitest';
import { COLORS, COLOR_INFO, FACES, PRACTICE_SCHEME, type Color, type ColorScheme } from '../../src/cube/types';
import { cubeKey, solvedCube, toColors } from '../../src/cube/model';
import { applyAlgorithm } from '../../src/cube/moves';
import { parseAlgorithm } from '../../src/cube/notation';
import { validateColors } from '../../src/cube/validation';
import { analyzePhoto, classifyColor, reviewedColors, type RGB } from '../../src/input/photo/analysis';
import { rasterSize, validatePhotoFile } from '../../src/input/photo/decode';
import { cropError, defaultQuad, projectiveMap, rotatePixels, type Pixels, type Quad } from '../../src/input/photo/geometry';
import { emptyEntry, PhotoInputProvider } from '../../src/input/provider';

const QUAD: Quad = [{ x: 40, y: 40 }, { x: 280, y: 40 }, { x: 280, y: 280 }, { x: 40, y: 280 }];
const PATTERN: Color[] = ['white', 'red', 'green', 'orange', 'blue', 'yellow', 'yellow', 'red', 'white'];
function rgb(color: Color): RGB {
  const hex = COLOR_INFO[color].hex;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5), 16)];
}

function image(colors = PATTERN, light = 1, warm = 0): Pixels {
  const width = 320, height = 320, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let value: RGB = [18, 22, 26];
    const col = Math.floor((x - 40) / 80), row = Math.floor((y - 40) / 80);
    if (col >= 0 && col < 3 && row >= 0 && row < 3 && (x - 40) % 80 > 6 && (x - 40) % 80 < 74 && (y - 40) % 80 > 6 && (y - 40) % 80 < 74) {
      const base = rgb(colors[row * 3 + col]);
      const noise = ((x * 17 + y * 23) % 7) - 3;
      value = [base[0] * light + warm + noise, base[1] * light + noise, base[2] * light - warm + noise];
    }
    const index = (y * width + x) * 4;
    data.set([...value, 255], index);
  }
  return { width, height, data };
}

describe('local color sampling and classification', () => {
  for (const color of COLORS) {
    it(`identifies ${color} without using the configured center as a prediction`, () => {
      expect(classifyColor(rgb(color)).color).toBe(color);
    });
  }
  for (const [light, warm] of [[1, 0], [0.65, 0], [0.85, 10], [1.08, 5]]) {
    it(`samples nine interiors correctly at exposure ${light}, warm shift ${warm}`, () => {
      const result = analyzePhoto(image(PATTERN, light, warm), QUAD, 'blue');
      expect(result.predictions.map((p) => p.color)).toEqual(PATTERN);
    });
  }
  it('detects center disagreement instead of silently forcing its color', () => {
    const result = analyzePhoto(image(), QUAD, 'white');
    expect(result.predictions[4].color).toBe('blue');
    expect(result.centerNeedsConfirmation).toBe(true);
    expect(() => reviewedColors(result, PATTERN, true, false)).toThrow('center identity');
    const confirmed = reviewedColors(result, PATTERN, true, true);
    expect(confirmed[4]).toBe('white');
    expect(result.predictions[4].color).toBe('blue');
  });
  it('requires actual review and every missing correction', () => {
    const result = analyzePhoto(image(), QUAD, 'blue');
    expect(() => reviewedColors(result, PATTERN, false, true)).toThrow('Review all nine');
    const corrections = [...PATTERN];
    corrections[0] = 'yellow';
    expect(reviewedColors(result, corrections, true, true)[0]).toBe('yellow');
    expect(() => reviewedColors(result, [null, ...PATTERN.slice(1)], true, true)).toThrow('every uncertain');
    expect(Object.isFrozen(reviewedColors(result, PATTERN, true, true))).toBe(true);
  });
  it('flags blank, dark, ambiguous and mixed-color input instead of declaring confidence', () => {
    const blank = image();
    for (let i = 0; i < blank.data.length; i += 4) blank.data.set([130, 130, 130, 255], i);
    const result = analyzePhoto(blank, QUAD, 'white');
    expect(result.warnings.some((message) => message.includes('blank image'))).toBe(true);
    expect(result.centerNeedsConfirmation).toBe(true);
    expect(classifyColor([15, 13, 12])).toMatchObject({ color: null, confidence: 0 });
    expect(classifyColor([205, 86, 42]).confidence).toBeLessThan(0.6);
  });
  it('uses reviewed center samples as optional per-color calibration', () => {
    const sample: RGB = [28, 122, 91];
    expect(classifyColor(sample, { green: sample })).toMatchObject({ color: 'green', confidence: 1 });
  });
  it('rejects incomplete, oversized or non-finite analysis inputs', () => {
    expect(() => analyzePhoto({ width: 320, height: 320, data: new Uint8ClampedArray(10) }, QUAD, 'white')).toThrow('RGBA');
    expect(() => analyzePhoto({ width: 2048, height: 2048, data: new Uint8ClampedArray(0) }, QUAD, 'white')).toThrow('1024');
    expect(() => classifyColor([NaN, 2, 3])).toThrow('valid RGB');
    expect(() => classifyColor([256, 2, 3])).toThrow('valid RGB');
  });
});

describe('crop geometry and orientation', () => {
  it('samples all nine colors from a genuinely perspective-distorted raster', () => {
    const width = 320, height = 320, data = new Uint8ClampedArray(width * height * 4);
    const oracle = (u: number, v: number) => ({ x: (30 + 260 * u + 20 * v) / (1 + 0.25 * u + 0.05 * v), y: (20 + 30 * u + 270 * v) / (1 + 0.25 * u + 0.05 * v) });
    const quad: Quad = [oracle(0, 0), oracle(1, 0), oracle(1, 1), oracle(0, 1)];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const a = 260 - 0.25 * x, b = 20 - 0.05 * x, c = 30 - 0.25 * y, d = 270 - 0.05 * y;
      const u = ((x - 30) * d - b * (y - 20)) / (a * d - b * c);
      const v = (a * (y - 20) - (x - 30) * c) / (a * d - b * c);
      const inside = u >= 0 && u < 1 && v >= 0 && v < 1
        && u * 3 % 1 > 0.06 && u * 3 % 1 < 0.94 && v * 3 % 1 > 0.06 && v * 3 % 1 < 0.94;
      data.set([...(inside ? rgb(PATTERN[Math.floor(v * 3) * 3 + Math.floor(u * 3)]) : [18, 22, 26]), 255], (y * width + x) * 4);
    }
    expect(analyzePhoto({ width, height, data }, quad, 'blue').predictions.map((p) => p.color)).toEqual(PATTERN);
  });
  it('maps arbitrary perspective points against an independent projective equation', () => {
    const oracle = (u: number, v: number) => ({ x: (30 + 260 * u + 20 * v) / (1 + 0.25 * u + 0.05 * v), y: (20 + 30 * u + 270 * v) / (1 + 0.25 * u + 0.05 * v) });
    const quad: Quad = [oracle(0, 0), oracle(1, 0), oracle(1, 1), oracle(0, 1)];
    expect(cropError(quad, 320, 320)).toBe(null);
    const map = projectiveMap(quad);
    for (const u of [0, 0.2, 0.5, 1]) for (const v of [0, 0.3, 0.7, 1]) {
      expect(map(u, v).x).toBeCloseTo(oracle(u, v).x, 8);
      expect(map(u, v).y).toBeCloseTo(oracle(u, v).y, 8);
    }
  });
  it('rejects crossed, mirrored, tiny and out-of-bounds corners', () => {
    expect(cropError([QUAD[0], QUAD[2], QUAD[1], QUAD[3]], 320, 320)).toContain('order');
    expect(cropError([QUAD[0], QUAD[3], QUAD[2], QUAD[1]], 320, 320)).toContain('order');
    expect(cropError(defaultQuad(20, 20), 20, 20)).toContain('larger');
    expect(cropError([{ x: -1, y: 0 }, QUAD[1], QUAD[2], QUAD[3]], 320, 320)).toContain('inside');
  });
  it('rotates the pixels and sticker order without mirroring, and four turns restore the data', () => {
    const original = image();
    const rotated = rotatePixels(original, true);
    const mapPoint = (p: { x: number; y: number }) => ({ x: 319 - p.y, y: p.x });
    const quad: Quad = [mapPoint(QUAD[3]), mapPoint(QUAD[0]), mapPoint(QUAD[1]), mapPoint(QUAD[2])];
    expect(analyzePhoto(rotated, quad, 'blue').predictions.map((p) => p.color)).toEqual([6, 3, 0, 7, 4, 1, 8, 5, 2].map((i) => PATTERN[i]));
    let restored = original;
    for (let i = 0; i < 4; i++) restored = rotatePixels(restored, true);
    expect(restored.data).toEqual(original.data);
    expect(rotatePixels(rotated, false).data).toEqual(original.data);
  });
});

describe('raster bounds and corrupt input', () => {
  function png(width: number, height: number): Uint8Array {
    const bytes = new Uint8Array(32);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    bytes.set([73, 72, 68, 82], 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, width); view.setUint32(20, height);
    return bytes;
  }
  it('reads PNG, JPEG and WebP sizes before decoding pixel buffers', () => {
    expect(rasterSize(png(640, 480))).toEqual({ width: 640, height: 480, format: 'png' });
    const jpeg = new Uint8Array(21);
    jpeg.set([255, 216, 255, 192, 0, 17, 8, 0, 100, 0, 200]);
    expect(rasterSize(jpeg)).toEqual({ width: 200, height: 100, format: 'jpeg' });
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode('RIFF'), 0);
    webp.set(new TextEncoder().encode('WEBPVP8X'), 8);
    new DataView(webp.buffer).setUint32(16, 10, true);
    webp[24] = 199; webp[27] = 99;
    expect(rasterSize(webp)).toEqual({ width: 200, height: 100, format: 'webp' });
  });
  it('rejects corrupt/unsupported files and oversized dimensions', () => {
    expect(() => rasterSize(new Uint8Array([255, 216, 0, 0, 0, 0]))).toThrow('readable');
    expect(() => validatePhotoFile(png(640, 480), 'image/svg+xml')).toThrow('Unsupported');
    expect(() => validatePhotoFile(png(640, 480), 'image/heic')).toThrow('Unsupported');
    expect(() => validatePhotoFile(png(64000, 48000), 'image/png')).toThrow('megapixels');
    expect(() => validatePhotoFile(png(20, 20), 'image/png')).toThrow('too small');
    expect(() => validatePhotoFile(new Uint8Array(16 * 1024 * 1024 + 1), 'image/png')).toThrow('16 MB');
  });
  it('rejects animated PNG and WebP instead of sampling an arbitrary frame', () => {
    const animatedPng = new Uint8Array(53);
    animatedPng.set(png(320, 320));
    const pngView = new DataView(animatedPng.buffer);
    pngView.setUint32(8, 13); pngView.setUint32(33, 8);
    animatedPng.set(new TextEncoder().encode('acTL'), 37);
    expect(() => rasterSize(animatedPng)).toThrow('Animated PNG');
    const animatedWebp = new Uint8Array(30);
    animatedWebp.set(new TextEncoder().encode('RIFF'), 0);
    animatedWebp.set(new TextEncoder().encode('WEBPVP8X'), 8);
    new DataView(animatedWebp.buffer).setUint32(16, 10, true);
    animatedWebp[20] = 2;
    expect(() => rasterSize(animatedWebp)).toThrow('Animated WebP');
  });
});

describe('photo input provider boundary', () => {
  it('merges only the reviewed face and forbids center replacement', () => {
    const before = toColors(solvedCube(), PRACTICE_SCHEME);
    const reviewed = Array<Color>(9).fill('red');
    reviewed[4] = 'green';
    const after = new PhotoInputProvider(before, 'F', reviewed, PRACTICE_SCHEME).capture();
    expect(after.provider).toBe('photo');
    expect(after.stickers.slice(18, 27)).toEqual(reviewed);
    expect(after.stickers.slice(0, 18)).toEqual(before.slice(0, 18));
    expect(after.stickers.slice(27)).toEqual(before.slice(27));
    expect(() => new PhotoInputProvider(before, 'U', reviewed, PRACTICE_SCHEME).capture()).toThrow('fixed center');
    expect(before[18]).toBe('green');
  });
  const schemes: ColorScheme[] = [PRACTICE_SCHEME, { U: 'blue', R: 'orange', F: 'yellow', D: 'green', L: 'red', B: 'white' }];
  for (const scheme of schemes) {
    it(`reconstructs a scrambled cube from six photos with ${scheme.U} Up / ${scheme.F} Front`, () => {
      const original = applyAlgorithm(solvedCube(), parseAlgorithm("R U2 F' L2 D B R'"));
      const colors = toColors(original, scheme);
      let entry = emptyEntry();
      FACES.forEach((face, index) => {
        const result = analyzePhoto(image([...colors.slice(index * 9, index * 9 + 9)]), QUAD, scheme[face]);
        entry = new PhotoInputProvider(entry, face, reviewedColors(result, result.predictions.map((p) => p.color), true, true), scheme).capture().stickers;
      });
      const valid = validateColors(entry);
      expect(valid.ok).toBe(true);
      if (valid.ok) expect(cubeKey(valid.cube)).toBe(cubeKey(original));
    });
  }
});
