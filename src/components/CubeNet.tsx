import { toColors } from '../cube/model';
import { COLOR_INFO, FACE_NAMES, FACES, type ColorScheme, type CubeState } from '../cube/types';
import { colorStyle } from './ColorMark';

export function CubeNet({ cube, scheme }: { cube: CubeState; scheme: ColorScheme }) {
  const colors = toColors(cube, scheme);
  return (
    <div className="cube-net" aria-label="Flat view of the last completed cube state">
      {FACES.map((face, faceIndex) => (
        <figure className={`net-face net-${face}`} key={face}>
          <figcaption>{face} <span>{FACE_NAMES[face]}</span></figcaption>
          <div className="mini-sticker-grid" role="img"
            aria-label={`${FACE_NAMES[face]}: ${colors.slice(faceIndex * 9, faceIndex * 9 + 9).join(', ')}`}>
            {colors.slice(faceIndex * 9, faceIndex * 9 + 9).map((color, i) =>
              <span key={i} style={colorStyle(color)} aria-hidden="true">{COLOR_INFO[color].symbol}</span>,
            )}
          </div>
        </figure>
      ))}
    </div>
  );
}
