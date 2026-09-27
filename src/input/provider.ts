import { FACES, isColor, type Color, type ColorScheme, type Face, type StickerInput } from '../cube/types';

export interface InputCapture {
  readonly provider: 'manual' | 'photo' | 'camera';
  readonly stickers: StickerInput;
}

// A future scanner supplies the same colors and passes through the same validator.
export interface CubeInputProvider {
  readonly id: InputCapture['provider'];
  capture(): InputCapture;
}

export function emptyEntry(): StickerInput {
  return Object.freeze(Array<null>(54).fill(null));
}

export function entryWithCenters(scheme: ColorScheme): StickerInput {
  return Object.freeze(FACES.flatMap((face) =>
    Array.from({ length: 9 }, (_, i) => i === 4 ? scheme[face] : null),
  ));
}

export function schemeFromCenters(centers: Partial<Record<Face, Color>>): ColorScheme | null {
  const { U, R, F, D, L, B } = centers;
  if (!isColor(U) || !isColor(R) || !isColor(F) || !isColor(D) || !isColor(L) || !isColor(B)
    || new Set([U, R, F, D, L, B]).size !== 6) return null;
  return Object.freeze({ U, R, F, D, L, B });
}

export function paintSticker(entry: StickerInput, index: number, color: Color | null): StickerInput {
  if (!Number.isInteger(index) || index < 0 || index >= 54) throw new Error('Sticker index must be between 0 and 53.');
  if (index % 9 === 4) throw new Error('Centers are fixed during sticker entry. Change orientation to edit centers.');
  return Object.freeze(entry.map((value, i) => i === index ? color : value));
}

export class ManualInputProvider implements CubeInputProvider {
  readonly id = 'manual' as const;
  constructor(private readonly stickers: StickerInput) {}
  capture(): InputCapture {
    return Object.freeze({ provider: this.id, stickers: Object.freeze([...this.stickers]) });
  }
}

export class PhotoInputProvider implements CubeInputProvider {
  readonly id = 'photo' as const;
  constructor(
    private readonly stickers: StickerInput,
    private readonly face: Face,
    private readonly reviewed: readonly Color[],
    private readonly scheme: ColorScheme,
  ) {}
  capture(): InputCapture {
    if (this.stickers.length !== 54 || this.reviewed.length !== 9 || !this.reviewed.every(isColor)) throw new Error('A reviewed photo must supply exactly nine named colors into a 54-sticker entry.');
    if (this.reviewed[4] !== this.scheme[this.face]) throw new Error('A photo cannot change the fixed center color. Confirm the correct face orientation.');
    const base = FACES.indexOf(this.face) * 9;
    return Object.freeze({
      provider: this.id,
      stickers: Object.freeze(this.stickers.map((color, i) => i >= base && i < base + 9 ? this.reviewed[i - base] : color)),
    });
  }
}
