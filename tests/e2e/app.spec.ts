import { expect, test, type Page } from '@playwright/test';
import { applyAlgorithm, applyMove } from '../../src/cube/moves';
import { cubeKey, solvedCube, toColors } from '../../src/cube/model';
import { formatMove, parseAlgorithm } from '../../src/cube/notation';
import { COLORS, FACE_NAMES, FACES, PRACTICE_SCHEME, type Color, type ColorScheme } from '../../src/cube/types';
import type { CubeGuideInspection } from '../../src/types/diagnostics';

const SOLVED = cubeKey(solvedCube());
const errors = new Map<Page, string[]>();

async function inspect(page: Page): Promise<CubeGuideInspection> {
  return page.evaluate(() => window.__cubeGuide.inspect());
}

async function aligned(page: Page, expected?: string) {
  await expect.poll(async () => {
    const state = await inspect(page);
    return {
      cubelets: state.visual?.cubeletCount,
      stickers: state.visual?.stickerCount,
      aligned: state.visual?.aligned,
      equal: state.visual?.facelets === (expected ?? state.cubeFacelets),
      gridError: state.visual?.maxGridError,
      transition: state.transition,
    };
  }).toEqual({ cubelets: 27, stickers: 54, aligned: true, equal: true, gridError: 0, transition: null });
}

async function waitAtStep(page: Page, step: number) {
  await expect.poll(async () => {
    const state = await inspect(page);
    return { step: state.step, active: !!state.transition, running: state.running };
  }).toEqual({ step, active: false, running: false });
  await aligned(page);
}

async function centers(page: Page, scheme: ColorScheme) {
  if ((await inspect(page)).source === 'photo') await page.getByRole('button', { name: 'Enter colors manually', exact: true }).click();
  for (const face of FACES) await page.getByLabel(`${FACE_NAMES[face]} center color`).selectOption(scheme[face]);
  await page.getByRole('button', { name: 'Lock centers & enter stickers' }).click();
}

async function paintInput(page: Page, colors: readonly Color[]) {
  for (const color of COLORS) {
    await page.getByRole('button', { name: `Paint ${color} stickers`, exact: true }).click();
    for (let index = 0; index < 54; index++) {
      if (index % 9 !== 4 && colors[index] === color) {
        await page.getByTestId(`sticker-${FACES[Math.floor(index / 9)]}-${index % 9}`).click();
      }
    }
  }
}

async function paintCell(page: Page, index: number, color: Color) {
  await page.getByRole('button', { name: `Paint ${color} stickers`, exact: true }).click();
  await page.getByTestId(`sticker-${FACES[Math.floor(index / 9)]}-${index % 9}`).click();
}

async function practiceSolution(page: Page) {
  await page.getByRole('button', { name: 'Try a scramble', exact: true }).click();
  await aligned(page);
  await page.getByRole('button', { name: 'Solve scramble', exact: true }).click();
  await expect(page.getByText('Solution ready', { exact: true })).toBeVisible({ timeout: 45_000 });
  await aligned(page);
}

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('net::ERR_FAILED')) messages.push(message.text());
  });
  await page.goto('/');
  await expect(page).toHaveTitle("CubeGuide — Rubik's Cube Solver");
  await page.getByRole('button', { name: 'Enter colors manually', exact: true }).click();
  await page.waitForFunction(() => !!window.__cubeGuide?.inspect().visual);
  await aligned(page, SOLVED);
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === 'passed') expect(errors.get(page) ?? []).toEqual([]);
  errors.delete(page);
});

