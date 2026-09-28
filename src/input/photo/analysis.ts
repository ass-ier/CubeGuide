import { COLORS, COLOR_INFO, isColor, type Color } from '../../cube/types';
import { cropError, projectiveMap, type Pixels, type Quad } from './geometry';

export type RGB = readonly [number, number, number];
export type Calibration = Readonly<Partial<Record<Color, RGB>>>;
export const MIN_COLOR_PEAK = 20;
export interface Prediction {
  readonly color: Color | null;
  readonly confidence: number;
  readonly sample: RGB;
  readonly reason: string | null;
}
export interface StickerPrediction extends Prediction {
  readonly readable: boolean;
}
export interface PhotoSamples {
  readonly predictions: readonly StickerPrediction[];
  readonly warnings: readonly string[];
}
export interface PhotoAnalysis extends PhotoSamples {
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

function chroma(rgb: RGB): { hue: number; saturation: number; peak: number; range: number } {
  const peak = Math.max(...rgb), low = Math.min(...rgb), range = peak - low;
  let hue = 0;
  if (range > 0) {
    if (peak === rgb[0]) hue = (rgb[1] - rgb[2]) / range;
    else if (peak === rgb[1]) hue = 2 + (rgb[2] - rgb[0]) / range;
    else hue = 4 + (rgb[0] - rgb[1]) / range;
  }
  return { hue: (hue * 60 + 360) % 360, saturation: range / Math.max(peak, 1), peak, range };
}

const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

function matchColor(sample: RGB, references: readonly { color: Color; samples: readonly RGB[] }[]): Prediction {
  if (sample.some((value) => !Number.isFinite(value) || value < 0 || value > 255)) throw new Error('Photo samples must contain valid RGB values.');
  const value = chroma(sample);
  if (value.peak < MIN_COLOR_PEAK) return { color: null, sample, confidence: 0, reason: 'Too dark to identify. Add diffuse light or choose this color manually.' };
  const white = references.find((reference) => reference.color === 'white');
  const neutralLimit = Math.min(0.16, Math.max(0.1, ...(white?.samples.map((rgb) => chroma(rgb).saturation + 0.04) ?? [])));
  if (value.saturation <= neutralLimit) {
    return {
      color: 'white', sample, confidence: 1 - value.saturation * 2,
      reason: sample.every((channel) => channel > 251) ? 'Very bright sample; check for glare.' : null,
    };
  }
  if (value.saturation < neutralLimit + 0.07 || value.range < 5) {
    return { color: null, sample, confidence: 0, reason: 'Too little color remains to separate white from a faded sticker. Add neutral light or enter its color manually.' };
  }
  // Hue survives both exposure changes and an achromatic fading layer; Lab distance does not.
  const distances = references.filter(({ color }) => color !== 'white').map(({ color, samples }) => ({
    color, distance: Math.min(...samples.map((reference) => hueDistance(value.hue, chroma(reference).hue))),
  })).sort((a, b) => a.distance - b.distance);
  const best = distances[0], second = distances[1];
  const confidence = Math.max(0, Math.min(1, (1 - best.distance / Math.max(second.distance, 1)) * Math.exp(-best.distance / 65)));
  if (best.distance > 32) return { color: null, confidence, sample, reason: 'This sample does not closely match a cube color. Check lighting and alignment.' };
  return {
    color: best.color, sample, confidence,
    reason: confidence < 0.45 ? `Could be ${best.color} or ${second.color}. Review this sticker carefully.`
      : sample.every((channel) => channel > 251) ? 'Very bright sample; check for glare.' : null,
  };
}

export function classifyColor(sample: RGB, calibration: Calibration = {}): Prediction {
  return matchColor(sample, REFERENCES.map(({ color, rgb }) => {
    const samples: RGB[] = [rgb];
    if (calibration[color]) samples.push(calibration[color]);
    return { color, samples };
  }));
}

export function classifyWithCenters(sample: RGB, calibration: Calibration): Prediction {
  return matchColor(sample, COLORS.map((color) => {
    const center = calibration[color];
    if (!center) throw new Error('All six distinct center samples are needed before matching sticker colors.');
    return { color, samples: [center] };
  }));
}

export function colorDistance(a: RGB, b: RGB): number {
  const first = lab(normalized(a)), second = lab(normalized(b));
  return Math.sqrt(0.18 * (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2);
}

interface PixelSample {
  readonly rgb: RGB;
  readonly sector: number;
}

function sampleSticker(pixels: readonly PixelSample[], calibration: Calibration): StickerPrediction {
  const signals = pixels.map((pixel) => ({ ...pixel, ...chroma(pixel.rgb) }));
  const brightness = signals.map((signal) => signal.peak).sort((a, b) => a - b);
  // Keep coherent dim patches, but exclude ink that is much darker than this sticker.
  const signalFloor = Math.max(10, brightness[Math.floor(brightness.length * 0.75)] * 0.28);
  const usable = signals.filter((signal) => signal.peak >= signalFloor && !signal.rgb.every((channel) => channel > 251));
  const neutral = usable.filter((signal) => signal.saturation <= 0.14);
  const colored = usable.filter((signal) => signal.saturation > 0.14 && signal.range >= 5);
  let pigment: typeof colored = [];
  for (const seed of colored) {
    const neighbors = colored.filter((signal) => hueDistance(seed.hue, signal.hue) < 14);
    if (neighbors.length > pigment.length) pigment = neighbors;
  }
  const isNeutral = neutral.length > pigment.length;
  const cluster = isNeutral ? neutral : pigment;
  const support = cluster.length / pixels.length;
  const sectors = Array<number>(9).fill(0);
  cluster.forEach((signal) => sectors[signal.sector]++);
  const competing = isNeutral ? colored.length
    : colored.filter((signal) => !pigment.includes(signal)).length;
  const conflict = competing > pixels.length * 0.2 || !isNeutral && neutral.length > pixels.length * 0.4;
  const supported = support >= 0.42 && sectors.filter((count) => count >= 5).length >= 6
    && [0, 2, 6, 8].every((sector) => sectors[sector] >= 4) && !conflict;
  const selected = cluster.length ? cluster : signals;
  const average = (channel: number) => {
    const values = selected.map((signal) => signal.rgb[channel]).sort((a, b) => a - b);
    const trim = Math.floor(values.length * 0.15), middle = values.slice(trim, values.length - trim);
    return middle.reduce((sum, value) => sum + value, 0) / middle.length;
  };
  const sample: RGB = [average(0), average(1), average(2)];
  const prediction = classifyColor(sample, calibration);
  const readable = supported && Math.max(...sample) >= MIN_COLOR_PEAK;
  return Object.freeze(readable ? { ...prediction, readable } : {
    ...prediction, readable, confidence: 0,
    reason: conflict ? 'Mixed colors inside this sticker. Realign the face or correct this color manually.'
      : 'Not enough intact color across this sticker. Reduce glare, add diffuse light, or enter its color manually.',
  });
}

export function samplePhoto(image: Pixels, quad: Quad, calibration: Calibration = {}): PhotoSamples {
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
    const samples: PixelSample[] = [];
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) samples.push({
        rgb: pixel((col + 0.15 + x * 0.05) / 3, (row + 0.15 + y * 0.05) / 3),
        sector: Math.floor(y / 5) * 3 + Math.floor(x / 5),
      });
    }
    return sampleSticker(samples, calibration);
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
  return Object.freeze({ predictions: Object.freeze(predictions), warnings: Object.freeze(warnings) });
}

export function analyzePhoto(image: Pixels, quad: Quad, expectedCenter: Color, calibration: Calibration = {}): PhotoAnalysis {
  const { predictions, warnings } = samplePhoto(image, quad, calibration);
  const center = predictions[4];
  const centerNeedsConfirmation = center.color !== expectedCenter || center.confidence < 0.45 || center.reason !== null
    || warnings.some((warning) => warning.startsWith('No clear sticker borders'));
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
