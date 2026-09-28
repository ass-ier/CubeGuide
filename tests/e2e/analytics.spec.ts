import { expect, test } from '@playwright/test';
import type { BeforeSendEvent } from '@vercel/analytics/react';
import type { Color } from '../../src/cube/types';
import { automaticPhotoFile } from '../fixtures/browser-photo';

const productionAnalytics = process.env.CUBE_GUIDE_ANALYTICS_ENABLED === '1';
const analyticsScript = 'script[src$="/_vercel/insights/script.js"]';

test('local and preview builds do not load analytics or its development collector', async ({ page }) => {
  test.skip(productionAnalytics, 'This check is for a build without production Vercel analytics.');
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\/_vercel\/insights\/|vercel-scripts\.com/.test(request.url())) requests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByTestId('landing-photo-action')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator(analyticsScript)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Vercel Web Analytics privacy/ })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test.describe('Vercel production analytics integration', () => {
  test.skip(!productionAnalytics, 'Run against a VITE_VERCEL_ENV=production build with CUBE_GUIDE_ANALYTICS_ENABLED=1.');

  test('mounts the actual SDK once and registers page-view redaction without sending live test traffic', async ({ page }) => {
    await page.route('**/_vercel/insights/script.js', (route) => route.fulfill({
      contentType: 'application/javascript', body: '/* The hosted collector is intentionally stubbed in this test. */',
    }));
    await page.goto('/?token=private-test-value#photo-test-name');
    await expect(page.getByTestId('landing-photo-action')).toBeVisible();
    await expect(page.locator(analyticsScript)).toHaveCount(1);
    await expect(page.locator(analyticsScript)).toHaveAttribute('data-sdkn', '@vercel/analytics/react');
    await expect(page.locator(analyticsScript)).toHaveAttribute('data-sdkv', '2.0.1');
    const captured = await page.evaluate(() => {
      const beforeSend = window.vaq?.find(([kind]) => kind === 'beforeSend')?.[1];
      if (typeof beforeSend !== 'function') throw new Error('The SDK did not receive its privacy filter.');
      const event: BeforeSendEvent = { type: 'pageview', url: location.href };
      return {
        mode: window.vam, pageview: beforeSend(event),
        custom: beforeSend({ type: 'event', url: location.href }),
      };
    });
    expect(captured).toEqual({
      mode: 'production', pageview: { type: 'pageview', url: `${new URL(page.url()).origin}/` }, custom: null,
    });
    const privacy = page.getByRole('link', { name: /Vercel Web Analytics privacy/ });
    await expect(privacy).toHaveAttribute('target', '_blank');
    await expect(privacy).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('.site-footer')).toContainText('Photos and cube data stay on your device.');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });

  test('blocked analytics never prevents reading a face photo', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/_vercel/insights/script.js', (route) => route.abort('failed'));
    await page.goto('/');
    await expect(page.getByTestId('landing-photo-action')).toBeEnabled();
    const file = await automaticPhotoFile(page, Array<Color>(9).fill('green'));
    await page.getByTestId('automatic-photo-file').setInputFiles(file);
    await expect(page.getByTestId('auto-slot-F')).toHaveAttribute('aria-label', /green center, added/);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