test('random scramble -> real worker solve -> every playback control -> animated, logically and visually solved', async ({ page }, testInfo) => {
  const workerUrls: string[] = [];
  page.on('worker', (worker) => workerUrls.push(worker.url()));
  await page.getByRole('button', { name: 'Try a scramble', exact: true }).click();
  const scrambled = await inspect(page);
  expect(scrambled.cubeFacelets).not.toBe(SOLVED);
  expect(scrambled.source).toBe('practice');
  await aligned(page, scrambled.cubeFacelets);
  expect((await page.getByTestId('scramble-notation').innerText()).trim().split(/\s+/)).toHaveLength(25);

  await page.evaluate(() => {
    document.documentElement.dataset.solverFrames = '0';
    const until = performance.now() + 4000;
    const tick = () => {
      document.documentElement.dataset.solverFrames = String(Number(document.documentElement.dataset.solverFrames) + 1);
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByRole('button', { name: 'Solve scramble', exact: true }).click();
  await expect(page.getByText('Solution ready', { exact: true })).toBeVisible({ timeout: 45_000 });
  expect(workerUrls.some((url) => url.includes('solver.worker'))).toBe(true);
  expect(Number(await page.locator('html').getAttribute('data-solver-frames'))).toBeGreaterThan(5);
  const ready = await inspect(page);
  expect(ready.verified).toBe(true);
  expect(ready.solved).toBe(false);
  expect(ready.initialFacelets).toBe(scrambled.cubeFacelets);
  expect(ready.snapshots.at(-1)).toBe(SOLVED);
  expect(ready.solutionLength).toBeGreaterThan(3);
  await expect(page.getByText('Cube solved', { exact: true })).toHaveCount(0);

  await page.getByLabel('Animation speed').selectOption('0.25');
  await page.getByRole('button', { name: 'Play solution', exact: true }).click();
  await page.waitForFunction(() => (window.__cubeGuide.inspect().transition?.progress ?? 0) > 0.08);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await inspect(page);
  expect(paused.running).toBe(false);
  expect(paused.transition!.progress).toBeGreaterThan(0);
  expect(paused.transition!.progress).toBeLessThan(0.8);
  expect(paused.visual?.movingCubelets).toBe(9);
  expect(paused.visual?.aligned).toBe(false);
  expect(paused.visual?.transforms.filter((t) => t.quaternion.some((value, i) => Math.abs(value - (i === 3 ? 1 : 0)) > 0.0001))).toHaveLength(9);
  await page.waitForTimeout(400);
  const frozen = await inspect(page);
  expect(frozen.transition?.progress).toBe(paused.transition?.progress);
  expect(frozen.visual?.transforms).toEqual(paused.visual?.transforms);
  expect(frozen.cubeFacelets).toBe(scrambled.cubeFacelets);
  await page.getByLabel('Animation speed').selectOption('1.5');
  expect((await inspect(page)).transition?.progress).toBe(paused.transition?.progress);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction((progress) => (window.__cubeGuide.inspect().transition?.progress ?? 0) > progress, paused.transition!.progress);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await waitAtStep(page, 0);
  expect((await inspect(page)).cubeFacelets).toBe(scrambled.cubeFacelets);

  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await waitAtStep(page, 1);
  expect((await inspect(page)).cubeFacelets).toBe(ready.snapshots[1]);
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await waitAtStep(page, 0);

  await page.getByRole('button', { name: /^Jump to after move 3:/ }).click();
  await waitAtStep(page, 3);
  const slider = page.getByRole('slider', { name: 'Solution step', exact: true });
  await slider.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await waitAtStep(page, 2);
  const box = await slider.boundingBox();
  if (!box) throw new Error('Timeline slider has no layout box.');
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  const scrubbed = await inspect(page);
  expect(scrubbed.step).toBeGreaterThan(3);
  expect(scrubbed.cubeFacelets).toBe(ready.snapshots[scrubbed.step]);
  await aligned(page);

  await page.getByLabel('Animation speed').selectOption('2');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(() => (window.__cubeGuide.inspect().transition?.progress ?? 0) > 0.07);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await waitAtStep(page, 0);
  await page.waitForTimeout(350);
  expect((await inspect(page)).cubeFacelets).toBe(scrambled.cubeFacelets);
  expect((await inspect(page)).step).toBe(0);

  await page.getByRole('button', { name: 'Play solution', exact: true }).click();
  await page.waitForFunction(() => {
    const s = window.__cubeGuide.inspect();
    return s.step === s.solutionLength && !s.running && !s.transition;
  }, null, { timeout: 45_000 });
  await expect(page.locator('.solution-status')).toHaveText('Cube solved');
  await aligned(page, SOLVED);
  const final = await inspect(page);
  expect(final.solved).toBe(true);
  expect(final.cubeFacelets).toBe(SOLVED);
  expect(final.visual?.facelets).toBe(SOLVED);
  expect(final.visual?.transforms.every((t) => t.quaternion.every((value, i) => value === (i === 3 ? 1 : 0)))).toBe(true);

  await testInfo.attach('real-animation-sync-evidence', {
    body: JSON.stringify({ original: scrambled.cubeFacelets, solution: ready.solutionMoves, paused, final }, null, 2),
    contentType: 'application/json',
  });
});

test('enters all 54 colors with non-default physical centers and solves that actual entered cube', async ({ page }) => {
  const scheme: ColorScheme = { U: 'blue', R: 'orange', F: 'yellow', D: 'green', L: 'red', B: 'white' };
  const original = applyAlgorithm(solvedCube(), parseAlgorithm("R U R' F2 D L' B U2"));
  const colors = toColors(original, scheme);
  await centers(page, scheme);
  for (const face of FACES) await expect(page.getByTestId(`sticker-${face}-4`)).toBeDisabled();
  expect((await inspect(page)).entry.filter((color) => color === null)).toHaveLength(48);
  await page.getByRole('button', { name: 'Check colors & solve', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('48 stickers are still empty');
  await paintInput(page, colors);
  expect((await inspect(page)).entry).toEqual(colors);
  await page.getByRole('button', { name: 'Orientation guide for Back', exact: true }).click();
  await expect(page.locator('.capture-guide')).toContainText('orange is on your left and red on your right');
  await expect(page.locator('.capture-guide')).toContainText('Do not mirror');
  await page.getByRole('button', { name: 'Orientation guide for Down', exact: true }).click();
  await expect(page.locator('.capture-guide')).toContainText('yellow center must be beyond the TOP edge');
  await expect(page.locator('.capture-guide')).toContainText('white beyond the BOTTOM edge');
  await page.getByRole('button', { name: 'Check colors & solve', exact: true }).click();
  await expect(page.getByText('Solution ready', { exact: true })).toBeVisible({ timeout: 45_000 });
  const ready = await inspect(page);
  expect(ready.initialFacelets).toBe(cubeKey(original));
  expect(ready.source).toBe('entry');
  await page.getByLabel('Animation speed').selectOption('2');
  await page.getByRole('button', { name: 'Play solution', exact: true }).click();
  await page.waitForFunction(() => {
    const state = window.__cubeGuide.inspect();
    return state.solved && !state.transition && !state.running;
  }, null, { timeout: 45_000 });
  await aligned(page, SOLVED);
  await page.getByRole('button', { name: 'Edit colors', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit colors', exact: true }).click();
  expect((await inspect(page)).entry).toEqual(colors);
  expect((await inspect(page)).verified).toBe(false);
});

test('reports actionable color counts, a single edge flip and global parity through real face entry', async ({ page }) => {
  await centers(page, PRACTICE_SCHEME);
  await paintInput(page, toColors(solvedCube(), PRACTICE_SCHEME));
  await paintCell(page, 0, 'blue');
  await page.getByRole('button', { name: 'Check colors & solve', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('10 blue stickers');
  await expect(page.getByRole('alert')).toContainText('8 white stickers');
  expect((await inspect(page)).verified).toBe(false);
  await paintCell(page, 0, 'white');
  await paintCell(page, 5, 'red');
  await paintCell(page, 10, 'white');
  await page.getByRole('button', { name: 'Check colors & solve', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('odd flip total');
  await expect(page.getByRole('alert')).toContainText('cannot identify which edge');
  await paintCell(page, 5, 'white');
  await paintCell(page, 10, 'green');
  await paintCell(page, 19, 'red');
  await page.getByRole('button', { name: 'Check colors & solve', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('different parity');
  await expect(page.getByRole('alert')).toContainText('No single offending piece');
  expect((await inspect(page)).verified).toBe(false);
});

test('reset protects meaningful input, and changing centers cannot silently reinterpret stickers', async ({ page }) => {
  await centers(page, PRACTICE_SCHEME);
  await paintCell(page, 0, 'blue');
  const entry = (await inspect(page)).entry;
  await page.getByRole('button', { name: 'New cube', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep my cube', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Keep my cube', exact: true }).click();
  expect((await inspect(page)).entry).toEqual(entry);
  await page.getByRole('button', { name: 'Change center orientation', exact: true }).click();
  await page.getByRole('button', { name: 'Change centers', exact: true }).click();
  await expect(page.getByLabel('Up center color')).toHaveValue('white');
  expect((await inspect(page)).entry.every((color) => color === null)).toBe(true);
  await page.getByRole('button', { name: 'New cube', exact: true }).click();
  await page.getByRole('button', { name: 'Start new cube', exact: true }).click();
  await expect(page.getByTestId('landing-photo-action')).toBeVisible();
  expect((await inspect(page)).source).toBe('photo');
  expect((await inspect(page)).visual).toBe(null);
  await page.getByRole('button', { name: 'Enter colors manually', exact: true }).click();
  for (const face of FACES) await expect(page.getByLabel(`${FACE_NAMES[face]} center color`)).toHaveValue('');
  expect((await inspect(page)).verified).toBe(false);
  await aligned(page, SOLVED);
});

test('cancels a real initializing worker and ignores results after new input', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a scramble', exact: true }).click();
  await page.getByRole('button', { name: 'Solve scramble', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel solving', exact: true }).click();
  await page.getByRole('button', { name: 'New cube', exact: true }).click();
  await page.getByRole('button', { name: 'Start new cube', exact: true }).click();
  await page.waitForTimeout(2500);
  const reset = await inspect(page);
  expect(reset.verified).toBe(false);
  expect(reset.solverStatus).toBe('idle');
  expect(reset.source).toBe('photo');
  expect(reset.entry.every((sticker) => sticker === null)).toBe(true);
  await expect(page.getByText('Solution ready', { exact: true })).toHaveCount(0);
});

test('surfaces a real worker loading failure and can retry without losing the cube', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a scramble', exact: true }).click();
  const original = (await inspect(page)).cubeFacelets;
  await page.route('**/solver.worker.ts*', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Solve scramble', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('worker could not run');
  expect((await inspect(page)).cubeFacelets).toBe(original);
  expect((await inspect(page)).verified).toBe(false);
  await page.unroute('**/solver.worker.ts*');
  await page.getByRole('button', { name: 'Solve scramble', exact: true }).click();
  await expect(page.getByText('Solution ready', { exact: true })).toBeVisible({ timeout: 45_000 });
  expect((await inspect(page)).initialFacelets).toBe(original);
});

test('animates all 18 direct face turns with correct signed angles and exact lattice endpoints', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a scramble', exact: true }).click();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  const first = await inspect(page);
  const { fromFacelets } = await import('../../src/cube/validation');
  const { isFace } = await import('../../src/cube/types');
  const facelets = first.cubeFacelets.split('');
  if (!facelets.every(isFace)) throw new Error('Unexpected facelet data.');
  let expected = fromFacelets(facelets);
  const axes = { U: 1, R: 0, F: 2, D: 1, L: 0, B: 2 };
  const signs = { U: -1, R: -1, F: -1, D: 1, L: 1, B: 1 };
  for (const face of FACES) {
    for (const turns of [1, -1, 2] as const) {
      const move = { face, turns };
      await page.getByRole('button', { name: `Apply ${formatMove(move)}`, exact: true }).click();
      await page.waitForFunction(() => {
        const progress = window.__cubeGuide.inspect().transition?.progress ?? 0;
        return progress > 0.12 && progress < 0.8;
      });
      const moving = await inspect(page);
      expect(moving.visual?.movingCubelets).toBe(9);
      const progress = moving.transition!.progress;
      const eased = progress * progress * (3 - 2 * progress);
      const angle = signs[face] * turns * Math.PI / 2 * eased;
      const rotating = moving.visual!.transforms.filter((transform) => Math.abs(transform.quaternion[3] - 1) > 0.00001);
      expect(rotating).toHaveLength(9);
      for (const transform of rotating) {
        expect(transform.quaternion[axes[face]]).toBeCloseTo(Math.sin(angle / 2), 6);
        expect(transform.quaternion[3]).toBeCloseTo(Math.cos(angle / 2), 6);
      }
      expected = applyMove(expected, move);
      await expect.poll(async () => (await inspect(page)).transition).toBe(null);
      await aligned(page, cubeKey(expected));
      expect((await inspect(page)).cubeFacelets).toBe(cubeKey(expected));
    }
  }
});

for (const axisSign of ['positive', 'negative'] as const) {
  test(`${axisSign}-axis half-turn rewind indicators follow physical direction, while whole undo remains clockwise`, async ({ page }) => {
    const original = applyAlgorithm(solvedCube(), parseAlgorithm('R2'));
    await centers(page, PRACTICE_SCHEME);
    await paintInput(page, toColors(original, PRACTICE_SCHEME));
    await page.getByRole('button', { name: 'Check colors & solve', exact: true }).click();
    await expect(page.getByText('Solution ready', { exact: true })).toBeVisible({ timeout: 45_000 });
    const ready = await inspect(page);
    const moves = parseAlgorithm(ready.solutionMoves);
    const candidates = axisSign === 'positive' ? ['R', 'U', 'F'] : ['L', 'D', 'B'];
    const index = moves.findIndex((move) => move.turns === 2 && candidates.includes(move.face));
    expect(index).toBeGreaterThanOrEqual(0);
    const face = moves[index].face;
    if (index > 0) await page.getByRole('button', { name: new RegExp(`^Jump to after move ${index}:`) }).click();
    await waitAtStep(page, index);
    await page.getByLabel('Animation speed').selectOption('0.25');
    await page.getByRole('button', { name: 'Next move', exact: true }).click();
    await page.waitForFunction(() => (window.__cubeGuide.inspect().transition?.progress ?? 0) > 0.15);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const before = (await inspect(page)).transition!.progress;
    expect((await inspect(page)).visual!.indicator).toEqual({ face, direction: 'clockwise' });
    await page.getByRole('button', { name: 'Previous move', exact: true }).click();
    await expect(page.locator('.direction-indicator')).toHaveAttribute('data-direction', 'counter-clockwise');
    await expect(page.locator('.move-notation')).toHaveText(`${face}2`);
    await page.waitForFunction((progress) => (window.__cubeGuide.inspect().transition?.progress ?? 0) < progress, before);
    expect((await inspect(page)).visual!.indicator).toEqual({ face, direction: 'counter-clockwise' });
    await waitAtStep(page, index);
    await aligned(page, ready.snapshots[index]);
    await page.getByLabel('Animation speed').selectOption('2');
    await page.getByRole('button', { name: 'Next move', exact: true }).click();
    await waitAtStep(page, index + 1);
    await page.getByRole('button', { name: 'Previous move', exact: true }).click();
    await expect(page.locator('.direction-indicator')).toHaveAttribute('data-direction', 'clockwise');
    expect((await inspect(page)).visual!.indicator).toEqual({ face, direction: 'clockwise' });
    await waitAtStep(page, index);
    await aligned(page, ready.snapshots[index]);
  });
}

test('camera orbit, zoom and exact U/D/F views never change the authoritative cube', async ({ page }) => {
  const original = await inspect(page);
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Missing canvas.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 40, { steps: 10 });
  await page.mouse.up();
  expect((await inspect(page)).visual?.camera.position).not.toEqual(original.visual?.camera.position);
  const distance = (await inspect(page)).visual!.camera.distance;
  await page.mouse.wheel(0, -250);
  await expect.poll(async () => (await inspect(page)).visual!.camera.distance).toBeLessThan(distance);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).visual!.camera.position.map((value) => Math.round(value * 1000)))
    .toEqual(original.visual!.camera.position.map((value) => Math.round(value * 1000)));
  for (const [face, position, up] of [
    ['F', [0, 0, 9], [0, 1, 0]],
    ['U', [0, 9, 0], [0, 0, -1]],
    ['D', [0, -9, 0], [0, 0, 1]],
  ] as const) {
    await page.getByLabel('Camera view', { exact: true }).selectOption(face);
    const camera = (await inspect(page)).visual!.camera;
    camera.position.forEach((value, i) => expect(value).toBeCloseTo(position[i], 4));
    expect(camera.up).toEqual([...up]);
    expect((await inspect(page)).cubeFacelets).toBe(original.cubeFacelets);
  }
});

test('manual turns recover from cancelled discard and visibility pause without losing their partial position', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a scramble', exact: true }).click();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Apply R', exact: true }).click();
  await page.waitForFunction(() => (window.__cubeGuide.inspect().transition?.progress ?? 0) > 0.1);
  await page.getByRole('button', { name: 'New cube', exact: true }).click();
  await page.getByRole('button', { name: 'Keep my cube', exact: true }).click();
  const paused = await inspect(page);
  expect(paused.running).toBe(false);
  expect(paused.transition?.progress).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Solve scramble', exact: true })).toBeDisabled();
  await page.waitForTimeout(200);
  expect((await inspect(page)).visual!.transforms).toEqual(paused.visual!.transforms);
  await page.getByRole('button', { name: 'Resume turn', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).transition).toBe(null);
  await aligned(page);
  await expect(page.getByRole('button', { name: 'Solve scramble', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'Apply L2', exact: true }).click();
  await page.waitForFunction(() => (window.__cubeGuide.inspect().transition?.progress ?? 0) > 0.1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: 'Resume turn', exact: true })).toBeVisible();
  const hidden = await inspect(page);
  await page.waitForTimeout(200);
  expect((await inspect(page)).transition?.progress).toBe(hidden.transition?.progress);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: 'Beginner', exact: true }).click();
  await page.getByRole('button', { name: 'Resume turn', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).transition).toBe(null);
  await aligned(page);
});

test('keyboard playback shortcuts do not interfere with focused controls', async ({ page }) => {
  await practiceSolution(page);
  const slider = page.getByRole('slider', { name: 'Solution step', exact: true });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await waitAtStep(page, 1);
  await page.keyboard.press('Space');
  expect((await inspect(page)).running).toBe(false);
  await page.getByLabel('Animation speed').focus();
  await page.keyboard.press('ArrowDown');
  expect((await inspect(page)).step).toBe(1);
  await page.locator('h1').click();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await inspect(page)).running).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await inspect(page)).running).toBe(false);
  await page.keyboard.press('Home');
  await waitAtStep(page, 0);
});

