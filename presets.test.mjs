import test from "node:test";
import assert from "node:assert/strict";
import { explicitInitials, projectInitials, palette, contrast, foreground, glyphs, searchGlyphs } from "./lib/icon-presets.ts";
import { createColorRecents as colorRecents } from "./lib/color-recents.ts";
const createColorRecents = (pluginId, storage) => colorRecents(pluginId, palette.map(p => p.id), storage);

test("project defaults preserve graphemes and Unicode word boundaries", () => {
  for (const [name, expected] of [
    ["Привет мир", "Пм"], ["  e\u0301lan voyage", "e\u0301v"], ["𐐀lpha beta", "𐐀b"],
    ["👩🏽‍💻 workspace", "👩🏽‍💻w"], ["#️⃣ Project", "#️⃣P"], ["東京", "東京"], ["one", "on"], [" --- ", "?"],
  ]) assert.equal(projectInitials(name), expected, name);
});
test("explicit input rejects excess clusters, unbounded input and controls without slicing", () => {
  assert.equal(explicitInitials("e\u0301Я"), "e\u0301Я");
  assert.equal(explicitInitials("👨‍👩‍👧‍👦🇨🇾"), "👨‍👩‍👧‍👦🇨🇾");
  for (const value of ["", "abc", "a".repeat(129), "a\nb", "\u202eA", "\ud800"]) {
    assert.throws(() => explicitInitials(value), undefined, value);
  }
});
test("every bounded palette background has deterministic readable foreground", () => {
  assert.equal(new Set(palette.map(p => p.id)).size, palette.length);
  for (const color of palette) {
    assert.match(color.background, /^#[0-9a-f]{6}$/);
    assert.ok(contrast(color.background, foreground(color.background)) >= 4.5, color.id);
    assert.ok(["#000000", "#ffffff"].includes(foreground(color.background)));
  }
});
test("local glyph search is bounded, case insensitive and includes descriptive keywords", () => {
  assert.ok(glyphs.length >= 6 && glyphs.length <= 24);
  assert.equal(new Set(glyphs.map(g => g.id)).size, glyphs.length);
  assert.equal(searchGlyphs("  DIRECTORY ")[0].id, "folder");
  assert.equal(searchGlyphs("STAR")[0].id, "star");
  assert.deepEqual(searchGlyphs("<svg>"), []);
});
test("color recents are separate known IDs with bounded MRU and safe storage failure", () => {
  const values = new Map([["test:emoji-recents:v1", '["rocket"]']]);
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  const history = createColorRecents("test", () => storage);
  for (const color of palette) history.add(color.id);
  history.add(palette[0].id); history.add("unknown");
  assert.equal(history.read().length, 6);
  assert.equal(history.read()[0], palette[0].id);
  assert.equal(values.get("test:emoji-recents:v1"), '["rocket"]');
  assert.deepEqual(createColorRecents("other", () => storage).read(), []);
  for (const raw of ["null", "{}", "oops", '["unknown",1]', " ".repeat(4097)]) {
    values.set("test:color-recents:v1", raw);
    assert.deepEqual(history.read(), []);
  }
  const blocked = createColorRecents("test", () => {throw Error("blocked");});
  blocked.add(palette[0].id);
  assert.deepEqual(blocked.read(), [palette[0].id]);
  blocked.clear(); assert.deepEqual(blocked.read(), []);
});
