import { PNG } from "pngjs";

export const TOP = [220, 40, 40, 255];
export const BOTTOM = [30, 60, 220, 255];
const halves = (size) => (x, y) => (y < size / 2 ? TOP : BOTTOM);

export function pngEntry(size, pixel = halves(size)) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) png.data.set(pixel(x, y), (y * size + x) * 4);
  }
  return { width: size, height: size, bitCount: 32, data: PNG.sync.write(png) };
}

export function bmpEntry(size, { depth = 32, pixel = halves(size) } = {}) {
  const palette = depth === 8 ? [TOP, BOTTOM] : [];
  const stride = ((size * depth + 31) >> 5) * 4;
  const maskStride = ((size + 31) >> 5) * 4;
  const colors = depth === 8 ? 256 : 0;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(depth, 14);
  header.writeUInt32LE(colors, 32);
  const table = Buffer.alloc(colors * 4);
  palette.forEach(([r, g, b], index) => table.set([b, g, r, 0], index * 4));
  const pixels = Buffer.alloc(stride * size);
  const mask = Buffer.alloc(maskStride * size);
  for (let y = 0; y < size; y += 1) {
    const row = (size - 1 - y) * stride;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      if (depth === 32) pixels.set([b, g, r, a], row + x * 4);
      else if (depth === 24) pixels.set([b, g, r], row + x * 3);
      else pixels[row + x] = y >= size / 2 ? 1 : 0;
    }
  }
  return { width: size, height: size, bitCount: depth, data: Buffer.concat([header, table, pixels, mask]) };
}

export function buildIco(entries, { count = entries.length } = {}) {
  const table = 6 + entries.length * 16;
  const head = Buffer.alloc(table);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(count, 4);
  let offset = table;
  entries.forEach((entry, index) => {
    const base = 6 + index * 16;
    head[base] = entry.width === 256 ? 0 : entry.width;
    head[base + 1] = entry.height === 256 ? 0 : entry.height;
    head.writeUInt16LE(1, base + 4);
    head.writeUInt16LE(entry.bitCount, base + 6);
    head.writeUInt32LE(entry.data.length, base + 8);
    head.writeUInt32LE(offset, base + 12);
    offset += entry.data.length;
  });
  return Buffer.concat([head, ...entries.map((entry) => entry.data)]);
}
