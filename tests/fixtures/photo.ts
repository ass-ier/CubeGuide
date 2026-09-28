import type { Color } from '../../src/cube/types';
import type { RGB } from '../../src/input/photo/analysis';
import type { Pixels, Quad } from '../../src/input/photo/geometry';

export const PIGMENTS: Record<Color, RGB> = {
  white: [236, 237, 229], yellow: [242, 211, 39], green: [41, 154, 78],
  blue: [35, 89, 210], red: [205, 42, 41], orange: [240, 131, 26],
};

export interface PhotoRegion {
  readonly colors: readonly Color[];
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly angle?: number;
  readonly perspectiveX?: number;
  readonly perspectiveY?: number;
  readonly light?: number;
  readonly samples?: readonly RGB[];
  readonly seam?: RGB;
  readonly gap?: number;
  readonly rounded?: number;
  readonly fade?: number | readonly number[];
  readonly scratches?: boolean;
  readonly logo?: boolean;
  readonly shadow?: number;
}

export const WORN_SURFACES: readonly Partial<PhotoRegion>[] = [
  { rounded: 0.16, gap: 0.025, logo: true },
  { fade: [0.05, 0.5, 0.58, 0.4, 0.62, 0.3, 0.35, 0.1, 0.55] },
  { scratches: true },
  { shadow: 0.55, rounded: 0.14, gap: 0.035 },
  { rounded: 0.12, gap: 0.045, scratches: true, logo: true, fade: 0.35, shadow: 0.2 },
];

export function fixtureCorners(region: PhotoRegion): Quad {
  const angle = (region.angle ?? 0) * Math.PI / 180, p = region.perspectiveX ?? 0, q = region.perspectiveY ?? 0;
  const point = (u: number, v: number) => ({
    x: (region.x + region.size * Math.cos(angle) * u - region.size * Math.sin(angle) * v) / (1 + p * u + q * v),
    y: (region.y + region.size * Math.sin(angle) * u + region.size * Math.cos(angle) * v) / (1 + p * u + q * v),
  });
  return [point(0, 0), point(1, 0), point(1, 1), point(0, 1)];
}

export function fixturePhoto(regions: readonly PhotoRegion[], width = 640, height = 480, background: RGB = [151, 159, 171]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  const transforms = regions.map((region) => {
    const angle = (region.angle ?? 0) * Math.PI / 180;
    return { ...region, xx: region.size * Math.cos(angle), xy: -region.size * Math.sin(angle), yx: region.size * Math.sin(angle), yy: region.size * Math.cos(angle) };
  });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let rgb: readonly number[] = background;
    for (const region of transforms) {
      const p = region.perspectiveX ?? 0, q = region.perspectiveY ?? 0;
      const a = region.xx - p * x, b = region.xy - q * x, c = region.yx - p * y, d = region.yy - q * y;
      const determinant = a * d - b * c;
      const u = ((x - region.x) * d - b * (y - region.y)) / determinant;
      const v = (a * (y - region.y) - (x - region.x) * c) / determinant;
      if (u < 0 || u >= 1 || v < 0 || v >= 1 || !Number.isFinite(u) || !Number.isFinite(v)) continue;
      const column = u * 3, row = v * 3;
      const gap = region.gap ?? 0.07, radius = region.rounded ?? 0;
      const cx = column % 1, cy = row % 1;
      const dx = Math.max(gap + radius - cx, cx - (1 - gap - radius), 0);
      const dy = Math.max(gap + radius - cy, cy - (1 - gap - radius), 0);
      const inside = cx > gap && cx < 1 - gap && cy > gap && cy < 1 - gap
        && (!radius || dx * dx + dy * dy <= radius * radius);
      const cell = Math.floor(row) * 3 + Math.floor(column);
      const pigment = region.samples?.[cell] ?? PIGMENTS[region.colors[cell]];
      const fade = typeof region.fade === 'number' ? region.fade : region.fade?.[cell] ?? 0;
      const exposure = (region.light ?? 1) * (0.84 + 0.12 * u) * (1 - (region.shadow ?? 0) * (1 - v));
      const noise = (x * 13 + y * 19) % 7 - 3;
      let surface: readonly number[] = pigment.map((channel) => channel * (1 - fade) + 225 * fade);
      if (region.scratches) {
        if (Math.abs(cy - (0.19 + 0.64 * cx)) < 0.014) surface = [233, 231, 228];
        if (Math.abs(cx - (0.38 + 0.12 * cy)) < 0.018) surface = [22, 23, 22];
        if (Math.abs(cy - (0.68 - 0.13 * cx)) < 0.011) surface = [179, 176, 173];
      }
      if (region.logo && cell === 4 && Math.hypot(cx - 0.5, cy - 0.5) < 0.23) surface = [13, 15, 18];
      rgb = inside ? surface.map((channel) => channel * exposure + noise) : region.seam ?? [17, 22, 27];
      break;
    }
    data.set([...rgb, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}

export function degradedPhoto(image: Pixels, { exposure = 1, noise = 0, cast = [1, 1, 1], blur = 0 }: {
  exposure?: number; noise?: number; cast?: RGB; blur?: number;
} = {}): Pixels {
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const offset = (y * image.width + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      let sum = 0, count = 0;
      for (let yy = Math.max(0, y - blur); yy <= Math.min(image.height - 1, y + blur); yy++) {
        for (let xx = Math.max(0, x - blur); xx <= Math.min(image.width - 1, x + blur); xx++) {
          sum += image.data[(yy * image.width + xx) * 4 + channel]; count++;
        }
      }
      const sensorNoise = (((x * 73856093 ^ y * 19349663 ^ channel * 83492791) >>> 0) % 101 / 50 - 1) * noise;
      data[offset + channel] = sum / count * exposure * cast[channel] + sensorNoise;
    }
    data[offset + 3] = image.data[offset + 3];
  }
  return { width: image.width, height: image.height, data };
}
