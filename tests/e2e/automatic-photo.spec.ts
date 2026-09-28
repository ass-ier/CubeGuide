import { expect, test, type Page } from '@playwright/test';
import { cubeKey, solvedCube, toColors } from '../../src/cube/model';
import { applyAlgorithm, applyMove } from '../../src/cube/moves';
import { parseAlgorithm } from '../../src/cube/notation';
import { FACE_NAMES, FACES, PRACTICE_SCHEME, type Color, type ColorScheme, type Face } from '../../src/cube/types';
import { ENTRY_ORDER } from '../../src/input/orientation';
import { rotateFace } from '../../src/input/photo/automatic';
import { automaticPhotoFile } from '../fixtures/browser-photo';
import { PIGMENTS, WORN_SURFACES, type PhotoRegion } from '../fixtures/photo';

const SOLVED = cubeKey(solvedCube());
const errors = new Map<Page, string[]>();
const original = applyAlgorithm(solvedCube(), parseAlgorithm("F R2 U' L D2 B R U F2 D'"));
const POSES: Partial<PhotoRegion>[] = [
  { x: 90, y: 400, size: 270, angle: -90 },
  { x: 390, y: 80, size: 280, angle: 90 },
  { x: 255, y: 140, size: 185, light: 0.92, seam: [120, 123, 125] },
  { x: 220, y: 30, size: 300, angle: 28, light: 0.9, seam: [228, 228, 224] },
  { x: 150, y: 50, size: 380, perspectiveX: 0.28, perspectiveY: 0.12 },
  { x: 70, y: 160, size: 290, angle: -15, perspectiveX: 0.2, perspectiveY: 0.15, light: 0.9 },
];

async function inspect(page: Page) { return page.evaluate(() => window.__cubeGuide.inspect()); }
async function added(page: Page, face: Face) {
  await expect(page.getByTestId(`auto-slot-${face}`)).toHaveAttribute('aria-label', /center, added/);
}
async function uploaded(page: Page, face: Face, colors: readonly Color[]) {
  await page.getByTestId('automatic-photo-file').setInputFiles(await automaticPhotoFile(page, colors));
  await added(page, face);
  await expect(page.getByTestId('landing-photo-action')).toBeEnabled();
}
async function exactMeshes(page: Page, facelets: string) {
  await expect.poll(async () => {
    const state = await inspect(page);
    return {
      logical: state.cubeFacelets, visual: state.visual?.facelets,
      cubelets: state.visual?.cubeletCount, stickers: state.visual?.stickerCount,
      aligned: state.visual?.aligned, gridError: state.visual?.maxGridError, active: state.transition,
    };
  }).toEqual({ logical: facelets, visual: facelets, cubelets: 27, stickers: 54, aligned: true, gridError: 0, active: null });
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
  await expect(page.getByTestId('landing-photo-action')).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === 'passed') expect(errors.get(page) ?? []).toEqual([]);
  errors.delete(page);
});

