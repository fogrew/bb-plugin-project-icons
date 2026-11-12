import test from "node:test";
import assert from "node:assert/strict";
import { MAX_ICO_BYTES, MAX_ICO_ENTRIES, extractIconImage, looksLikeIco } from "./lib/ico.ts";
import { MAX_IMAGE_BYTES } from "./lib/icon-discovery.ts";
import { bmpEntry, buildIco, pngEntry } from "./test-fixtures/ico.mjs";

const MALFORMED = /malformed or unsupported/;
const NO_IMAGE = /no usable image/;
const patched = (bytes, change) => { const copy = Buffer.from(bytes); change(copy); return copy; };
const entryBase = (index) => 6 + index * 16;
const header = (buffer, offset, change) => patched(buffer, copy => change(copy, offset));

test("the byte limit matches the shared image limit", () => {
  assert.equal(MAX_ICO_BYTES, MAX_IMAGE_BYTES);
});

test("magic requires reserved 0 and type 1", () => {
  assert.equal(looksLikeIco(Buffer.from([0, 0, 1, 0, 1, 0])), true);
  for (const bytes of [[0, 0, 2, 0], [1, 0, 1, 0], [0, 0, 1, 1], [0, 0, 1], []]) assert.equal(looksLikeIco(Uint8Array.from(bytes)), false);
});

test("the largest PNG entry is chosen regardless of directory order", () => {
  const entries = [pngEntry(16), pngEntry(256), pngEntry(48), pngEntry(32)];
  for (const order of [[0, 1, 2, 3], [3, 2, 1, 0], [1, 3, 0, 2]]) {
    const image = extractIconImage(buildIco(order.map(index => entries[index])));
    assert.equal(image.mimeType, "image/png");
    assert.ok(Buffer.from(image.bytes).equals(entries[1].data));
  }
});

test("the largest BMP entry becomes a standalone single-image ICO", () => {
  const entries = [bmpEntry(16), bmpEntry(48), bmpEntry(32)];
  const image = extractIconImage(buildIco(entries));
  assert.equal(image.mimeType, "image/x-icon");
  const out = Buffer.from(image.bytes);
  assert.deepEqual([out.readUInt16LE(0), out.readUInt16LE(2), out.readUInt16LE(4)], [0, 1, 1]);
  assert.deepEqual([out[6], out[7]], [48, 48]);
  assert.equal(out.readUInt32LE(14), entries[1].data.length);
  assert.equal(out.readUInt32LE(18), 22);
  assert.ok(out.subarray(22).equals(entries[1].data));
  const again = extractIconImage(out);
  assert.equal(again.mimeType, "image/x-icon");
  assert.ok(Buffer.from(again.bytes).equals(out));
});

test("a 256 pixel BMP entry uses the zero dimension byte in the standalone ICO", () => {
  const out = Buffer.from(extractIconImage(buildIco([bmpEntry(256)])).bytes);
  assert.deepEqual([out[6], out[7]], [0, 0]);
});

test("1, 4, 8, 24 and 32-bit BMP entries are accepted, including padded row widths", () => {
  for (const size of [16, 20, 32]) {
    for (const depth of [1, 4, 8, 24, 32]) {
      const entry = bmpEntry(size, { depth });
      const image = extractIconImage(buildIco([entry]));
      assert.equal(image.mimeType, "image/x-icon", `${size}px ${depth}-bit`);
      assert.equal(Buffer.from(image.bytes).readUInt16LE(12), depth);
      assert.ok(Buffer.from(image.bytes).subarray(22).equals(entry.data));
    }
  }
});

test("the directory bit count is not trusted", () => {
  const lyingHigh = { ...bmpEntry(32, { depth: 24 }), bitCount: 65535 };
  const png = pngEntry(32);
  assert.equal(extractIconImage(buildIco([lyingHigh, png])).mimeType, "image/png");
  const lyingLow = { ...bmpEntry(32), bitCount: 1 };
  const image = extractIconImage(buildIco([lyingLow]));
  assert.equal(Buffer.from(image.bytes).readUInt16LE(12), 32);
  const gray = { ...pngEntry(32), data: patched(pngEntry(32).data, copy => { copy[24] = 8; copy[25] = 0; }) };
  assert.equal(extractIconImage(buildIco([gray, bmpEntry(32, { depth: 24 })])).mimeType, "image/x-icon");
});

test("ties break by bit depth, then directory order", () => {
  const png = pngEntry(32);
  const deep = extractIconImage(buildIco([bmpEntry(32, { depth: 24 }), png]));
  assert.equal(deep.mimeType, "image/png");
  const first = extractIconImage(buildIco([bmpEntry(32), png]));
  assert.equal(first.mimeType, "image/x-icon");
  const second = extractIconImage(buildIco([png, bmpEntry(32)]));
  assert.equal(second.mimeType, "image/png");
});

test("an unusable largest entry falls back to the next valid one", () => {
  const small = pngEntry(32);
  const lying = pngEntry(64);
  lying.data = patched(lying.data, copy => copy.writeUInt32BE(8192, 16));
  const image = extractIconImage(buildIco([lying, small]));
  assert.ok(Buffer.from(image.bytes).equals(small.data));
  const truncated = bmpEntry(64);
  truncated.data = truncated.data.subarray(0, truncated.data.length - 1);
  const fallback = extractIconImage(buildIco([truncated, small]));
  assert.ok(Buffer.from(fallback.bytes).equals(small.data));
});

test("views with a nonzero byte offset parse correctly", () => {
  const ico = buildIco([pngEntry(32), bmpEntry(16)]);
  const padded = new Uint8Array(ico.length + 7);
  padded.set(ico, 7);
  const image = extractIconImage(padded.subarray(7));
  assert.equal(image.mimeType, "image/png");
});

