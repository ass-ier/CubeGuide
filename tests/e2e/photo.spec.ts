import { expect, test, type Page } from '@playwright/test';
import { cubeKey, solvedCube, toColors } from '../../src/cube/model';
import { applyAlgorithm } from '../../src/cube/moves';
import { parseAlgorithm } from '../../src/cube/notation';
import { COLOR_INFO, FACE_NAMES, FACES, PRACTICE_SCHEME, type Color, type Face } from '../../src/cube/types';

const SOLVED = cubeKey(solvedCube());
const errors = new Map<Page, string[]>();
const ORDER: readonly Face[] = ['F', 'R', 'B', 'L', 'U', 'D'];
const BOUNDS = { x: 135, y: 55, size: 300, width: 600, height: 460 };
const PIGMENTS: Record<Color, readonly number[]> = {
  white: [236, 237, 229], yellow: [242, 211, 39], green: [41, 154, 78],
  blue: [35, 89, 210], red: [205, 42, 41], orange: [240, 131, 26],
};

async function generatedPhoto(page: Page, colors: readonly Color[], options: { rotate?: boolean; blank?: boolean; mime?: string } = {}) {
  const mimeType = options.mime ?? 'image/png';
  const base64 = await page.evaluate(({ colors, pigments, bounds, options, mimeType }) => {
    const canvas = document.createElement('canvas');
    canvas.width = bounds.width; canvas.height = bounds.height;
    const context = canvas.getContext('2d')!;
    const pixels = context.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4;
      let rgb: readonly number[] = options.blank ? [133, 133, 133] : [168, 174, 182];
      if (!options.blank && x >= bounds.x && x < bounds.x + bounds.size && y >= bounds.y && y < bounds.y + bounds.size) {
        const cell = bounds.size / 3;
        const cx = (x - bounds.x) % cell, cy = (y - bounds.y) % cell;
        const row = Math.floor((y - bounds.y) / cell), col = Math.floor((x - bounds.x) / cell);
        const noise = ((x * 13 + y * 19) % 7) - 3;
        const brightness = 0.82 + 0.14 * (x - bounds.x) / bounds.size;
        rgb = cx < 7 || cx > cell - 7 || cy < 7 || cy > cell - 7
          ? [18, 23, 28] : pigments[colors[row * 3 + col]].map((value) => value * brightness + noise);
      }
      pixels.data.set([...rgb, 255], index);
    }
    context.putImageData(pixels, 0, 0);
    if (options.rotate) {
      const rotated = document.createElement('canvas');
      rotated.width = canvas.height; rotated.height = canvas.width;
      const target = rotated.getContext('2d')!;
      target.translate(rotated.width, 0); target.rotate(Math.PI / 2);
      target.drawImage(canvas, 0, 0);
      return rotated.toDataURL(mimeType, 0.96).split(',')[1];
    }
    return canvas.toDataURL(mimeType, 0.96).split(',')[1];
  }, { colors: [...colors], pigments: PIGMENTS, bounds: BOUNDS, options, mimeType });
  return { name: options.rotate ? 'rotated-face.png' : `face.${mimeType.split('/')[1]}`, mimeType, buffer: Buffer.from(base64, 'base64') };
}

async function startPhotos(page: Page) {
  for (const face of FACES) await page.getByLabel(`${FACE_NAMES[face]} center color`).selectOption(PRACTICE_SCHEME[face]);
  await page.getByRole('button', { name: 'Lock centers & enter stickers' }).click();
  await page.getByRole('button', { name: 'Take/upload face photos', exact: true }).click();
}

async function alignPhoto(page: Page) {
  const root = page.getByTestId('photo-input');
  const points = [
    [BOUNDS.x, BOUNDS.y], [BOUNDS.x + BOUNDS.size, BOUNDS.y],
    [BOUNDS.x + BOUNDS.size, BOUNDS.y + BOUNDS.size], [BOUNDS.x, BOUNDS.y + BOUNDS.size],
  ];
  for (let i = 0; i < 4; i++) {
    const handle = root.getByTestId(`crop-corner-${i}`);
    await handle.scrollIntoViewIfNeeded();
    const image = await root.getByTestId('photo-preview').boundingBox();
    const knob = await handle.boundingBox();
    if (!image || !knob) throw new Error('Photo crop controls are not laid out.');
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
    await page.mouse.down();
    await page.mouse.move(image.x + points[i][0] / BOUNDS.width * image.width, image.y + points[i][1] / BOUNDS.height * image.height, { steps: 5 });
    await page.mouse.up();
  }
}

