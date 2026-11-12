import { imageDimensions, withinPeerBounds } from "./image-bounds.ts";

export const MAX_ICO_BYTES = 2 * 1024 * 1024;
export const MAX_ICO_ENTRIES = 64;
export const ICO_MIME_TYPES = ["image/x-icon", "image/vnd.microsoft.icon"] as const;

const HEADER_BYTES = 6;
const ENTRY_BYTES = 16;
const DIB_HEADER_BYTES = 40;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const DIB_DEPTHS = [1, 4, 8, 24, 32];
const MALFORMED = "Icon file is malformed or unsupported";

export class IcoError extends Error {}

type Entry = { index: number; width: number; height: number; bitCount: number; offset: number; size: number };
export type IconImage = { mimeType: "image/png" | "image/x-icon"; bytes: Uint8Array };

export function looksLikeIco(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0;
}

function readDirectory(bytes: Uint8Array): Entry[] {
  if (bytes.length > MAX_ICO_BYTES) throw new IcoError("Icon file is larger than 2 MB");
  if (bytes.length < HEADER_BYTES || !looksLikeIco(bytes)) throw new IcoError(MALFORMED);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4, true);
  const tableEnd = HEADER_BYTES + count * ENTRY_BYTES;
  if (count < 1 || count > MAX_ICO_ENTRIES || tableEnd > bytes.length) throw new IcoError(MALFORMED);
  const entries: Entry[] = [];
  for (let index = 0; index < count; index += 1) {
    const base = HEADER_BYTES + index * ENTRY_BYTES;
    const size = view.getUint32(base + 8, true);
    const offset = view.getUint32(base + 12, true);
    if (size === 0 || offset < tableEnd || offset + size > bytes.length) throw new IcoError(MALFORMED);
    entries.push({
      index, width: bytes[base] || 256, height: bytes[base + 1] || 256,
      bitCount: view.getUint16(base + 6, true), offset, size,
    });
  }
  return entries;
}

function isPng(data: Uint8Array): boolean {
  return data.length >= 24 && PNG_SIGNATURE.every((value, index) => data[index] === value) &&
    data[8] === 0 && data[9] === 0 && data[10] === 0 && data[11] === 13;
}

function validPng(entry: Entry, data: Uint8Array): boolean {
  if (!isPng(data)) return false;
  const size = imageDimensions(data, "png");
  return !!size && withinPeerBounds(size) && size.width === entry.width && size.height === entry.height;
}

function dibDepth(entry: Entry, data: Uint8Array): number | null {
  if (data.length < DIB_HEADER_BYTES) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const depth = view.getUint16(14, true);
  const used = view.getUint32(32, true);
  const palette = depth <= 8 ? 2 ** depth : 0;
  if (view.getUint32(0, true) !== DIB_HEADER_BYTES || view.getInt32(4, true) !== entry.width ||
    view.getInt32(8, true) !== entry.height * 2 || view.getUint16(12, true) !== 1 ||
    view.getUint32(16, true) !== 0 || !DIB_DEPTHS.includes(depth) || used > palette) return null;
  const colors = depth <= 8 ? used || palette : 0;
  const pixels = ((entry.width * depth + 31) >> 5) * 4 * entry.height;
  const mask = ((entry.width + 31) >> 5) * 4 * entry.height;
  return data.length >= DIB_HEADER_BYTES + colors * 4 + pixels + mask ? depth : null;
}

function standaloneIco(entry: Entry, depth: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(HEADER_BYTES + ENTRY_BYTES + data.length);
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  out[6] = entry.width === 256 ? 0 : entry.width;
  out[7] = entry.height === 256 ? 0 : entry.height;
  view.setUint16(10, 1, true);
  view.setUint16(12, depth, true);
  view.setUint32(14, data.length, true);
  view.setUint32(18, HEADER_BYTES + ENTRY_BYTES, true);
  out.set(data, HEADER_BYTES + ENTRY_BYTES);
  return out;
}

export function extractIconImage(bytes: Uint8Array): IconImage {
  const ranked = readDirectory(bytes).sort((a, b) =>
    b.width * b.height - a.width * a.height || b.bitCount - a.bitCount || a.index - b.index);
  for (const entry of ranked) {
    const data = bytes.subarray(entry.offset, entry.offset + entry.size);
    if (validPng(entry, data)) return { mimeType: "image/png", bytes: new Uint8Array(data) };
    const depth = dibDepth(entry, data);
    if (depth !== null) return { mimeType: "image/x-icon", bytes: standaloneIco(entry, depth, data) };
  }
  throw new IcoError("Icon file has no usable image");
}
