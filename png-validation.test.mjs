import test from "node:test";
import assert from "node:assert/strict";
import { crc32, deflateSync } from "node:zlib";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./dist/server.js";
import { transparentPng, opaquePng, emojiPng } from "./test-fixtures/png.mjs";

const projectId = "proj_aaaaaaaaaa";
const signature = transparentPng.subarray(0, 8);
function chunk(type, data = Buffer.alloc(0)) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4, "latin1");
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
  return result;
}
function chunks(png) {
  const result = [];
  for (let offset = 8; offset < png.length;) {
    const end = offset + 12 + png.readUInt32BE(offset);
    result.push({ type: png.toString("latin1", offset + 4, offset + 8), data: png.subarray(offset + 8, end - 4) });
    offset = end;
  }
  return result;
}
function assemble(parts) { return Buffer.concat([signature, ...parts.map(({ type, data }) => chunk(type, data))]); }
function fixture({ color = 6, depth = 8, interlace = 0, filter = 0, raw, compressed, extra = [] } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(64); header.writeUInt32BE(64, 4);
  header[8] = depth; header[9] = color; header[12] = interlace;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color] ?? 4;
  const passes = interlace === 1 ? [[8, 8], [8, 8], [16, 8], [16, 16], [32, 16], [32, 32], [64, 32]] : [[64, 64]];
  const rows = [];
  for (const [width, height] of passes) {
    for (let y = 0; y < height; y++) {
      const row = Buffer.alloc(1 + Math.ceil(width * channels * depth / 8));
      row[0] = filter; rows.push(row);
    }
  }
  return Buffer.concat([signature, chunk("IHDR", header),
    ...(color === 3 ? [chunk("PLTE", Buffer.from([255, 0, 0]))] : []),
    ...extra, chunk("IDAT", compressed ?? deflateSync(raw ?? Buffer.concat(rows))), chunk("IEND")]);
}
async function setup(t) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "project-icons", sdk: { projects: { list: async () => [{ id: projectId, name: "Demo" }] } },
  });
  plugin(bb);
  t.after(() => harness.lifecycle.dispose());
  const call = (method, input) => harness.behavior.callRpc(method, input);
  const save = bytes => call("save", { projectId, base64: bytes.toString("base64") });
  const read = async () => Buffer.from(await (await harness.behavior.fetchHttp("GET", `/icon?projectId=${projectId}`)).arrayBuffer());
  const snapshot = async () => Promise.all((await bb.storage.kv.list()).map(async key => [key, await bb.storage.kv.get(key)]));
  return { bb, harness, call, save, read, snapshot };
}

test("actual-server accepts and preserves real Chrome transparent, opaque and emoji canvas PNGs", async t => {
  const s = await setup(t);
  for (const png of [transparentPng, opaquePng, emojiPng]) {
    await s.save(png);
    assert.deepEqual(await s.read(), png);
    const { undo } = await s.call("removeWithUndo", { projectId });
    assert.equal((await s.call("restore", { projectId, token: undo.token })).status, "restored");
    assert.deepEqual(await s.read(), png);
  }
});

