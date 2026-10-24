import test from "node:test";
import assert from "node:assert/strict";
import { imageRect, drawIcon, encodeIcon, decodeImage } from "./lib/image-processing.ts";
import { createDraft } from "./lib/image-draft.ts";

const fit = { mode: "fit", zoom: 1, x: 0, y: 0 };
test("PNG export preserves exact bytes and enforces the 64 KiB limit", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 0, 255]);
  const canvas = { toBlob: (done, type) => done(new Blob([bytes], { type })) };
  assert.equal(await encodeIcon(canvas), Buffer.from(bytes).toString("base64"));
  await assert.rejects(encodeIcon({ toBlob: (done) => done(null) }));
  await assert.rejects(encodeIcon({ toBlob: (done) => done(new Blob([new Uint8Array(65537)], { type: "image/png" })) }));
  await assert.rejects(decodeImage({ type: "image/svg+xml", size: 10 }));
  await assert.rejects(decodeImage({ type: "image/png", size: 2000001 }));
});
test("wide and tall fit/fill preserve proportions and center the image", () => {
  assert.deepEqual(imageRect(200, 100, fit), { x: 0, y: 16, width: 64, height: 32 });
  assert.deepEqual(imageRect(100, 200, fit), { x: 16, y: 0, width: 32, height: 64 });
  assert.deepEqual(imageRect(200, 100, { ...fit, mode: "fill" }), { x: -32, y: 0, width: 128, height: 64 });
  assert.deepEqual(imageRect(100, 200, { ...fit, mode: "fill" }), { x: 0, y: -32, width: 64, height: 128 });
});
test("zoom and offsets use output pixels without stretching non-square inputs", () => {
  assert.deepEqual(imageRect(300, 200, { ...fit, zoom: 1.5, x: 10, y: -8 }),
    { x: -6, y: -8, width: 96, height: 64 });
  assert.throws(() => imageRect(0, 20, fit));
  assert.throws(() => imageRect(20, 20, { ...fit, zoom: NaN }));
});
test("transparent canvas is cleared, with no background fill or image distortion", () => {
  const calls = [];
  const canvas = { width: 0, height: 0, getContext: () => ({
    clearRect: (...args) => calls.push(["clear", ...args]),
    drawImage: (...args) => calls.push(["draw", ...args]),
  }) };
  const source = { width: 80, height: 40 };
  drawIcon(canvas, source, fit);
  assert.equal(canvas.width, 64);
  assert.equal(canvas.height, 64);
  assert.deepEqual(calls, [["clear", 0, 0, 64, 64], ["draw", source, 0, 16, 64, 32]]);
});
test("cancel and project invalidation dispose decoded resources and reject late work", async () => {
  let resolve;
  let selected = "a";
  let closed = 0;
  const draft = createDraft("a", () => selected);
  const pending = draft.load(() => new Promise((done) => { resolve = done; }));
  selected = "b";
  draft.cancel();
  selected = "a";
  resolve({ close: () => closed++ });
  assert.equal(await pending, false);
  assert.equal(draft.current(), null);
  assert.equal(closed, 1);
});
test("newer uploads win; ownership is rechecked at save time", async () => {
  let resolve;
  let selected = "a";
  const disposed = [];
  const draft = createDraft("a", () => selected);
  const old = draft.load(() => new Promise((done) => { resolve = done; }));
  const latest = { close: () => disposed.push("latest") };
  await draft.load(async () => latest);
  resolve({ close: () => disposed.push("old") });
  await old;
  assert.equal(draft.current(), latest);
  assert.deepEqual(disposed, ["old"]);
  selected = "b";
  assert.equal(draft.current(), null);
  draft.cancel();
  assert.deepEqual(disposed, ["old", "latest"]);
});
