import type { Page } from '@playwright/test';
import type { Color } from '../../src/cube/types';
import { fixturePhoto, type PhotoRegion } from './photo';

export async function automaticPhotoFile(
  page: Page,
  colors: readonly Color[],
  region: Partial<Omit<PhotoRegion, 'colors'>> = {},
  options: { mime?: 'image/png' | 'image/jpeg' | 'image/webp'; blank?: boolean; exif?: number } = {},
) {
  const pixels = fixturePhoto(options.blank ? [] : [{ x: 100, y: 65, size: 300, ...region, colors }]);
  const mimeType = options.mime ?? 'image/png';
  const base64 = await page.evaluate(({ data, width, height, mime }) => {
    const bytes = Uint8ClampedArray.from(atob(data), (character) => character.charCodeAt(0));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create the test photograph.');
    context.putImageData(new ImageData(bytes, width, height), 0, 0);
    return canvas.toDataURL(mime, 0.96).split(',')[1];
  }, { data: Buffer.from(pixels.data).toString('base64'), width: pixels.width, height: pixels.height, mime: mimeType });
  let buffer = Buffer.from(base64, 'base64');
  if (options.exif) {
    if (mimeType !== 'image/jpeg') throw new Error('EXIF fixture metadata needs a JPEG.');
    const exif = Buffer.alloc(32);
    exif.write('Exif', 0, 'ascii');
    exif[6] = 0x49; exif[7] = 0x49;
    exif.writeUInt16LE(42, 8);
    exif.writeUInt32LE(8, 10);
    exif.writeUInt16LE(1, 14);
    exif.writeUInt16LE(0x0112, 16);
    exif.writeUInt16LE(3, 18);
    exif.writeUInt32LE(1, 20);
    exif.writeUInt16LE(options.exif, 24);
    const marker = Buffer.from([0xff, 0xe1, 0, exif.length + 2]);
    buffer = Buffer.concat([buffer.subarray(0, 2), marker, exif, buffer.subarray(2)]);
  }
  return { name: `cube-face.${mimeType.split('/')[1]}`, mimeType, buffer };
}