for (const [color, depths] of [[0, [1, 2, 4, 8, 16]], [2, [8, 16]], [3, [1, 2, 4, 8]], [4, [8, 16]], [6, [8, 16]]]) {
  for (const depth of depths) for (const interlace of [0, 1]) {
    test(`actual-server accepts legal color=${color} depth=${depth} interlace=${interlace}`, async t => {
      const s = await setup(t);
      const png = fixture({ color, depth, interlace });
      await s.save(png);
      assert.deepEqual(await s.read(), png);
    });
  }
}
test("all five scanline filters and split/empty IDAT chunks are accepted", async t => {
  const s = await setup(t);
  for (let filter = 0; filter < 5; filter++) await s.save(fixture({ filter }));
  const parts = chunks(transparentPng);
  const idat = parts.find(p => p.type === "IDAT");
  const split = parts.flatMap(p => p === idat ? [
    { type: "IDAT", data: Buffer.alloc(0) },
    { type: "IDAT", data: p.data.subarray(0, 7) },
    { type: "IDAT", data: p.data.subarray(7) },
  ] : [p]);
  await s.save(assemble(split));
});
test("grayscale, RGB and palette transparency and unknown ancillary data remain supported", async t => {
  const s = await setup(t);
  for (const [color, data] of [[0, Buffer.alloc(2)], [2, Buffer.alloc(6)], [3, Buffer.from([128])]]) {
    await s.save(fixture({ color, extra: [chunk("tRNS", data), chunk("teST", Buffer.from("metadata"))] }));
  }
  const png = fixture({ extra: [chunk("teST", Buffer.alloc(65536 - fixture().length - 12))] });
  assert.equal(png.length, 65536);
  await s.save(png);
  assert.deepEqual(await s.read(), png);
});