for (const device of [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, scheme: PRACTICE_SCHEME },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    scheme: { U: 'blue', R: 'orange', F: 'yellow', D: 'green', L: 'red', B: 'white' } satisfies ColorScheme },
]) {
  test.describe(`upload-only automatic solving on ${device.name}`, () => {
    test.use({ viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch });
    test('six photos alone derive centers and a verified cube, then real animation reaches matching solved meshes', async ({ page }, testInfo) => {
      const action = page.getByTestId('landing-photo-action');
      await expect(action).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => scrollY)).toBe(0);
      await expect(page.locator('.primary:visible')).toHaveCount(1);
      await expect(page.getByRole('combobox')).toHaveCount(0);
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(page.locator('canvas')).toHaveCount(0);
      expect((await inspect(page)).visual).toBe(null);
      expect((await inspect(page)).source).toBe('photo');
      const outgoing: string[] = [], workers: string[] = [], origin = new URL(page.url()).origin;
      page.on('worker', (worker) => workers.push(worker.url()));
      page.on('request', (request) => {
        if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) outgoing.push(request.url());
      });
      const colors = toColors(original, device.scheme);
      for (let index = 0; index < 6; index++) {
        const face = ENTRY_ORDER[index], base = FACES.indexOf(face) * 9;
        const expected = colors.slice(base, base + 9);
        await expect(page.getByRole('heading', { name: `${FACE_NAMES[face]} face`, exact: true })).toBeVisible();
        if (face === 'U') await expect(page.locator('#automatic-orientation')).toContainText('Front must be beyond the bottom edge');
        if (face === 'D') await expect(page.locator('#automatic-orientation')).toContainText('Front must be beyond the top edge');
        const file = await automaticPhotoFile(page, expected, POSES[index], index === 0
          ? { mime: 'image/jpeg', exif: 6 } : { mime: index % 2 ? 'image/png' : 'image/webp' });
        if (index === 0) {
          await action.focus();
          const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')]);
          await picker.setFiles(file);
        } else await page.getByTestId('automatic-photo-file').setInputFiles(file);
        await added(page, face);
        if (index < 5) {
          await expect(action).toBeEnabled();
          await expect(action).toBeFocused();
          expect((await inspect(page)).entry.every((color) => color === null)).toBe(true);
          expect((await inspect(page)).visual).toBe(null);
        }
      }
      await expect(page.getByText('Solution ready', { exact: true })).toBeVisible({ timeout: 45_000 });
      await expect(page.locator('.solution-panel h2')).toBeFocused();
      await exactMeshes(page, cubeKey(original));
      const ready = await inspect(page);
      expect(ready.entry).toEqual(colors);
      expect(ready.initialFacelets).toBe(cubeKey(original));
      expect(ready.verified).toBe(true);
      expect(ready.running).toBe(false);
      expect(ready.step).toBe(0);
      expect(ready.solved).toBe(false);
      expect(workers.some((url) => url.includes('photo.worker'))).toBe(true);
      expect(workers.some((url) => url.includes('solver.worker'))).toBe(true);
      expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('6');
      let replay = original;
      parseAlgorithm(ready.solutionMoves).forEach((move, index) => {
        replay = applyMove(replay, move);
        expect(ready.snapshots[index + 1]).toBe(cubeKey(replay));
      });
      expect(cubeKey(replay)).toBe(SOLVED);
      await expect(page.getByRole('combobox', { name: /center color/ })).toHaveCount(0);
      await expect(page.getByRole('checkbox', { name: /I checked/ })).toHaveCount(0);
      await page.getByLabel('Animation speed').selectOption('0.25');
      await page.getByRole('button', { name: 'Play solution', exact: true }).click();
      await page.waitForFunction(() => (window.__cubeGuide.inspect().transition?.progress ?? 0) > 0.1);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      const paused = await inspect(page);
      expect(paused.visual?.movingCubelets).toBe(9);
      expect(paused.visual?.aligned).toBe(false);
      await page.waitForTimeout(300);
      expect((await inspect(page)).visual?.transforms).toEqual(paused.visual?.transforms);
      await page.getByLabel('Animation speed').selectOption('2');
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await page.waitForFunction(() => {
        const state = window.__cubeGuide.inspect();
        return state.solved && !state.transition && !state.running && state.step === state.solutionLength;
      }, null, { timeout: 45_000 });
      await exactMeshes(page, SOLVED);
      const final = await inspect(page);
      expect(final.visual?.transforms.every((transform) => transform.quaternion.every((value, i) => value === (i === 3 ? 1 : 0)))).toBe(true);
      expect(outgoing).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await testInfo.attach('automatic-photo-evidence', {
        body: JSON.stringify({ scheme: device.scheme, original: ready.initialFacelets, colors: ready.entry, snapshots: ready.snapshots, paused, final }),
        contentType: 'application/json',
      });
      await page.getByRole('button', { name: 'Retake a face photo', exact: true }).click();
      await page.getByRole('button', { name: 'Keep my cube', exact: true }).click();
      expect((await inspect(page)).verified).toBe(true);
      await page.getByRole('button', { name: 'Retake a face photo', exact: true }).click();
      await page.getByRole('button', { name: 'Retake photos', exact: true }).click();
      for (const face of ENTRY_ORDER) await added(page, face);
      expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('6');
      expect((await inspect(page)).verified).toBe(false);
      await page.getByRole('button', { name: 'Use these photos again', exact: true }).click();
      await expect(page.getByText('Solution ready', { exact: true })).toBeVisible({ timeout: 45_000 });
      expect((await inspect(page)).initialFacelets).toBe(cubeKey(original));
    });

    test('dim, faded and scratched photos reconstruct exact colors and animate the real cube to solved', async ({ page }, testInfo) => {
      const photographed = applyAlgorithm(solvedCube(), parseAlgorithm("R U2 B' D L2 F R' D2 B U' F2"));
      const colors = toColors(photographed, device.scheme);
      const elapsed: number[] = [];
      for (let index = 0; index < ENTRY_ORDER.length; index++) {
        const face = ENTRY_ORDER[index], base = FACES.indexOf(face) * 9;
        const file = await automaticPhotoFile(page, colors.slice(base, base + 9), {
          ...WORN_SURFACES[index % WORN_SURFACES.length],
          x: 130 + index * 8, y: index % 2 ? 135 : 48, size: 330,
          angle: index % 2 ? -9 : 17, perspectiveX: 0.16, perspectiveY: 0.07,
        }, {
          mime: index % 2 ? 'image/jpeg' : 'image/webp', quality: 0.86,
          degradation: { exposure: index % 2 ? 0.28 : 0.65, noise: 1.5, blur: 1, cast: [1.02, 1, 0.98] },
        });
        const started = Date.now();
        await page.getByTestId('automatic-photo-file').setInputFiles(file);
        await added(page, face);
        elapsed.push(Date.now() - started);
        if (index < 5) await expect(page.getByTestId('landing-photo-action')).toBeEnabled();
      }
      await expect(page.getByText('Solution ready', { exact: true })).toBeVisible({ timeout: 45_000 });
      await exactMeshes(page, cubeKey(photographed));
      const ready = await inspect(page);
      expect(ready.entry).toEqual(colors);
      expect(ready.initialFacelets).toBe(cubeKey(photographed));
      expect(ready.verified).toBe(true);
      expect(ready.running).toBe(false);
      let replay = photographed;
      for (const [index, move] of parseAlgorithm(ready.solutionMoves).entries()) {
        replay = applyMove(replay, move);
        expect(ready.snapshots[index + 1]).toBe(cubeKey(replay));
      }
      expect(cubeKey(replay)).toBe(SOLVED);
      await page.getByLabel('Animation speed').selectOption('2');
      await page.getByRole('button', { name: 'Play solution', exact: true }).click();
      await page.waitForFunction(() => {
        const state = window.__cubeGuide.inspect();
        return (state.transition?.progress ?? 0) > 0.1 && state.visual?.movingCubelets === 9 && !state.visual.aligned;
      });
      await page.waitForFunction(() => {
        const state = window.__cubeGuide.inspect();
        return state.solved && !state.transition && !state.running && state.step === state.solutionLength;
      }, null, { timeout: 45_000 });
      await exactMeshes(page, SOLVED);
      await testInfo.attach('worn-photo-reconstruction', {
        body: JSON.stringify({ scheme: device.scheme, uploadMilliseconds: elapsed, expected: colors, ready, final: await inspect(page) }),
        contentType: 'application/json',
      });
    });
  });
}

