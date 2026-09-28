import { afterEach, describe, expect, it, vi } from 'vitest';
import { redactPageView } from '../../src/analytics';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('production-only visitor analytics', () => {
  for (const [production, deployment, expected] of [
    [false, undefined, false],
    [false, 'production', false],
    [true, undefined, false],
    [true, 'development', false],
    [true, 'preview', false],
    [true, 'production', true],
  ] as const) {
    it(`enables=${expected} for production build ${production}, deployment ${deployment ?? 'local'}`, async () => {
      vi.stubEnv('PROD', production);
      vi.stubEnv('VITE_VERCEL_ENV', deployment);
      const { analyticsEnabled } = await import('../../src/analytics');
      expect(analyticsEnabled).toBe(expected);
    });
  }
  it('keeps the public page path but removes query strings, fragments and extra data', () => {
    const event = Object.freeze({
      type: 'pageview' as const,
      url: 'https://cube.example/?token=private&cube=test-state#photo-name.png',
      cube: 'test-sticker-data',
      fileName: 'private-photo.png',
    });
    expect(redactPageView(event)).toEqual({ type: 'pageview', url: 'https://cube.example/' });
    expect(event.url).toContain('?token=private');
    expect(redactPageView({ type: 'pageview', url: 'https://cube.example/guide%3Fexample?ref=secret#step' }))
      .toEqual({ type: 'pageview', url: 'https://cube.example/guide%3Fexample' });
  });
  it('does not collect custom cube, photo or playback events', () => {
    expect(redactPageView({ type: 'event', url: 'https://cube.example/' })).toBe(null);
  });
});
