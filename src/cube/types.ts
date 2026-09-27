export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACES)[number];
export type Turns = 1 | -1 | 2;

export interface Move {
  readonly face: Face;
  readonly turns: Turns;
}

export interface CubeState {
  readonly cp: readonly number[];
  readonly co: readonly number[];
  readonly ep: readonly number[];
  readonly eo: readonly number[];
}

export const FACE_NAMES: Record<Face, string> = {
  U: 'Up',
  R: 'Right',
  F: 'Front',
  D: 'Down',
  L: 'Left',
  B: 'Back',
};

export const COLORS = ['white', 'yellow', 'green', 'blue', 'red', 'orange'] as const;
export type Color = (typeof COLORS)[number];
export type ColorScheme = Readonly<Record<Face, Color>>;
export type StickerInput = readonly (Color | null)[];

export const COLOR_INFO: Record<Color, { name: string; symbol: string; hex: string; ink: string }> = {
  white: { name: 'White', symbol: 'W', hex: '#f6f7f5', ink: '#253344' },
  yellow: { name: 'Yellow', symbol: 'Y', hex: '#ffda35', ink: '#253344' },
  green: { name: 'Green', symbol: 'G', hex: '#168653', ink: '#ffffff' },
  blue: { name: 'Blue', symbol: 'B', hex: '#2363cb', ink: '#ffffff' },
  red: { name: 'Red', symbol: 'R', hex: '#c93642', ink: '#ffffff' },
  orange: { name: 'Orange', symbol: 'O', hex: '#f68c30', ink: '#253344' },
};

// This scheme is only for the explicitly labeled practice cube, never manual input.
export const PRACTICE_SCHEME: ColorScheme = Object.freeze({
  U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue',
});

export function isFace(value: unknown): value is Face {
  return typeof value === 'string' && FACES.some((face) => face === value);
}

export function isColor(value: unknown): value is Color {
  return typeof value === 'string' && COLORS.some((color) => color === value);
}

export function isMove(value: unknown): value is Move {
  if (typeof value !== 'object' || value === null || !('face' in value) || !('turns' in value)) return false;
  return isFace(value.face) && (value.turns === 1 || value.turns === -1 || value.turns === 2);
}