test('the upload action and six compact slots remain accessible at 320 pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.getByTestId('landing-photo-action')).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(page.getByRole('list', { name: 'Six cube face photos' }).getByRole('button')).toHaveCount(6);
  const targets = await page.locator('.auto-photo-slot').evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect(); return { width: box.width, height: box.height };
  }));
  expect(targets.every((box) => box.width >= 44 && box.height >= 44)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('corrupt, blank, duplicate and uncertain-center replacements preserve accepted photos', async ({ page }) => {
  await uploaded(page, 'F', Array<Color>(9).fill('green'));
  await uploaded(page, 'R', Array<Color>(9).fill('red'));
  await page.getByTestId('auto-slot-F').click();
  const preview = await page.getByTestId('auto-slot-F').locator('img').getAttribute('src');
  const uncertain = Array(9).fill(PIGMENTS.red);
  uncertain[4] = [170, 40, 180];
  const attempts = [
    { file: { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a photo') }, error: /JPEG|PNG|photo/i },
    { file: await automaticPhotoFile(page, Array<Color>(9).fill('red'), {}, { blank: true }), error: /nine stickers/i },
    { file: await automaticPhotoFile(page, Array<Color>(9).fill('red')), error: /both have red centers/i },
    { file: await automaticPhotoFile(page, Array<Color>(9).fill('red'), { samples: uncertain }), error: /center color is not clear/i },
    { file: await automaticPhotoFile(page, Array<Color>(9).fill('green'), {}, { degradation: { exposure: 0.04, noise: 2 } }), error: /nine stickers|center color|reliable color/i },
    { file: await automaticPhotoFile(page, Array<Color>(9).fill('white'), { light: 1.6 }), error: /center color is not clear/i },
  ];
  for (const attempt of attempts) {
    await page.getByTestId('automatic-photo-file').setInputFiles(attempt.file);
    await expect(page.getByRole('alert')).toContainText(attempt.error);
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(page.getByTestId('auto-slot-F').locator('img')).toHaveAttribute('src', preview!);
    await expect(page.getByRole('alert')).toContainText('Previous front photo kept');
    await expect(page.getByTestId('auto-slot-F')).toHaveAccessibleName(/green center, added/);
    await expect(page.getByTestId('auto-slot-R')).toHaveAccessibleName(/red center, added/);
    expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('2');
    expect((await inspect(page)).verified).toBe(false);
  }
  await page.getByTestId('automatic-photo-file').dispatchEvent('cancel');
  await expect(page.getByTestId('auto-slot-F').locator('img')).toHaveAttribute('src', preview!);
  await uploaded(page, 'F', Array<Color>(9).fill('green'));
  await expect(page.getByTestId('auto-slot-F').locator('img')).not.toHaveAttribute('src', preview!);
  expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('2');
});

test('processing cancellation and a new-cube confirmation invalidate late decoding without losing accepted images', async ({ page }) => {
  await uploaded(page, 'F', Array<Color>(9).fill('green'));
  const preview = await page.getByTestId('auto-slot-F').locator('img').getAttribute('src');
  const file = await automaticPhotoFile(page, Array<Color>(9).fill('red'));
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return original.call(this);
    };
  });
  await page.getByTestId('automatic-photo-file').setInputFiles(file);
  await page.getByRole('button', { name: 'Cancel processing', exact: true }).click();
  await page.waitForTimeout(900);
  await expect(page.getByTestId('auto-slot-F').locator('img')).toHaveAttribute('src', preview!);
  await expect(page.getByTestId('auto-slot-R')).toHaveAccessibleName(/not added/);
  expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('1');
  await page.getByRole('button', { name: 'New cube', exact: true }).click();
  await page.getByRole('button', { name: 'Keep my cube', exact: true }).click();
  await expect(page.getByTestId('auto-slot-F').locator('img')).toHaveAttribute('src', preview!);
  await page.getByTestId('automatic-photo-file').setInputFiles(file);
  await page.getByRole('button', { name: 'New cube', exact: true }).click();
  await page.getByRole('button', { name: 'Start new cube', exact: true }).click();
  await page.waitForTimeout(1000);
  expect((await inspect(page)).source).toBe('photo');
  expect((await inspect(page)).entry.every((color) => color === null)).toBe(true);
  expect((await inspect(page)).verified).toBe(false);
  expect((await inspect(page)).visual).toBe(null);
  expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('0');
  await expect(page.locator('.auto-photo-slots img')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('#automatic-title')).toBeFocused();
  await expect(page.locator('#automatic-title')).toBeInViewport({ ratio: 1 });
});

