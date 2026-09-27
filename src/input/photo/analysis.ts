import { COLORS, COLOR_INFO, isColor, type Color } from '../../cube/types';
import { cropError, projectiveMap, type Pixels, type Quad } from './geometry';

export type RGB = readonly [number, number, number];
export type Calibration = Readonly<Partial<Record<Color, RGB>>>;
export interface Prediction {
  readonly color: Color | null;
  readonly confidence: number;
  readonly sample: RGB;
  readonly reason: string | null;
}
export interface PhotoAnalysis {
  readonly predictions: readonly Prediction[];
  readonly warnings: readonly string[];
  readonly expectedCenter: Color;
  readonly centerNeedsConfirmation: boolean;
}

function lab(rgb: RGB): RGB {
  const linear = rgb.map((value) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = linear;
  const f = (value: number) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function normalized(rgb: RGB): RGB {
  const scale = 235 / Math.max(...rgb, 1);
  return [rgb[0] * scale, rgb[1] * scale, rgb[2] * scale];
}

const REFERENCES = COLORS.map((color) => {
  const hex = COLOR_INFO[color].hex;
  const rgb: RGB = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  return { color, rgb };
});

export function classifyColor(sample: RGB, calibration: Calibration = {}): Prediction {
  if (sample.some((value) => !Number.isFinite(value) || value < 0 || value > 255)) throw new Error('Photo samples must contain valid RGB values.');
  const peak = Math.max(...sample);
  if (peak < 48) return { color: null, sample, confidence: 0, reason: 'Too dark to identify. Retake in even light or choose this color manually.' };
  const value = lab(normalized(sample));
  const distances = REFERENCES.map(({ color, rgb }) => {
    const references: RGB[] = [rgb];
    if (calibration[color]) references.push(calibration[color]);
    const distance = Math.min(...references.map((reference) => {
      const expected = lab(normalized(reference));
      return Math.sqrt(0.18 * (value[0] - expected[0]) ** 2 + (value[1] - expected[1]) ** 2 + (value[2] - expected[2]) ** 2);
    }));
    return { color, distance };
  }).sort((a, b) => a.distance - b.distance);
  const best = distances[0], second = distances[1];
  const confidence = Math.max(0, Math.min(1, (1 - best.distance / Math.max(second.distance, 1)) * Math.exp(-best.distance / 70)));
  if (best.distance > 48) return { color: null, confidence, sample, reason: 'This sample does not closely match a cube color. Check lighting and alignment.' };
  return {
    color: best.color, sample, confidence,
    reason: confidence < 0.45 ? `Could be ${best.color} or ${second.color}. Review this sticker carefully.`
      : sample.every((channel) => channel > 251) ? 'Very bright sample; check for glare.' : null,
  };
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

export function analyzePhoto(image: Pixels, quad: Quad, expectedCenter: Color, calibration: Calibration = {}): PhotoAnalysis {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 32 || image.height < 32
    || image.width > 1024 || image.height > 1024 || image.data.length !== image.width * image.height * 4) {
    throw new Error('The analysis image must be a decoded 32-1024 pixel raster with complete RGBA data.');
  }
  const invalidCrop = cropError(quad, image.width, image.height);
  if (invalidCrop) throw new Error(invalidCrop);
  const map = projectiveMap(quad);
  const pixel = (u: number, v: number): RGB => {
    const point = map(u, v);
    const x = Math.max(0, Math.min(image.width - 1, Math.round(point.x)));
    const y = Math.max(0, Math.min(image.height - 1, Math.round(point.y)));
    const offset = (y * image.width + x) * 4;
    const alpha = image.data[offset + 3] / 255;
    return [image.data[offset] * alpha, image.data[offset + 1] * alpha, image.data[offset + 2] * alpha];
  };
  const predictions = Array.from({ length: 9 }, (_, cell) => {
    const row = Math.floor(cell / 3), col = cell % 3;
    const samples: RGB[] = [];
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) samples.push(pixel((col + 0.25 + x / 16) / 3, (row + 0.25 + y / 16) / 3));
    }
    const sample: RGB = [0, 1, 2].map((channel) => median(samples.map((rgb) => rgb[channel]))) as [number, number, number];
    const prediction = classifyColor(sample, calibration);
    const spread = median(samples.map((rgb) => Math.hypot(...rgb.map((value, i) => value - sample[i]))));
    return Object.freeze(spread > 36
      ? { ...prediction, confidence: prediction.confidence * 0.5, reason: 'Mixed colors or reflections inside this sticker. Realign or correct it manually.' }
      : prediction);
  });
  const warnings: string[] = [];
  const sampleBrightness = predictions.reduce((sum, p) => sum + Math.max(...p.sample), 0) / 9;
  const boundaries: number[] = [];
  for (const line of [1 / 3, 2 / 3]) {
    for (const center of [1 / 6, 0.5, 5 / 6]) {
      boundaries.push(Math.max(...pixel(line, center)), Math.max(...pixel(center, line)));
    }
  }
  const boundaryBrightness = boundaries.reduce((a, b) => a + b, 0) / boundaries.length;
  const uniform = predictions.every((p) => Math.hypot(...p.sample.map((value, i) => value - predictions[0].sample[i])) < 12);
  if (uniform && sampleBrightness - boundaryBrightness < 16) {
    warnings.push('No clear sticker borders were found. This could be a blank image or a poorly aligned face. Inspect all nine cells; never assume unseen stickers.');
  }
  if (predictions.some((p) => p.color === null)) warnings.push('Some colors could not be identified. Choose each missing color or retake the photo.');
  if (predictions.some((p) => p.reason)) warnings.push('Flagged samples need careful review. Even unflagged estimates can be wrong under different lighting.');
  const center = predictions[4];
  const centerNeedsConfirmation = center.color !== expectedCenter || center.confidence < 0.45 || center.reason !== null || uniform && warnings.length > 0;
  return Object.freeze({ predictions: Object.freeze(predictions), warnings: Object.freeze(warnings), expectedCenter, centerNeedsConfirmation });
}

export function reviewedColors(
  analysis: PhotoAnalysis,
  corrections: readonly (Color | null)[],
  reviewed: boolean,
  centerConfirmed: boolean,
): readonly Color[] {
  if (!reviewed) throw new Error('Review all nine colors before applying this photo.');
  if (corrections.length !== 9 || corrections.some((color, i) => i !== 4 && !isColor(color))) throw new Error('Choose a color for every uncertain or empty sticker.');
  if (analysis.centerNeedsConfirmation && !centerConfirmed) throw new Error('Confirm the configured center identity or retake the correct face.');
  return Object.freeze(corrections.map((color, i) => {
    if (i === 4) return analysis.expectedCenter;
    if (!isColor(color)) throw new Error('An unreviewed color remains.');
    return color;
  }));
}
