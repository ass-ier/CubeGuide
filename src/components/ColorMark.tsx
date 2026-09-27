import type { CSSProperties } from 'react';
import { COLOR_INFO, type Color } from '../cube/types';

export function colorStyle(color: Color): CSSProperties {
  return { '--sticker-color': COLOR_INFO[color].hex, '--sticker-ink': COLOR_INFO[color].ink } as CSSProperties;
}

export function ColorMark({ color, name = false }: { color: Color; name?: boolean }) {
  return (
    <span className="color-label">
      <span className="color-mark" style={colorStyle(color)} aria-hidden="true">{COLOR_INFO[color].symbol}</span>
      {name && <span>{COLOR_INFO[color].name}</span>}
    </span>
  );
}
