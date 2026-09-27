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
}

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
      const inside = column % 1 > 0.07 && column % 1 < 0.93 && row % 1 > 0.07 && row % 1 < 0.93;
      const cell = Math.floor(row) * 3 + Math.floor(column);
      const pigment = region.samples?.[cell] ?? PIGMENTS[region.colors[cell]];
      const exposure = (region.light ?? 1) * (0.84 + 0.12 * u);
      const noise = (x * 13 + y * 19) % 7 - 3;
      rgb = inside ? pigment.map((channel) => channel * exposure + noise) : region.seam ?? [17, 22, 27];
      break;
    }
    data.set([...rgb, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}
