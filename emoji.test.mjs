import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emojiCatalog, searchEmoji } from "./lib/emoji-catalog.ts";
import { createRecents as createEmojiRecents } from "./lib/emoji-recents.ts";
import { snapshotIcon } from "./lib/image-processing.ts";
import { drawEmoji } from "./lib/emoji-rendering.ts";
const createRecents = (pluginId, storage) => createEmojiRecents(pluginId, emojiCatalog.map(e => e.id), storage);

test("catalog is small, uniquely identified and preserves qualified compound sequences", () => {
  assert.ok(emojiCatalog.length > 0 && emojiCatalog.length <= 96);
  assert.equal(new Set(emojiCatalog.map(e => e.id)).size, emojiCatalog.length);
  assert.ok(readFileSync(new URL("./lib/emoji-catalog.ts", import.meta.url)).length <= 20480);
  for (const value of ["👍🏻", "👍🏼", "👍🏽", "👍🏾", "👍🏿", "👩🏽‍💻", "👨‍👩‍👧‍👦", "🇨🇾", "1️⃣", "#️⃣", "❤️"]) {
    assert.ok(emojiCatalog.some(e => e.value === value), value);
  }
  assert.equal(searchEmoji("  CYPRUS ")[0].value, "🇨🇾");
  assert.equal(searchEmoji("👩🏽‍💻")[0].label, "woman technologist: medium skin tone");
  assert.deepEqual(searchEmoji("missing entry"), []);
});

test("recents persist only known unique IDs with a twelve item MRU bound", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const history = createRecents("test-plugin", () => storage);
  for (const item of emojiCatalog.slice(0, 15)) history.add(item.id);
  history.add(emojiCatalog[5].id);
  history.add("unknown");
  const ids = history.read();
  assert.equal(ids.length, 12);
  assert.equal(ids[0], emojiCatalog[5].id);
  assert.equal(new Set(ids).size, 12);
  assert.deepEqual(createRecents("test-plugin", () => storage).read(), ids);
  assert.deepEqual(createRecents("other-plugin", () => storage).read(), []);
  history.clear();
  assert.deepEqual(history.read(), []);
});

test("corrupt, oversized and inaccessible storage never blocks recents", () => {
  for (const value of ["not json", "null", "{}", '["unknown",1]', " ".repeat(4097)]) {
    assert.deepEqual(createRecents("x", () => ({ getItem: () => value, setItem() {} })).read(), []);
  }
  const history = createRecents("x", () => { throw new Error("blocked"); });
  history.add(emojiCatalog[0].id);
  assert.deepEqual(history.read(), [emojiCatalog[0].id]);
  history.clear();
  assert.deepEqual(history.read(), []);
});

test("snapshot returns the exact preview PNG bytes and rejects invalid or oversized output", () => {
  const base64 = Buffer.from([137, 80, 78, 71, 255]).toString("base64");
  const snapshot = snapshotIcon({ toDataURL: () => `data:image/png;base64,${base64}` });
  assert.equal(snapshot.base64, base64);
  assert.equal(snapshot.url, `data:image/png;base64,${snapshot.base64}`);
  assert.throws(() => snapshotIcon({ toDataURL: () => "data:," }));
  assert.throws(() => snapshotIcon({ toDataURL: () => `data:image/png;base64,${Buffer.alloc(65537).toString("base64")}` }));
});

test("native emoji rendering draws the entire sequence once on a cleared transparent square", () => {
  const calls = [];
  const ctx = {
    clearRect: (...args) => calls.push(["clear", ...args]),
    measureText: () => ({ width: 100, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 100,
      actualBoundingBoxAscent: 40, actualBoundingBoxDescent: 10 }),
    fillText: (...args) => calls.push(["text", ...args]),
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  drawEmoji(canvas, "👩🏽‍💻");
  assert.equal(canvas.width, 64);
  assert.equal(canvas.height, 64);
  assert.equal(calls.filter(c => c[0] === "text").length, 1);
  assert.equal(calls[1][1], "👩🏽‍💻");
  assert.deepEqual(calls[0], ["clear", 0, 0, 64, 64]);
  assert.match(ctx.font, /Segoe UI Emoji/);
  assert.throws(() => drawEmoji({ getContext: () => null }, "😀"));
});
