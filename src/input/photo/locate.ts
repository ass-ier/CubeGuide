import { cropError, projectiveMap, type Pixels, type Point, type Quad } from './geometry';

const MAX_SIDE = 480;
const MAX_COMPONENTS = 60;
const MAX_NEIGHBORS = 11;

interface Component {
  readonly id: number;
  readonly center: Point;
  readonly area: number;
}

export interface LocatedFace {
  readonly quad: Quad;
  readonly confidence: number;
  readonly componentCount: number;
}

const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function area(points: readonly Point[]): number {
  return Math.abs(points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length];
    return sum + a.x * b.y - a.y * b.x;
  }, 0)) / 2;
}

function hull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (list: readonly Point[]) => {
    const result: Point[] = [];
    for (const point of list) {
      while (result.length >= 2 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) result.pop();
      result.push(point);
    }
    return result;
  };
  const lower = half(sorted), upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function fourCorners(points: readonly Point[]): Quad | null {
  const polygon = [...points];
  if (polygon.length < 4) return null;
  while (polygon.length > 4) {
    let smallest = Infinity, remove = 0;
    for (let i = 0; i < polygon.length; i++) {
      const triangle = Math.abs(cross(polygon[(i + polygon.length - 1) % polygon.length], polygon[i], polygon[(i + 1) % polygon.length]));
      if (triangle < smallest) { smallest = triangle; remove = i; }
    }
    polygon.splice(remove, 1);
  }
  let start = 0;
  for (let i = 1; i < 4; i++) {
    if (polygon[i].x + polygon[i].y < polygon[start].x + polygon[start].y) start = i;
  }
  return [polygon[start], polygon[(start + 1) % 4], polygon[(start + 2) % 4], polygon[(start + 3) % 4]];
}

function diagonalCenter(quad: Quad): Point {
  const [a, b, c, d] = quad;
  const rx = c.x - a.x, ry = c.y - a.y, sx = d.x - b.x, sy = d.y - b.y;
  const t = ((b.x - a.x) * sy - (b.y - a.y) * sx) / (rx * sy - ry * sx);
  return { x: a.x + t * rx, y: a.y + t * ry };
}

function components(image: Pixels): { candidates: Component[]; width: number; height: number } {
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale), height = Math.round(image.height * scale);
  const mask = new Uint8Array(width * height), visited = new Uint8Array(mask.length);
  const pixels = new Uint8ClampedArray(mask.length * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / width));
    const sy = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / height));
    const index = (sy * image.width + sx) * 4, alpha = image.data[index + 3] / 255;
    const r = image.data[index] * alpha, g = image.data[index + 1] * alpha, b = image.data[index + 2] * alpha;
    const high = Math.max(r, g, b), low = Math.min(r, g, b);
    mask[y * width + x] = high > 55 && ((high - low) / high > 0.2 || low > 85) ? 1 : 0;
    pixels.set([r, g, b], (y * width + x) * 3);
  }
  // Smoothed contrast boundaries separate stickers even when the cube body is light.
  const smooth = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let r = 0, g = 0, b = 0, count = 0;
    for (let dy = Math.max(0, y - 1); dy <= Math.min(height - 1, y + 1); dy++) {
      for (let dx = Math.max(0, x - 1); dx <= Math.min(width - 1, x + 1); dx++) {
        const offset = (dy * width + dx) * 3;
        r += pixels[offset]; g += pixels[offset + 1]; b += pixels[offset + 2]; count++;
      }
    }
    smooth.set([r / count, g / count, b / count], (y * width + x) * 3);
  }
  const difference = (a: number, b: number) => {
    const first = a * 3, second = b * 3;
    return (smooth[first] - smooth[second]) ** 2
      + (smooth[first + 1] - smooth[second + 1]) ** 2
      + (smooth[first + 2] - smooth[second + 2]) ** 2;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (difference(y * width + Math.max(0, x - 2), y * width + Math.min(width - 1, x + 2)) > 18 ** 2
      || difference(Math.max(0, y - 2) * width + x, Math.min(height - 1, y + 2) * width + x) > 18 ** 2) {
      mask[y * width + x] = 0;
    }
  }
  const queue = new Int32Array(mask.length), candidates: Component[] = [];
  const minArea = Math.max(24, mask.length * 0.00018);
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || visited[seed]) continue;
    let head = 0, tail = 1, minX = width, minY = height, maxX = 0, maxY = 0;
    queue[0] = seed; visited[seed] = 1;
    while (head < tail) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (next >= 0 && mask[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (tail < minArea || tail > mask.length * 0.25 || Math.min(w, h) < 6
      || Math.min(w, h) / Math.max(w, h) < 0.3 || tail / (w * h) < 0.4) continue;
    const boundary: Point[] = [];
    for (let i = 0; i < tail; i++) {
      const index = queue[i], x = index % width, y = Math.floor(index / width);
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1
        || !mask[index - 1] || !mask[index + 1] || !mask[index - width] || !mask[index + width]) boundary.push({ x, y });
    }
    const polygon = hull(boundary), polygonArea = area(polygon), quad = fourCorners(polygon);
    if (!quad || polygonArea < 16 || tail / polygonArea < 0.7 || area(quad) / polygonArea < 0.78) continue;
    const sides = quad.map((point, i) => distance(point, quad[(i + 1) % 4]));
    if (Math.min(...sides) / Math.max(...sides) < 0.3) continue;
    const center = diagonalCenter(quad);
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) continue;
    candidates.push({ id: candidates.length, center, area: polygonArea });
    if (candidates.length > MAX_COMPONENTS) {
      throw new Error('Too much background detail to find one face reliably. Retake it against a plain background.');
    }
  }
  return { candidates, width, height };
}