test("hostile or truncated directories are rejected", () => {
  const good = buildIco([pngEntry(16), pngEntry(32)]);
  const cases = {
    "not an icon": Buffer.from("not an icon file"),
    "empty": Buffer.alloc(0),
    "only the magic": Buffer.from([0, 0, 1, 0]),
    "reserved set": header(good, 0, (b) => b.writeUInt16LE(1, 0)),
    "cursor type": header(good, 2, (b) => b.writeUInt16LE(2, 2)),
    "zero entries": header(good, 4, (b) => b.writeUInt16LE(0, 4)),
    "above the entry cap": header(buildIco(Array.from({ length: MAX_ICO_ENTRIES + 1 }, () => pngEntry(16))), 4, () => {}),
    "count beyond the file": header(good, 4, (b) => b.writeUInt16LE(0xffff, 4)),
    "directory cut short": good.subarray(0, 6 + 16 + 8),
    "offset past the end": header(good, 0, (b) => b.writeUInt32LE(good.length, entryBase(1) + 12)),
    "offset overflow": header(good, 0, (b) => b.writeUInt32LE(0xfffffff0, entryBase(0) + 12)),
    "size past the end": header(good, 0, (b) => b.writeUInt32LE(good.length, entryBase(0) + 8)),
    "size overflow": header(good, 0, (b) => b.writeUInt32LE(0xffffffff, entryBase(1) + 8)),
    "zero size": header(good, 0, (b) => b.writeUInt32LE(0, entryBase(0) + 8)),
    "offset inside the directory": header(good, 0, (b) => b.writeUInt32LE(10, entryBase(0) + 12)),
    "data cut short": good.subarray(0, good.length - 1),
  };
  assert.equal(MAX_ICO_ENTRIES, 64);
  for (const [name, bytes] of Object.entries(cases)) assert.throws(() => extractIconImage(bytes), MALFORMED, name);
});

test("files over the byte cap are rejected", () => {
  const huge = Buffer.concat([buildIco([pngEntry(16)]), Buffer.alloc(MAX_ICO_BYTES)]);
  assert.throws(() => extractIconImage(huge), MALFORMED);
});

test("PNG entries with impossible color type or bit depth are skipped", () => {
  const base = pngEntry(32);
  for (const [depth, colorType] of [[8, 1], [4, 2], [16, 3], [3, 0], [0, 6], [8, 5]]) {
    const entry = { ...base, data: patched(base.data, copy => { copy[24] = depth; copy[25] = colorType; }) };
    assert.throws(() => extractIconImage(buildIco([entry])), NO_IMAGE, `${depth}/${colorType}`);
  }
});

test("PNG entries with oversize or mismatched dimensions are skipped", () => {
  const base = pngEntry(32);
  const dims = (width, height) => ({ ...base, data: patched(base.data, copy => { copy.writeUInt32BE(width, 16); copy.writeUInt32BE(height, 20); }) });
  for (const [width, height] of [[8192, 8192], [4096, 4096], [0xffffffff, 0xffffffff], [33, 32], [32, 31], [0, 0]]) {
    assert.throws(() => extractIconImage(buildIco([dims(width, height)])), NO_IMAGE, `${width}x${height}`);
  }
  const badChunk = { ...base, data: patched(base.data, copy => copy.writeUInt32BE(12, 8)) };
  assert.throws(() => extractIconImage(buildIco([badChunk])), NO_IMAGE);
  const notIhdr = { ...base, data: patched(base.data, copy => copy.write("IDAT", 12)) };
  assert.throws(() => extractIconImage(buildIco([notIhdr])), NO_IMAGE);
  const wide = { ...base, width: 256, data: pngEntry(512).data };
  assert.throws(() => extractIconImage(buildIco([wide])), NO_IMAGE);
});

test("malformed BMP entries are skipped", () => {
  const base = bmpEntry(32);
  const dib = (change) => ({ ...base, data: patched(base.data, change) });
  const cases = {
    "header size": dib(b => b.writeUInt32LE(108, 0)),
    "width mismatch": dib(b => b.writeInt32LE(64, 4)),
    "huge width": dib(b => b.writeInt32LE(0x7fffffff, 4)),
    "height not doubled": dib(b => b.writeInt32LE(32, 8)),
    "negative height": dib(b => b.writeInt32LE(-64, 8)),
    "huge height": dib(b => b.writeInt32LE(0x7fffffff, 8)),
    "planes": dib(b => b.writeUInt16LE(2, 12)),
    "16 bit": dib(b => b.writeUInt16LE(16, 14)),
    "compression": dib(b => b.writeUInt32LE(1, 16)),
    "bitfields": dib(b => b.writeUInt32LE(3, 16)),
    "palette beyond depth": dib(b => { b.writeUInt16LE(8, 14); b.writeUInt32LE(257, 32); }),
    "palette on true color": dib(b => b.writeUInt32LE(1, 32)),
    "too short for a header": { ...base, data: base.data.subarray(0, 20) },
    "missing pixels": { ...base, data: base.data.subarray(0, 40 + 32 * 32 * 4) },
    "missing mask": { ...base, data: base.data.subarray(0, base.data.length - 4) },
  };
  for (const [name, entry] of Object.entries(cases)) assert.throws(() => extractIconImage(buildIco([entry])), NO_IMAGE, name);
});

test("entries that are neither PNG nor BMP are skipped", () => {
  const junk = { width: 32, height: 32, bitCount: 32, data: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>".padEnd(64)) };
  assert.throws(() => extractIconImage(buildIco([junk])), NO_IMAGE);
  const jpeg = { width: 32, height: 32, bitCount: 24, data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(0)]) };
  assert.throws(() => extractIconImage(buildIco([jpeg])), NO_IMAGE);
});