test.describe('mobile touch and reduced motion', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  test('adapts entry, touch camera, reduced-motion steps and regular animations', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByRole('checkbox', { name: 'Reduce motion', exact: true })).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const cameraBefore = (await inspect(page)).visual!.camera;
    await page.locator('canvas').scrollIntoViewIfNeeded();
    await expect(page.locator('canvas')).toBeInViewport({ ratio: 1 });
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('No touch canvas.');
    const cdp = await context.newCDPSession(page);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 70, y: y + 30 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect((await inspect(page)).visual!.camera.position).not.toEqual(cameraBefore.position);
    await page.getByRole('button', { name: 'Try a scramble', exact: true }).tap();
    await page.getByRole('button', { name: 'Solve scramble', exact: true }).tap();
    await expect(page.getByText('Solution ready', { exact: true })).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: 'Next move', exact: true }).tap();
    await page.waitForFunction(() => (window.__cubeGuide.inspect().transition?.progress ?? 0) > 0.1);
    const reduced = await inspect(page);
    expect(reduced.visual!.movingCubelets).toBe(0);
    expect(reduced.visual!.aligned).toBe(true);
    expect(reduced.visual!.facelets).toBe(reduced.cubeFacelets);
    await waitAtStep(page, 1);
    await page.getByRole('checkbox', { name: 'Reduce motion', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Next move', exact: true }).tap();
    await page.waitForFunction(() => (window.__cubeGuide.inspect().transition?.progress ?? 0) > 0.12);
    expect((await inspect(page)).visual!.movingCubelets).toBe(9);
    await waitAtStep(page, 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole('button', { name: 'New cube', exact: true }).tap();
    await page.getByRole('button', { name: 'Start new cube', exact: true }).tap();
    await centers(page, PRACTICE_SCHEME);
    await page.getByRole('button', { name: 'Paint blue stickers', exact: true }).tap();
    await page.getByTestId('sticker-F-0').tap();
    await expect(page.getByTestId('sticker-F-0')).toHaveAccessibleName('Front row 1 column 1: Blue');
    const targets = await page.locator('.sticker').evaluateAll((elements) =>
      elements.map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
    );
    expect(targets.every((target) => target.width >= 24 && target.height >= 24)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