interface Grid {
  readonly quad: Quad;
  readonly center: Point;
  readonly ids: readonly number[];
  readonly pitch: number;
  readonly error: number;
}

function fitGrid(group: readonly Component[], anchor: Component): Grid | null {
  const quad = fourCorners(hull(group.map((component) => component.center)));
  if (!quad || area(quad) < 100) return null;
  const sides = quad.map((point, i) => distance(point, quad[(i + 1) % 4]));
  if (Math.min(...sides) / Math.max(...sides) < 0.35) return null;
  const map = projectiveMap(quad);
  const points = Array.from({ length: 9 }, (_, i) => map((i % 3) / 2, Math.floor(i / 3) / 2));
  const pitch = sides.reduce((sum, side) => sum + side, 0) / 8;
  const used = new Set<number>();
  let squaredError = 0;
  for (let i = 0; i < 9; i++) {
    let nearest: Component | null = null, delta = Infinity;
    for (const component of group) {
      const d = distance(points[i], component.center);
      if (d < delta) { delta = d; nearest = component; }
    }
    if (!nearest || used.has(nearest.id) || delta > pitch * 0.14 || i === 4 && nearest.id !== anchor.id) return null;
    used.add(nearest.id); squaredError += delta * delta;
  }
  const error = Math.sqrt(squaredError / 9) / pitch;
  if (error > 0.065) return null;
  // The fitted corner points are sticker centers (1/6 and 5/6), not face corners.
  const face: Quad = [map(-0.25, -0.25), map(1.25, -0.25), map(1.25, 1.25), map(-0.25, 1.25)];
  return { quad: face, center: points[4], ids: [...used], pitch, error };
}

export function locateFace(image: Pixels): LocatedFace {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 32 || image.height < 32
    || image.width > 1024 || image.height > 1024 || image.data.length !== image.width * image.height * 4) {
    throw new Error('Use a readable photo with a complete face. The working image must be a complete 32-1024 pixel raster.');
  }
  const { candidates, width, height } = components(image);
  const grids: Grid[] = [];
  for (const center of candidates) {
    const nearby = candidates.filter((candidate) => candidate.id !== center.id
      && candidate.area / center.area > 0.28 && candidate.area / center.area < 3.6
      && distance(candidate.center, center.center) < Math.sqrt(center.area) * 2.7)
      .sort((a, b) => distance(a.center, center.center) - distance(b.center, center.center)).slice(0, MAX_NEIGHBORS);
    if (nearby.length < 8) continue;
    const choose = (start: number, selected: Component[]) => {
      if (selected.length === 8) {
        const grid = fitGrid([center, ...selected], center);
        if (!grid) return;
        const existing = grids.findIndex((other) => distance(other.center, grid.center) < Math.min(other.pitch, grid.pitch) * 0.2
          && other.ids.filter((id) => grid.ids.includes(id)).length >= 7);
        if (existing < 0) grids.push(grid);
        else if (grids[existing].error > grid.error) grids[existing] = grid;
        return;
      }
      for (let i = start; i <= nearby.length - (8 - selected.length); i++) choose(i + 1, [...selected, nearby[i]]);
    };
    choose(0, []);
  }
  if (!grids.length) throw new Error('Could not find all nine stickers clearly. Retake one complete face, straight on, with visible gaps and even light.');
  if (grids.length > 1) throw new Error('More than one face or grid is visible. Retake just the named face, straight on.');
  const grid = grids[0];
  const scalePoint = (point: Point): Point => ({
    x: point.x * image.width / width, y: point.y * image.height / height,
  });
  const raw: Quad = [scalePoint(grid.quad[0]), scalePoint(grid.quad[1]), scalePoint(grid.quad[2]), scalePoint(grid.quad[3])];
  const allowance = 2 * Math.max(image.width / width, image.height / height);
  if (raw.some((point) => point.x < -allowance || point.y < -allowance || point.x > image.width - 1 + allowance || point.y > image.height - 1 + allowance)) {
    throw new Error('Part of the face is outside the photo. Move back a little and include all nine stickers.');
  }
  const clamp = (point: Point): Point => ({ x: Math.max(0, Math.min(image.width - 1, point.x)), y: Math.max(0, Math.min(image.height - 1, point.y)) });
  const quad: Quad = [clamp(raw[0]), clamp(raw[1]), clamp(raw[2]), clamp(raw[3])];
  if (cropError(quad, image.width, image.height)) throw new Error('The face is too small or too tilted to read reliably. Retake it closer and straight on.');
  return { quad, confidence: Math.max(0, 1 - grid.error / 0.14), componentCount: candidates.length };
}

export function faceThumbnail(image: Pixels, quad: Quad, side = 168): Pixels {
  const map = projectiveMap(quad), data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const point = map((x + 0.5) / side, (y + 0.5) / side);
    const sx = Math.max(0, Math.min(image.width - 1, Math.round(point.x)));
    const sy = Math.max(0, Math.min(image.height - 1, Math.round(point.y)));
    const source = (sy * image.width + sx) * 4;
    data.set(image.data.subarray(source, source + 4), (y * side + x) * 4);
  }
  return { width: side, height: side, data };
}