const parts = chunks(transparentPng);
const header = parts[0], data = parts.find(p => p.type === "IDAT"), end = { type: "IEND", data: Buffer.alloc(0) };
const changedHeader = (offset, value) => {
  const modified = Buffer.from(header.data); modified[offset] = value;
  return assemble([{ type: "IHDR", data: modified }, data, end]);
};
const badCrc = Buffer.from(transparentPng); badCrc[29] ^= 1;
const badAncillaryCrc = fixture({ extra: [chunk("teST", Buffer.from("metadata"))] }); badAncillaryCrc[50] ^= 1;
const palette = chunks(fixture({ color: 3 }));
const malformed = [
  ["signature", Buffer.from(transparentPng).fill(0, 0, 8)],
  ["header-only regression", Buffer.concat([transparentPng.subarray(0, 24), Buffer.alloc(21)])],
  ["truncated header", transparentPng.subarray(0, 20)],
  ["truncated CRC", transparentPng.subarray(0, -1)],
  ["truncated image data", assemble([header, { type: "IDAT", data: data.data.subarray(0, -2) }, end])],
  ["missing IEND", assemble([header, data])],
  ["missing IDAT", assemble([header, end])],
  ["empty IDAT", assemble([header, { type: "IDAT", data: Buffer.alloc(0) }, end])],
  ["IHDR CRC", badCrc],
  ["ancillary CRC", badAncillaryCrc],
  ["invalid deflate", fixture({ compressed: Buffer.from("not zlib") })],
  ["truncated Adler checksum", fixture({ compressed: deflateSync(Buffer.alloc(16448)).subarray(0, -1) })],
  ["too little scanline data", fixture({ raw: Buffer.alloc(16447) })],
  ["too much scanline data", fixture({ raw: Buffer.alloc(16449) })],
  ["deflate bomb", fixture({ raw: Buffer.alloc(4 * 1024 * 1024) })],
  ["Adam7 deflate bomb", fixture({ interlace: 1, depth: 16, raw: Buffer.alloc(4 * 1024 * 1024) })],
  ["trailing zlib garbage", fixture({ compressed: Buffer.concat([deflateSync(Buffer.alloc(16448)), Buffer.from([1])]) })],
  ["concatenated zlib streams", fixture({ compressed: Buffer.concat([deflateSync(Buffer.alloc(16448)), deflateSync(Buffer.alloc(1))]) })],
  ["trailing file bytes", Buffer.concat([transparentPng, Buffer.from([1])])],
  ["second IEND", Buffer.concat([transparentPng, chunk("IEND")])],
  ["duplicate header", assemble([header, header, data, end])],
  ["header after data", assemble([header, data, header, end])],
  ["huge overriding header", assemble([header, { type: "IHDR", data: Buffer.alloc(13, 255) }, data, end])],
  ["chunk before header", assemble([{ type: "teST", data: Buffer.alloc(0) }, header, data, end])],
  ["nonconsecutive IDAT", assemble([header, data, { type: "teST", data: Buffer.alloc(0) }, data, end])],
  ["unknown critical chunk", fixture({ extra: [chunk("TEST")] })],
  ["invalid chunk name", fixture({ extra: [chunk("te1T")] })],
  ["invalid reserved chunk bit", fixture({ extra: [chunk("test")] })],
  ["invalid dimensions", changedHeader(3, 63)],
  ["huge dimensions", changedHeader(0, 127)],
  ["invalid color", changedHeader(9, 1)],
  ["invalid depth", changedHeader(8, 3)],
  ["illegal color/depth pair", changedHeader(8, 4)],
  ["invalid compression method", changedHeader(10, 1)],
  ["invalid filter method", changedHeader(11, 1)],
  ["invalid interlace", changedHeader(12, 2)],
  ["invalid scanline filter", fixture({ filter: 5 })],
  ["Adam7 invalid scanline filter", fixture({ interlace: 1, filter: 255 })],
  ["palette missing", assemble(palette.filter(p => p.type !== "PLTE"))],
  ["palette index out of range", fixture({ color: 3, raw: Buffer.concat(Array.from({ length: 64 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 1)]))) })],
  ["invalid palette length", assemble(palette.map(p => p.type === "PLTE" ? { ...p, data: Buffer.alloc(4) } : p))],
  ["palette after IDAT", assemble([palette[0], palette[2], palette[1], end])],
  ["invalid transparency length", fixture({ extra: [chunk("tRNS", Buffer.alloc(1))] })],
  ["invalid gamma length", fixture({ extra: [chunk("gAMA", Buffer.alloc(1))] })],
  ["APNG animation", fixture({ extra: [chunk("acTL", Buffer.alloc(8))] })],
  ["APNG frame", fixture({ extra: [chunk("fcTL", Buffer.alloc(26))] })],
  ["oversized encoded file", Buffer.concat([transparentPng, Buffer.alloc(65536)])],
];
const overflowingChunk = Buffer.from(transparentPng); overflowingChunk.writeUInt32BE(0xffffffff, 8);
malformed.push(["overflowing chunk length", overflowingChunk]);
for (const [name, png] of malformed) {
  test(`actual-server rejects ${name} without writes, reserved revisions, realtime or Undo invalidation`, { timeout: 2000 }, async t => {
    const s = await setup(t);
    await s.save(transparentPng);
    const { undo } = await s.call("removeWithUndo", { projectId });
    const before = await s.snapshot(), signals = s.harness.realtimeSignals.length;
    const writes = [];
    for (const method of ["set", "delete"]) {
      const original = s.bb.storage.kv[method].bind(s.bb.storage.kv);
      s.bb.storage.kv[method] = async (...args) => { writes.push(args); return original(...args); };
    }
    await assert.rejects(s.save(png));
    assert.deepEqual(writes, []);
    assert.deepEqual(await s.snapshot(), before);
    assert.equal(s.harness.realtimeSignals.length, signals);
    assert.equal((await s.call("restore", { projectId, token: undo.token })).status, "restored");
    assert.deepEqual(await s.read(), transparentPng);
  });
}
test("existing invalid saved assignments are served and Undo-restored without migration", async t => {
  const s = await setup(t);
  const legacy = Buffer.concat([transparentPng.subarray(0, 24), Buffer.alloc(21)]);
  await s.bb.storage.kv.set(`image:${projectId}`, legacy.toString("base64"));
  await s.bb.storage.kv.set("index", { [projectId]: 7 });
  const before = await s.snapshot();
  assert.equal((await s.call("list", null)).projects[0].revision, 7);
  assert.deepEqual(await s.read(), legacy);
  assert.deepEqual(await s.snapshot(), before);
  const { undo } = await s.call("removeWithUndo", { projectId });
  assert.equal((await s.call("restore", { projectId, token: undo.token })).status, "restored");
  assert.deepEqual(await s.read(), legacy);
});
