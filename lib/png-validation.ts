/*!
Bundled dependency: pngjs 7.0.0 (MIT)
pngjs original work Copyright (c) 2015 Luke Page & Original Contributors
pngjs derived work Copyright (c) 2012 Kuba Niegowski

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/
import { crc32, inflateSync } from "node:zlib";
import { PNG } from "pngjs";

const MAX_PNG_BYTES = 65536;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const DEPTHS: Record<number, readonly number[]> = {
  0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16],
};
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const ADAM7 = [[8, 8], [8, 8], [16, 8], [16, 16], [32, 16], [32, 32], [64, 32]];
function invalid(): never { throw new Error("Invalid static 64 × 64 PNG"); }

export function decodePng(base64: string): Buffer {
  // Bound base64 allocation even when called outside the RPC schema.
  if (base64.length > 87384) invalid();
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 45 || bytes.length > MAX_PNG_BYTES || bytes.toString("base64") !== base64 ||
      !bytes.subarray(0, 8).equals(SIGNATURE)) invalid();

  let depth = 0, color = 0, interlace = 0, paletteEntries = 0;
  let seenData = false, endedData = false, ended = false;
  const seen = new Set<string>();
  const idats: Buffer[] = [];
  // pngjs 7 permits duplicate headers and skips ancillary CRCs. Check framing
  // before it can use metadata for allocations; leave pixel decoding to pngjs.
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) invalid();
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) invalid();
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || (bytes[offset + 6] & 32)) invalid();
    const data = bytes.subarray(offset + 8, end - 4);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) invalid();
    if (offset === 8 && type !== "IHDR") invalid();
    if (seenData && type !== "IDAT") endedData = true;
    if (["IHDR", "PLTE", "tRNS", "gAMA"].includes(type)) {
      if (seen.has(type) || seenData) invalid();
      seen.add(type);
    }
    switch (type) {
      case "IHDR":
        if (offset !== 8 || length !== 13 || data.readUInt32BE(0) !== 64 || data.readUInt32BE(4) !== 64) invalid();
        depth = data[8]; color = data[9]; interlace = data[12];
        if (!DEPTHS[color]?.includes(depth) || data[10] !== 0 || data[11] !== 0 || interlace > 1) invalid();
        break;
      case "PLTE":
        if (seen.has("tRNS") || color === 0 || color === 4 || length === 0 || length % 3 || length > 768 ||
            (color === 3 && length / 3 > 2 ** depth)) invalid();
        paletteEntries = length / 3;
        break;
      case "tRNS":
        if (color === 3 ? !paletteEntries || length === 0 || length > paletteEntries :
            color === 0 ? length !== 2 || data.readUInt16BE(0) >= 2 ** depth :
            color === 2 ? length !== 6 || [0, 2, 4].some(i => data.readUInt16BE(i) >= 2 ** depth) : true) invalid();
        break;
      case "gAMA":
        if (length !== 4 || data.readUInt32BE(0) === 0 || seen.has("PLTE")) invalid();
        break;
      case "IDAT":
        if (endedData || (color === 3 && !paletteEntries)) invalid();
        seenData = true;
        idats.push(data);
        break;
      case "IEND":
        if (length !== 0 || !seenData || end !== bytes.length) invalid();
        ended = true;
        break;
      case "acTL": case "fcTL": case "fdAT":
        // Only static assignments are supported; canvas exports are static PNGs.
        invalid();
        break;
      default:
        if (!(bytes[offset + 4] & 32)) invalid();
    }
    offset = end;
  }
  if (!ended) invalid();
  const compressed = Buffer.concat(idats);
  const passes = interlace ? ADAM7 : [[64, 64]];
  const expected = passes.reduce((sum, [width, height]) =>
    sum + height * (1 + Math.ceil(width * CHANNELS[color] * depth / 8)), 0);
  // pngjs 7 inflates Adam7 without an output cap and truncates other output.
  // First validate the exact concatenation that its parser will inflate, using
  // public Node APIs and the exact scanline bound (at most 32,888 bytes).
  // @types/node 22 omits the documented info:true result shape.
  const inflated = inflateSync(compressed, { maxOutputLength: expected, info: true }) as unknown as {
    buffer: Buffer; engine: { bytesWritten: number };
  };
  if (inflated.buffer.length !== expected || inflated.engine.bytesWritten !== compressed.length) invalid();
  const decoded = PNG.sync.read(bytes, { checkCRC: true });
  if (decoded.width !== 64 || decoded.height !== 64 || decoded.data.length !== 64 * 64 * 4) invalid();
  return bytes;
}
