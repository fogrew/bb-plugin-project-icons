import test from "node:test";
import assert from "node:assert/strict";
import { imageRect, offsetBounds, clampCrop, drawIcon, encodeIcon, decodeImage } from "./lib/image-processing.ts";
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
  assert.deepEqual(imageRect(300, 200, { ...fit, zoom: 3, x: 10, y: -8 }),
    { x: -54, y: -40, width: 192, height: 128 });
  assert.throws(() => imageRect(0, 20, fit));
  assert.throws(() => imageRect(20, 20, { ...fit, zoom: NaN }));
});
test("wide and tall Fill crops reach both source edges at every zoom", () => {
  for (const [width, height, axis] of [[4000, 100, "x"], [100, 4000, "y"]]) {
    for (const zoom of [1, 1.35, 4]) {
      const crop = { ...fit, mode: "fill", zoom };
      const bounds = offsetBounds(width, height, crop);
      assert.ok(bounds[axis] > 64);
      const first = imageRect(width, height, { ...crop, [axis]: bounds[axis] });
      const last = imageRect(width, height, { ...crop, [axis]: -bounds[axis] });
      assert.equal(first[axis], 0);
      const size = axis === "x" ? "width" : "height";
      assert.equal(last[axis] + last[size], 64);
    }
  }
});
test("offsets clamp when mode, zoom or source dimensions shrink the range", () => {
  const crop = { ...fit, mode: "fill", zoom: 4, x: 5000, y: -5000 };
  assert.deepEqual(clampCrop(4000, 100, crop), { ...crop, x: 5000, y: -96 });
  assert.deepEqual(clampCrop(4000, 100, { ...crop, zoom: 1 }), { ...crop, zoom: 1, x: 1248, y: 0 });
  assert.deepEqual(clampCrop(4000, 100, { ...crop, mode: "fit", zoom: 1 }),
    { ...fit, x: 0, y: -31.2 });
  assert.deepEqual(clampCrop(100, 100, { ...crop, zoom: 1 }), { ...crop, zoom: 1, x: 0, y: 0 });
  assert.deepEqual(imageRect(100, 100, crop), { x: 0, y: -192, width: 256, height: 256 });
});
test("fractional edge bounds remain reachable and invalid geometry cannot yield infinite ranges", () => {
  const crop = { ...fit, mode: "fill", zoom: 1.35 };
  const bounds = offsetBounds(1234, 321, crop);
  assert.ok(Number.isFinite(bounds.x) && Number.isFinite(bounds.y));
  assert.equal(imageRect(1234, 321, { ...crop, x: bounds.x }).x, 0);
  for (const [width, height] of [[Infinity, 1], [1, 0], [Number.MAX_VALUE, Number.MIN_VALUE]]) {
    assert.throws(() => offsetBounds(width, height, crop));
  }
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
