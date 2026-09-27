import { COLOR_INFO, type ColorScheme, type Face } from '../cube/types';

export const ENTRY_ORDER: readonly Face[] = ['F', 'R', 'B', 'L', 'U', 'D'];
export const FACE_NEIGHBORS: Record<Face, { top: Face; right: Face; bottom: Face; left: Face }> = {
  F: { top: 'U', right: 'R', bottom: 'D', left: 'L' },
  R: { top: 'U', right: 'B', bottom: 'D', left: 'F' },
  B: { top: 'U', right: 'L', bottom: 'D', left: 'R' },
  L: { top: 'U', right: 'F', bottom: 'D', left: 'B' },
  U: { top: 'B', right: 'R', bottom: 'F', left: 'L' },
  D: { top: 'F', right: 'R', bottom: 'B', left: 'L' },
};

export function orientationInstruction(face: Face, scheme: ColorScheme): string {
  const color = (f: Face) => COLOR_INFO[scheme[f]].name.toLowerCase();
  const home = `Start with ${color('U')} on top and ${color('F')} facing you.`;
  switch (face) {
    case 'F': return `${home} Look directly at the ${color('F')} face. Read its stickers left to right, top to bottom.`;
    case 'R': return `${home} Rotate the whole cube left until the ${color('R')} face points toward you. Keep ${color('U')} on top; ${color('F')} is now on your left.`;
    case 'B': return `${home} Rotate the whole cube halfway around its vertical axis. Keep ${color('U')} on top. Looking straight at ${color('B')}, ${color('R')} is on your left and ${color('L')} on your right. Do not mirror this grid.`;
    case 'L': return `${home} Rotate the whole cube right until ${color('L')} faces you. Keep ${color('U')} on top; ${color('F')} is now on your right.`;
    case 'U': return `${home} Tilt the whole cube toward you to look straight at ${color('U')}. The ${color('B')} center must be beyond the TOP edge of this view, and ${color('F')} beyond the BOTTOM edge.`;
    case 'D': return `${home} Tilt the whole cube away from you to look straight at ${color('D')}. The ${color('F')} center must be beyond the TOP edge of this view, and ${color('B')} beyond the BOTTOM edge. Do not turn this grid upside down.`;
  }
}