async function detectPhoto(page: Page, face: Face) {
  await alignPhoto(page);
  await page.getByRole('button', { name: 'Detect nine colors', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Review the ${FACE_NAMES[face].toLowerCase()} face`, exact: true })).toBeVisible();
}

async function assertPredictions(page: Page, face: Face, colors: readonly Color[]) {
  const root = page.getByTestId('photo-input');
  for (let i = 0; i < 9; i++) {
    if (i === 4) await expect(root.locator('.photo-center-readout')).toContainText(COLOR_INFO[colors[i]].name);
    else await expect(root.getByLabel(`Review ${FACE_NAMES[face]} sticker ${i + 1} color`, { exact: true })).toHaveValue(colors[i]);
  }
}

async function acceptPhoto(page: Page, face: Face) {
  await page.getByRole('checkbox', { name: 'I checked all nine colors against this face.', exact: true }).check();
  const center = page.getByTestId('photo-input').locator('.photo-center-warning input');
  if (await center.count()) await center.check();
  await page.getByRole('button', { name: `Use reviewed ${FACE_NAMES[face].toLowerCase()} face`, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('net::ERR_FAILED')) messages.push(message.text());
  });
  await page.addInitScript(() => {
    const live = new Set<string>();
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob); live.add(url);
      document.documentElement.dataset.photoObjectUrls = String(live.size);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      revoke(url); live.delete(url);
      document.documentElement.dataset.photoObjectUrls = String(live.size);
    };
  });
  await page.goto('/');
  await expect(page).toHaveTitle("CubeGuide — Rubik's Cube Solver");
  await page.waitForFunction(() => !!window.__cubeGuide?.inspect().visual);
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === 'passed') expect(errors.get(page) ?? []).toEqual([]);
  errors.delete(page);
});

for (const device of [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
]) {
  test.describe(`photo-first landing on ${device.name}`, () => {
    test.use({ viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch });
    test('shows photos above the fold and continues directly from required centers into real upload', async ({ page }) => {
      const action = page.getByTestId('landing-photo-action');
      await expect(page.getByRole('button', { name: 'Take/upload face photos', exact: true })).toHaveCount(1);
      await expect(action).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await action.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#center-title')).toBeFocused();
      await expect(page.locator('.photo-setup-note')).toContainText('open automatically');
      await expect(action).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('button', { name: 'Lock centers & open photos', exact: true })).toBeDisabled();
      expect((await page.evaluate(() => window.__cubeGuide.inspect().entry)).every((color) => color === null)).toBe(true);
      for (const face of FACES) await page.getByLabel(`${FACE_NAMES[face]} center color`).selectOption(PRACTICE_SCHEME[face]);
      await page.getByRole('button', { name: 'Lock centers & open photos', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Photo-assisted entry', exact: true })).toBeFocused();
      await expect(page.getByRole('button', { name: 'Take a photo', exact: true })).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole('button', { name: 'Upload photo', exact: true })).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId('photo-camera')).toHaveAttribute('capture', 'environment');
      const colors = Array<Color>(9).fill('green');
      await page.getByTestId('photo-upload').setInputFiles(await generatedPhoto(page, colors));
      await expect(page.getByTestId('photo-preview')).toBeVisible();
      await detectPhoto(page, 'F');
      await assertPredictions(page, 'F', colors);
      await acceptPhoto(page, 'F');
      expect((await page.evaluate(() => window.__cubeGuide.inspect().entry)).slice(18, 27)).toEqual(colors);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}

test('photo intent, repeat clicks, manual fallback and new cube preserve only the intended state', async ({ page }) => {
  const action = page.getByTestId('landing-photo-action');
  await action.click();
  await page.getByLabel('Up center color').selectOption('white');
  await action.click();
  await expect(page.getByLabel('Up center color')).toHaveValue('white');
  await page.getByRole('button', { name: 'Use manual entry instead', exact: true }).click();
  await expect(page.locator('#center-title')).toBeFocused();
  await expect(action).toHaveAttribute('aria-expanded', 'false');
  for (const face of FACES) await page.getByLabel(`${FACE_NAMES[face]} center color`).selectOption(PRACTICE_SCHEME[face]);
  await page.getByRole('button', { name: 'Lock centers & enter stickers', exact: true }).click();
  await expect(page.getByTestId('photo-input')).toHaveCount(0);
  await page.getByRole('button', { name: 'Paint red stickers', exact: true }).click();
  await page.getByTestId('sticker-F-0').click();
  const entered = await page.evaluate(() => window.__cubeGuide.inspect().entry);
  await action.click();
  await expect(page.getByRole('heading', { name: 'Photo-assisted entry', exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.__cubeGuide.inspect().entry)).toEqual(entered);
  await page.getByTestId('photo-upload').setInputFiles(await generatedPhoto(page, Array<Color>(9).fill('green')));
  await detectPhoto(page, 'F');
  await page.getByLabel('Review Front sticker 1 color', { exact: true }).selectOption('orange');
  const previewUrl = await page.getByTestId('photo-preview').getAttribute('src');
  await action.click();
  await expect(page.getByTestId('photo-preview')).toHaveAttribute('src', previewUrl!);
  await expect(page.getByLabel('Review Front sticker 1 color', { exact: true })).toHaveValue('orange');
  await page.getByRole('button', { name: 'Enter colors manually', exact: true }).click();
  await page.getByRole('button', { name: 'Keep reviewing', exact: true }).click();
  await expect(action).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => window.__cubeGuide.inspect().entry)).toEqual(entered);
  await page.getByRole('button', { name: 'Enter colors manually', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close photo entry', exact: true }).click();
  await expect(page.locator('#sticker-title')).toBeFocused();
  await expect(page.getByTestId('photo-input')).toHaveCount(0);
  expect(await page.evaluate(() => window.__cubeGuide.inspect().entry)).toEqual(entered);
  expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('0');
  await action.click();
  await page.getByRole('button', { name: 'New cube', exact: true }).click();
  await page.getByRole('button', { name: 'Keep my cube', exact: true }).click();
  await expect(action).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => window.__cubeGuide.inspect().entry)).toEqual(entered);
  await page.getByRole('button', { name: 'New cube', exact: true }).click();
  await page.getByRole('button', { name: 'Start new cube', exact: true }).click();
  await expect(action).toHaveAttribute('aria-expanded', 'false');
  for (const face of FACES) await page.getByLabel(`${FACE_NAMES[face]} center color`).selectOption(PRACTICE_SCHEME[face]);
  await page.getByRole('button', { name: 'Lock centers & enter stickers', exact: true }).click();
  await expect(page.getByTestId('photo-input')).toHaveCount(0);
});

test('six real raster uploads -> four-corner alignment -> reviewed colors -> real verified solution and animation', async ({ page }, testInfo) => {
  const outgoing: string[] = [], localOrigin = new URL(page.url()).origin;
  page.on('request', (request) => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== localOrigin) outgoing.push(request.url()); });
  const cube = applyAlgorithm(solvedCube(), parseAlgorithm("F R2 U' L D2 B R U F2 D'"));
  const colors = toColors(cube, PRACTICE_SCHEME);
  await startPhotos(page);
  await expect(page.getByTestId('photo-camera')).toHaveAttribute('capture', 'environment');
  await expect(page.getByTestId('photo-upload')).toHaveAttribute('accept', 'image/*');
  for (let index = 0; index < 6; index++) {
    const face = ORDER[index];
    const expected = colors.slice(FACES.indexOf(face) * 9, FACES.indexOf(face) * 9 + 9);
    await expect(page.getByLabel('Photo face', { exact: true })).toHaveValue(face);
    const before = await page.evaluate(() => window.__cubeGuide.inspect().entry);
    const file = await generatedPhoto(page, expected, { mime: ['image/png', 'image/jpeg', 'image/webp'][index % 3] });
    await page.getByTestId('photo-upload').setInputFiles(file);
    await expect(page.getByTestId('photo-preview')).toBeVisible();
    await detectPhoto(page, face);
    await assertPredictions(page, face, expected);
    expect(await page.evaluate(() => window.__cubeGuide.inspect().entry)).toEqual(before);
    await expect(page.getByRole('button', { name: `Use reviewed ${FACE_NAMES[face].toLowerCase()} face`, exact: true })).toBeDisabled();
    await acceptPhoto(page, face);
    await expect(page.getByTestId('photo-input').locator('.photo-progress-text')).toContainText(`${index + 1} of 6 faces entered`);
    await expect(page.getByTestId('photo-preview')).toHaveCount(0);
    expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('0');
  }
  expect(await page.evaluate(() => window.__cubeGuide.inspect().entry)).toEqual(colors);
  await page.getByRole('button', { name: 'Check colors & solve', exact: true }).click();
  await expect(page.getByText('Solution ready', { exact: true })).toBeVisible({ timeout: 45_000 });
  const ready = await page.evaluate(() => window.__cubeGuide.inspect());
  expect(ready.initialFacelets).toBe(cubeKey(cube));
  expect(ready.visual!.facelets).toBe(cubeKey(cube));
  expect(ready.snapshots.at(-1)).toBe(SOLVED);
  await page.getByLabel('Animation speed').selectOption('2');
  await page.getByRole('button', { name: 'Play solution', exact: true }).click();
  await page.waitForFunction(() => (window.__cubeGuide.inspect().transition?.progress ?? 0) > 0.1);
  expect((await page.evaluate(() => window.__cubeGuide.inspect())).visual!.movingCubelets).toBe(9);
  await page.waitForFunction(() => { const s = window.__cubeGuide.inspect(); return s.solved && !s.transition && !s.running; }, null, { timeout: 45_000 });
  const final = await page.evaluate(() => window.__cubeGuide.inspect());
  expect(final.cubeFacelets).toBe(SOLVED);
  expect(final.visual!.facelets).toBe(SOLVED);
  expect(final.visual!.maxGridError).toBe(0);
  expect(outgoing).toEqual([]);
  await testInfo.attach('photo-pipeline-evidence', { body: JSON.stringify({ initial: ready.initialFacelets, moves: ready.solutionMoves, final: final.cubeFacelets, visual: final.visual }, null, 2), contentType: 'application/json' });
  await page.getByRole('button', { name: 'Edit colors', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit colors', exact: true }).click();
  await expect(page.getByTestId('photo-input')).toHaveCount(0);
  expect(await page.evaluate(() => window.__cubeGuide.inspect().entry)).toEqual(colors);
  await page.getByTestId('landing-photo-action').click();
  await expect(page.getByRole('heading', { name: 'Photo-assisted entry', exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.__cubeGuide.inspect().entry)).toEqual(colors);
});

test('review corrections, center mismatch, picker cancellation and overwrite protection preserve existing colors', async ({ page }) => {
  await startPhotos(page);
  await page.getByRole('button', { name: 'Paint orange stickers', exact: true }).click();
  await page.getByTestId('sticker-F-0').click();
  const before = await page.evaluate(() => window.__cubeGuide.inspect().entry);
  await page.getByTestId('photo-upload').setInputFiles(await generatedPhoto(page, Array<Color>(9).fill('blue')));
  await detectPhoto(page, 'F');
  await expect(page.getByTestId('photo-input').getByRole('alert')).toContainText('does not match');
  await page.getByRole('checkbox', { name: 'I checked all nine colors against this face.', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Use reviewed front face', exact: true })).toBeDisabled();
  await page.getByTestId('photo-upload').dispatchEvent('cancel');
  await expect(page.getByTestId('photo-input')).toContainText('No photo selected');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  expect(await page.evaluate(() => window.__cubeGuide.inspect().entry)).toEqual(before);
  for (let i = 0; i < 9; i++) if (i !== 4) await page.getByLabel(`Review Front sticker ${i + 1} color`, { exact: true }).selectOption('green');
  await page.getByRole('checkbox', { name: /I checked this is the green center/ }).check();
  await page.getByRole('checkbox', { name: 'I checked all nine colors against this face.', exact: true }).check();
  await page.getByRole('button', { name: 'Use reviewed front face', exact: true }).click();
  await page.getByRole('button', { name: 'Keep entered colors', exact: true }).click();
  expect(await page.evaluate(() => window.__cubeGuide.inspect().entry)).toEqual(before);
  await page.getByRole('button', { name: 'Use reviewed front face', exact: true }).click();
  await page.getByRole('button', { name: 'Replace face colors', exact: true }).click();
  const after = await page.evaluate(() => window.__cubeGuide.inspect().entry);
  expect(after.slice(18, 27)).toEqual(Array(9).fill('green'));
  expect(after.slice(0, 18)).toEqual(before.slice(0, 18));
  expect(after.slice(27)).toEqual(before.slice(27));
  expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('0');
});

test('rotates a real photo, rejects crossed crop corners and supports keyboard alignment', async ({ page }) => {
  await startPhotos(page);
  const colors: Color[] = ['white', 'red', 'orange', 'blue', 'green', 'yellow', 'orange', 'white', 'blue'];
  await page.getByTestId('photo-upload').setInputFiles(await generatedPhoto(page, colors, { rotate: true }));
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Rotate left', exact: true }).click();
  await expect.poll(() => page.getByTestId('photo-preview').evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(600);
  const corner = page.getByTestId('crop-corner-0');
  const before = await corner.getAttribute('style');
  await corner.focus(); await page.keyboard.press('ArrowRight');
  expect(await corner.getAttribute('style')).not.toBe(before);
  await corner.scrollIntoViewIfNeeded();
  const image = await page.getByTestId('photo-preview').boundingBox(), handle = await corner.boundingBox();
  if (!image || !handle) throw new Error('Missing crop interaction targets.');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down(); await page.mouse.move(image.x + image.width * 0.95, image.y + image.height * 0.95); await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Detect nine colors', exact: true })).toBeDisabled();
  await expect(page.getByTestId('photo-input').getByRole('alert')).toContainText('order');
  await page.getByRole('button', { name: 'Reset corners', exact: true }).click();
  await detectPhoto(page, 'F');
  await assertPredictions(page, 'F', colors);
  await page.getByLabel('Photo face', { exact: true }).selectOption('R');
  await page.getByRole('button', { name: 'Keep this photo', exact: true }).click();
  await expect(page.getByLabel('Photo face', { exact: true })).toHaveValue('F');
  await page.getByLabel('Photo face', { exact: true }).selectOption('R');
  await page.getByRole('button', { name: 'Change photo face', exact: true }).click();
  await expect(page.getByTestId('photo-preview')).toHaveCount(0);
  expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('0');
  expect((await page.evaluate(() => window.__cubeGuide.inspect().entry)).filter(Boolean)).toHaveLength(6);
});

test('corrupt, unsupported, blank and stale photo loads never change cube input or leak previews', async ({ page }) => {
  await startPhotos(page);
  const before = await page.evaluate(() => window.__cubeGuide.inspect().entry);
  for (const file of [
    { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a photo') },
    { name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
  ]) {
    await page.getByTestId('photo-upload').setInputFiles(file);
    await expect(page.getByTestId('photo-input').getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('photo-preview')).toHaveCount(0);
    expect(await page.evaluate(() => window.__cubeGuide.inspect().entry)).toEqual(before);
  }
  await page.getByTestId('photo-upload').setInputFiles(await generatedPhoto(page, Array<Color>(9).fill('white'), { blank: true }));
  await detectPhoto(page, 'F');
  await expect(page.getByTestId('photo-input')).toContainText('No clear sticker borders');
  await expect(page.getByRole('button', { name: 'Use reviewed front face', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close photo entry', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close photo entry', exact: true }).click();
  expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('0');
  await page.getByRole('button', { name: 'Take/upload face photos', exact: true }).click();
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return original.call(this);
    };
  });
  await page.getByTestId('photo-upload').setInputFiles(await generatedPhoto(page, Array<Color>(9).fill('green')));
  await page.getByRole('button', { name: 'Close photo entry', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close photo entry', exact: true }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('photo-preview')).toHaveCount(0);
  expect(await page.evaluate(() => window.__cubeGuide.inspect().entry)).toEqual(before);
  expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('0');
});

test.describe('mobile photo entry', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  test('keeps capture, crop, named review controls and manual fallback usable on a phone', async ({ page }) => {
    await startPhotos(page);
    await page.getByTestId('photo-upload').setInputFiles(await generatedPhoto(page, Array<Color>(9).fill('green')));
    await expect(page.getByTestId('photo-preview')).toBeVisible();
    await detectPhoto(page, 'F');
    await assertPredictions(page, 'F', Array<Color>(9).fill('green'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await acceptPhoto(page, 'F');
    await page.getByRole('button', { name: 'Close photo entry', exact: true }).tap();
    await page.getByRole('button', { name: 'Paint red stickers', exact: true }).tap();
    await page.getByTestId('sticker-R-0').tap();
    await expect(page.getByTestId('sticker-R-0')).toHaveAccessibleName('Right row 1 column 1: Red');
    await page.getByRole('button', { name: 'New cube', exact: true }).tap();
    await page.getByRole('button', { name: 'Start new cube', exact: true }).tap();
    expect((await page.evaluate(() => window.__cubeGuide.inspect().entry)).every((color) => color === null)).toBe(true);
    expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('0');
  });
});