test('a real photo-worker loading error is explicit and retry keeps the same input route', async ({ page }) => {
  const file = await automaticPhotoFile(page, Array<Color>(9).fill('green'));
  await page.route('**/photo.worker*', (route) => route.abort('failed'));
  await page.getByTestId('automatic-photo-file').setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText('Photo processing could not run');
  await expect(page.getByTestId('auto-slot-F')).toHaveAccessibleName(/not added/);
  await page.unroute('**/photo.worker*');
  await page.getByTestId('automatic-photo-file').setInputFiles(file);
  await added(page, 'F');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await inspect(page)).source).toBe('photo');
});

test('a stalled photo decoder times out and cannot replace an accepted image later', async ({ page }) => {
  await uploaded(page, 'F', Array<Color>(9).fill('green'));
  await page.getByTestId('auto-slot-F').click();
  const preview = await page.getByTestId('auto-slot-F').locator('img').getAttribute('src');
  const file = await automaticPhotoFile(page, Array<Color>(9).fill('green'));
  await page.clock.install();
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      return original.call(this);
    };
  });
  await page.getByTestId('automatic-photo-file').setInputFiles(file);
  await page.clock.fastForward(20_001);
  await expect(page.getByRole('alert')).toContainText('Photo processing took too long');
  await expect(page.getByRole('alert')).toContainText('Previous front photo kept');
  await expect(page.getByTestId('landing-photo-action')).toBeEnabled();
  await page.clock.fastForward(10_100);
  await expect(page.getByTestId('auto-slot-F').locator('img')).toHaveAttribute('src', preview!);
  expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('1');
  expect((await inspect(page)).verified).toBe(false);
});

