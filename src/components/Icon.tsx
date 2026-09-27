import type { CSSProperties } from 'react';

type IconName = 'play' | 'pause' | 'previous' | 'next' | 'restart' | 'shuffle' | 'check' | 'arrow'
  | 'help' | 'close' | 'cube' | 'edit' | 'eye' | 'alert' | 'lock' | 'camera' | 'upload';

const PATHS: Record<IconName, string> = {
  play: 'm9 5 11 7-11 7V5Z',
  pause: 'M8 5v14M16 5v14',
  previous: 'M5 5v14M19 5 9 12l10 7V5Z',
  next: 'M19 5v14M5 5l10 7-10 7V5Z',
  restart: 'M3 10a9 9 0 1 1 1 7M3 4v6h6',
  shuffle: 'm17 3 4 4-4 4M3 17h3c4 0 7-10 11-10h4M3 7h3c1 0 2 .6 3 1.5M15 15.5c.7.8 1.3 1.5 2 1.5h4m-4-4 4 4-4 4',
  check: 'm5 12 4 4L19 6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  help: 'M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  close: 'm6 6 12 12M6 18 18 6',
  cube: 'm12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5M12 12 3 7m9 5v10M7.5 4.5l9 5m-9 0 9-5M7.5 9.5v10m9-10v10M3 12l9 5 9-5',
  edit: 'm15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  alert: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v.01',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5V11Zm7 4v2',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3V7Zm13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
};

export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d={PATHS[name]} />
    </svg>
  );
}

export function TurnArrow({ inverse }: { inverse: boolean }) {
  return (
    <svg className="turn-arrow" viewBox="0 0 32 32" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g transform={inverse ? 'translate(32 0) scale(-1 1)' : undefined}>
        <path d="M8.3 9.6A10 10 0 1 1 23.7 22.4" />
        <path d="m24 16.6-.3 5.8 5.8-.3" />
      </g>
    </svg>
  );
}
