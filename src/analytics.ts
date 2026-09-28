import type { BeforeSendEvent } from '@vercel/analytics/react';

export const analyticsEnabled = import.meta.env.PROD && import.meta.env.VITE_VERCEL_ENV === 'production';

export function redactPageView(event: BeforeSendEvent): BeforeSendEvent | null {
  // Only track pageview events; block custom events for privacy
  if (event.type !== 'pageview') return null;
  const url = new URL(event.url);
  url.search = '';
  url.hash = '';
  return { type: 'pageview', url: url.toString() };
}
