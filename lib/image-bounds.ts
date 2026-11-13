export const MAX_PEER_SIDE = 4096;
export const MAX_PEER_PIXELS = 16 * 1024 * 1024;

type Format = "png" | "jpeg" | "webp";
export type Dimensions = { width: number; height: number };

export function imageDimensions(bytes: Uint8Array, format: Format): Dimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "png") {
    const header = String.fromCharCode(...bytes.subarray(12, 16));
    return bytes.length >= 24 && header === "IHDR" ? { width: view.getUint32(16), height: view.getUint32(20) } : null;
  }
  if (format === "jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xff) { offset += 1; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      const length = view.getUint16(offset + 2);
      if (length < 2) return null;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
    return null;
  }
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === "VP8X") {
    return { width: 1 + (bytes[24] | bytes[25] << 8 | bytes[26] << 16), height: 1 + (bytes[27] | bytes[28] << 8 | bytes[29] << 16) };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = view.getUint32(21, true);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  return null;
}

export function withinPeerBounds(size: Dimensions | null): boolean {
  return !!size && size.width > 0 && size.height > 0 && size.width <= MAX_PEER_SIDE &&
    size.height <= MAX_PEER_SIDE && size.width * size.height <= MAX_PEER_PIXELS;
}
