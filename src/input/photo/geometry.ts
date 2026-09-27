export interface Point { readonly x: number; readonly y: number }
export type Quad = readonly [Point, Point, Point, Point];
export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export function replaceCorner(quad: Quad, index: number, point: Point): Quad {
  return [index === 0 ? point : quad[0], index === 1 ? point : quad[1], index === 2 ? point : quad[2], index === 3 ? point : quad[3]];
}

export function defaultQuad(width: number, height: number): Quad {
  const size = Math.min(width, height) * 0.76;
  const x = (width - size) / 2, y = (height - size) / 2;
  return [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }];
}

export function cropError(quad: Quad, width: number, height: number): string | null {
  if (quad.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > width - 1 || p.y > height - 1)) {
    return 'Keep all four corners inside the photo.';
  }
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i], b = quad[(i + 1) % 4], c = quad[(i + 2) % 4];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 24) return 'Make the face region larger; each edge needs at least 24 image pixels.';
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0) {
      return 'Corners must go around the face in order: top-left, top-right, bottom-right, bottom-left. Do not cross or mirror them.';
    }
    area += a.x * b.y - a.y * b.x;
  }
  return area < 1800 ? 'The selected face is too small. Move the corners outward or take a closer photo.' : null;
}

export function projectiveMap(quad: Quad): (u: number, v: number) => Point {
  const [p0, p1, p2, p3] = quad;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(determinant) < 1e-8) throw new Error('The face corners are degenerate. Select a visible, four-sided face.');
  const g = (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = (dx1 * dy3 - dx3 * dy1) / determinant;
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y;
  return (u, v) => {
    const scale = g * u + h * v + 1;
    if (Math.abs(scale) < 1e-8) throw new Error('This perspective crop cannot be sampled safely. Realign its corners.');
    return { x: (a * u + b * v + p0.x) / scale, y: (d * u + e * v + p0.y) / scale };
  };
}

export function rotatePixels(image: Pixels, clockwise: boolean): Pixels {
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const dx = clockwise ? image.height - 1 - y : y;
      const dy = clockwise ? x : image.width - 1 - x;
      const from = (y * image.width + x) * 4, to = (dy * image.height + dx) * 4;
      data.set(image.data.subarray(from, from + 4), to);
    }
  }
  return { width: image.height, height: image.width, data };
}