test('ambiguous rotated photos never produce a guessed cube or start solving', async ({ page }) => {
  const colors = toColors(applyAlgorithm(solvedCube(), parseAlgorithm('R')), PRACTICE_SCHEME);
  for (const face of ENTRY_ORDER) {
    const base = FACES.indexOf(face) * 9, values = colors.slice(base, base + 9);
    await page.getByTestId('automatic-photo-file').setInputFiles(await automaticPhotoFile(page, face === 'F' ? rotateFace(values, 1) : values));
    await added(page, face);
    if (face !== 'D') await expect(page.getByTestId('landing-photo-action')).toBeEnabled();
  }
  await expect(page.getByRole('alert')).toContainText('more than one valid reading');
  expect((await inspect(page)).verified).toBe(false);
  expect((await inspect(page)).solverStatus).toBe('idle');
  expect((await inspect(page)).visual).toBe(null);
  expect((await inspect(page)).entry.every((color) => color === null)).toBe(true);
  expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('6');
});

test('manual fallback and switching back to photos honor discard confirmations', async ({ page }) => {
  await uploaded(page, 'F', Array<Color>(9).fill('green'));
  const preview = await page.getByTestId('auto-slot-F').locator('img').getAttribute('src');
  await page.getByRole('button', { name: 'Enter colors manually', exact: true }).click();
  await page.getByRole('button', { name: 'Keep my cube', exact: true }).click();
  await expect(page.getByTestId('auto-slot-F').locator('img')).toHaveAttribute('src', preview!);
  await page.getByRole('button', { name: 'Enter colors manually', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enter colors manually', exact: true }).click();
  await page.getByLabel('Up center color').selectOption('white');
  expect(await page.locator('html').getAttribute('data-photo-object-urls')).toBe('0');
  await page.getByRole('button', { name: 'Use automatic photos', exact: true }).click();
  await page.getByRole('button', { name: 'Keep my cube', exact: true }).click();
  await expect(page.getByLabel('Up center color')).toHaveValue('white');
  await page.getByRole('button', { name: 'Use automatic photos', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Use automatic photos', exact: true }).click();
  await expect(page.getByTestId('landing-photo-action')).toBeVisible();
  await expect(page.locator('.auto-photo-slots img')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /center color/ })).toHaveCount(0);
  await expect(page.locator('#automatic-title')).toBeFocused();
});
