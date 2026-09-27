export const MAX_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_SOURCE_PIXELS = 24_000_000;
export const MAX_SOURCE_SIDE = 8192;
export const MAX_IMAGE_SIDE = 1024;

export interface RasterSize { readonly width: number; readonly height: number; readonly format: 'png' | 'jpeg' | 'webp' }

export function rasterSize(bytes: Uint8Array): RasterSize {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, count: number) => String.fromCharCode(...bytes.subarray(offset, offset + count));
  if (bytes.length >= 24 && bytes[0] === 137 && text(1, 3) === 'PNG' && text(12, 4) === 'IHDR') {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      if (text(offset + 4, 4) === 'acTL') throw new Error('Animated PNG is not supported. Choose a still photo.');
      const length = view.getUint32(offset);
      if (length > bytes.length - offset - 12) break;
      offset += length + 12;
    }
    return { width: view.getUint32(16), height: view.getUint32(20), format: 'png' };
  }
  if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 7) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3), format: 'jpeg' };
      }
      offset += length;
    }
  }
  if (bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const kind = text(offset, 4), length = view.getUint32(offset + 4, true), data = offset + 8;
      if (data + length > bytes.length) break;
      if (kind === 'VP8X' && length >= 10) {
        if (bytes[data] & 2) throw new Error('Animated WebP is not supported. Choose a still photo.');
        const uint24 = (i: number) => bytes[i] + bytes[i + 1] * 256 + bytes[i + 2] * 65536;
        return { width: 1 + uint24(data + 4), height: 1 + uint24(data + 7), format: 'webp' };
      }
      if (kind === 'VP8 ' && length >= 10 && bytes[data + 3] === 157 && bytes[data + 4] === 1 && bytes[data + 5] === 42) {
        return { width: view.getUint16(data + 6, true) & 16383, height: view.getUint16(data + 8, true) & 16383, format: 'webp' };
      }
      if (kind === 'VP8L' && length >= 5 && bytes[data] === 47) {
        const bits = view.getUint32(data + 1, true);
        return { width: 1 + (bits & 16383), height: 1 + ((bits >>> 14) & 16383), format: 'webp' };
      }
      offset = data + length + length % 2;
    }
  }
  throw new Error('This is not a supported, readable photo. Use a JPEG, PNG, or WebP image; convert HEIC/HEIF first. SVG and animated formats are not accepted.');
}

export function validatePhotoFile(bytes: Uint8Array, mime: string): RasterSize {
  if (bytes.length > MAX_FILE_BYTES) throw new Error('The photo exceeds 16 MB. Choose a smaller image; your entered colors are unchanged.');
  if (mime && !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mime)) {
    throw new Error('Unsupported image format. Use JPEG, PNG, or WebP. Convert HEIC/HEIF first; SVG and animated images are not supported.');
  }
  const size = rasterSize(bytes);
  if (size.width < 32 || size.height < 32) throw new Error('The photo is too small. Use an image at least 32 pixels wide and tall.');
  if (size.width > MAX_SOURCE_SIDE || size.height > MAX_SOURCE_SIDE || size.width * size.height > MAX_SOURCE_PIXELS) {
    throw new Error('The photo exceeds 24 megapixels or an 8192-pixel edge. Export a smaller version before loading it.');
  }
  return size;
}
