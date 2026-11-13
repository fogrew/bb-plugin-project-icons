import test from "node:test";
import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import { decodePng } from "./lib/png-validation.ts";
import {
  EXPORT_FORMAT, EXPORT_VERSION, MAX_ICONS, MAX_NAME_CHARS, MAX_PAYLOAD_CHARS, ImportError, buildExport, exportName, parseExport, planApply, stripPngMetadata,
} from "./lib/icon-transfer.ts";
import { opaquePng, transparentPng } from "./test-fixtures/png.mjs";

const ch = (...codes) => String.fromCodePoint(...codes);
const A = "proj_aaaaaaaaaa";
const B = "proj_bbbbbbbbbb";
const image = transparentPng.toString("base64");
const icon = (projectId = A, projectName = "Alpha", data = image) => ({ projectId, projectName, image: data });
const file = (icons, extra = {}) => JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, icons, ...extra });
const parse = text => parseExport(text, decodePng);
const rejects = (text, code) => assert.throws(() => parse(text), error => error instanceof ImportError && error.code === code, `expected ${code}`);

test("round trips icons through the versioned format", () => {
  const text = buildExport([icon(A, "Alpha", image), icon(B, "Beta ✨", opaquePng.toString("base64"))]);
  assert.deepEqual(Object.keys(JSON.parse(text)), ["format", "version", "icons"]);
  const entries = parse(text);
  assert.deepEqual(entries.map(entry => [entry.sourceId, entry.name]), [[A, "Alpha"], [B, "Beta ✨"]]);
  assert.ok(entries[0].bytes.equals(transparentPng));
  assert.ok(entries[1].bytes.equals(opaquePng));
  assert.deepEqual(parse(file([])), []);
});

test("export carries only the icon, its project id and name", () => {
  const entry = JSON.parse(buildExport([icon()])).icons[0];
  assert.deepEqual(Object.keys(entry).sort(), ["image", "projectId", "projectName"]);
});

test("a leading byte order mark is tolerated", () => {
  assert.equal(parse(`${ch(0xfeff)}${file([icon()])}`).length, 1);
});

test("rejects non-text, invalid JSON and other formats", () => {
  for (const value of [undefined, null, 5, {}, ["a"]]) assert.throws(() => parseExport(value, decodePng), ImportError);
  for (const text of ["", "{", "not json", "{'a':1}", "NaN"]) rejects(text, "not-json");
  for (const text of ["null", "[]", "5", '"x"', "{}", JSON.stringify({ format: "other", version: 1, icons: [] }), JSON.stringify({ version: 1, icons: [] })]) {
    rejects(text, "wrong-format");
  }
});

test("rejects unsupported, fractional and non-numeric versions", () => {
  rejects(file([], { version: 2 }), "unsupported-version");
  rejects(file([], { version: 1e300 }), "unsupported-version");
  for (const version of [0, -1, 1.5, "1", null, true, [1], {}]) rejects(file([], { version }), "malformed");
});

test("rejects unknown, missing and reserved keys at every level", () => {
  rejects(file([], { extra: 1 }), "malformed");
  rejects(JSON.stringify({ format: EXPORT_FORMAT, version: 1 }), "malformed");
  rejects(JSON.stringify({ format: EXPORT_FORMAT, version: 1, icons: {} }), "malformed");
  for (const key of ["__proto__", "constructor", "prototype", "toString"]) {
    rejects(`{"format":"${EXPORT_FORMAT}","version":1,"icons":[],"${key}":{"polluted":true}}`, "malformed");
    rejects(`{"${key}":{"polluted":true},"format":"${EXPORT_FORMAT}","version":1,"icons":[]}`, "malformed");
    const entry = JSON.stringify(icon()).slice(0, -1);
    rejects(`{"format":"${EXPORT_FORMAT}","version":1,"icons":[${entry},"${key}":{"polluted":true}}]}`, "malformed");
  }
  for (const missing of ["projectId", "projectName", "image"]) {
    const { [missing]: _removed, ...rest } = icon();
    rejects(file([rest]), "malformed");
  }
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

test("rejects prototype-pollution project ids and non-object entries", () => {
  for (const projectId of ["__proto__", "constructor", "proj___proto__", "PROJ_aaaaaaaaaa", "proj_aaaaaaaaa", `proj_${"a".repeat(33)}`, "proj_aaaaaaaaaa\n", "../proj_aaaaaaaaaa", "", 5, null, [A]]) {
    rejects(file([{ ...icon(), projectId }]), "malformed");
  }
  for (const entry of [null, 5, "x", [], [A, "Alpha", image]]) rejects(file([entry]), "malformed");
  assert.equal(({}).polluted, undefined);
});

test("rejects duplicate project ids anywhere in the file", () => {
  rejects(file([icon(A), icon(B), icon(A, "Other")]), "duplicate");
  rejects(file([icon(A), icon(A)]), "duplicate");
});

test("rejects unsafe or oversized names", () => {
  const unsafe = [0, 10, 0x7f, 0x85, 0x202e, 0x2066, 0x200f, 0x61c, 0x2028, 0x2029, 0xe0041].map(code => `a${ch(code)}b`);
  const lone = [ch(0xd800), `a${ch(0xdfff)}b`, ch(0xdc00, 0xd800), `${ch(0xd800)}x`];
  for (const projectName of ["x".repeat(MAX_NAME_CHARS + 1), ...unsafe, ...lone, 5, null, {}]) {
    rejects(file([icon(A, projectName)]), "malformed");
  }
  assert.equal(parse(file([icon(A, "x".repeat(MAX_NAME_CHARS))])).length, 1);
  assert.equal(parse(file([icon(A, "")])).length, 1);
  assert.equal(parse(file([icon(A, "Δοκιμή 🌲 项目")]))[0].name, "Δοκιμή 🌲 项目");
});

test("rejects corrupt images", () => {
  const flipped = Buffer.from(transparentPng);
  flipped[flipped.length - 20] ^= 0xff;
  const truncated = transparentPng.subarray(0, transparentPng.length - 20);
  const header = Buffer.alloc(45);
  transparentPng.subarray(0, 24).copy(header);
  const bad = [
    "", "AAAA", "not base64!", `${image}=`, image.replace(/=+$/, "").slice(0, -1), `${image}\n`, ` ${image}`,
    flipped.toString("base64"), truncated.toString("base64"), header.toString("base64"),
    Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64"),
    Buffer.from("\xff\xd8\xff\xe0", "latin1").toString("base64"),
    Buffer.alloc(65537).toString("base64"), "A".repeat(87385), "A".repeat(2_000_000),
    5, null,
  ];
  for (const data of bad) rejects(file([icon(A, "Alpha", data)]), "bad-image");
  for (const data of [[image], { data: image }]) rejects(file([icon(A, "Alpha", data)]), "malformed");
});

test("one bad icon fails the whole file", () => {
  assert.throws(() => parse(file([icon(A), icon(B, "Beta", "AAAA")])), error => error.code === "bad-image" && /Icon 2/.test(error.message));
});

test("bounds payload size before parsing", () => {
  let parsed = false;
  const original = JSON.parse;
  JSON.parse = (...args) => { parsed = true; return original(...args); };
  try { rejects("{".repeat(MAX_PAYLOAD_CHARS + 1), "too-large"); rejects(" ".repeat(MAX_PAYLOAD_CHARS + 1), "too-large"); }
  finally { JSON.parse = original; }
  assert.equal(parsed, false);
  rejects(`${" ".repeat(MAX_PAYLOAD_CHARS - 2)}[]`, "wrong-format");
});

test("bounds the icon count before validating entries", () => {
  const entries = `[${Array(MAX_ICONS + 1).fill("{}").join(",")}]`;
  rejects(`{"format":"${EXPORT_FORMAT}","version":1,"icons":${entries}}`, "too-many");
  const huge = `[${Array(2_500_000).fill("0").join(",")}]`;
  assert.ok(huge.length < MAX_PAYLOAD_CHARS);
  rejects(`{"format":"${EXPORT_FORMAT}","version":1,"icons":${huge}}`, "too-many");
  assert.throws(() => buildExport(Array.from({ length: MAX_ICONS + 1 }, () => icon())), error => error.code === "too-many");
});

test("export refuses a file the importer would reject for size", () => {
  const bulky = Array.from({ length: 200 }, (_, number) => icon(`proj_${"a".repeat(9)}${"abcdefghij"[number % 10]}${"abcdefghij"[Math.floor(number / 10) % 10]}`, "Alpha", "A".repeat(87384)));
  assert.throws(() => buildExport(bulky), error => error instanceof ImportError && error.code === "too-large");
});

test("exactly the maximum count is accepted when entries are valid", () => {
  const ids = Array.from({ length: MAX_ICONS }, (_, number) => `proj_${String(number).padStart(10, "a").replace(/\d/g, digit => "abcdefghij"[digit])}`);
  assert.equal(new Set(ids).size, MAX_ICONS);
  assert.equal(parse(file(ids.map(id => icon(id)))).length, MAX_ICONS);
});

test("extremely deep nesting is rejected without crashing", () => {
  for (const depth of [1000, 100000, 1_000_000]) {
    for (const text of ["[".repeat(depth), `${"[".repeat(depth)}${"]".repeat(depth)}`, `{"a":`.repeat(depth)]) {
      assert.throws(() => parse(text), ImportError);
    }
  }
});

test("export names are bounded and stripped of control and bidi characters", () => {
  assert.equal(exportName("Plain"), "Plain");
  assert.equal(exportName(`a${ch(10)}b${ch(0x202e)}c${ch(0)}d`), "a b c d");
  assert.equal(exportName("x".repeat(500)).length, MAX_NAME_CHARS);
  assert.equal(exportName("🌲".repeat(500)).length, MAX_NAME_CHARS);
  assert.equal(exportName(`${ch(0xd800)}ok`), " ok");
  const name = exportName(`a${ch(0x202e)}${"y".repeat(400)}`);
  assert.equal(parse(file([icon(A, name)])).length, 1);
});

const entries = [A, B].map((id, position) => ({ sourceId: id, name: `P${position}`, image, bytes: transparentPng }));
const targets = rows => new Map(Object.entries(rows));
const planFails = (decisions, state, code) => assert.throws(() => planApply(entries, decisions, targets(state)), error => error instanceof ImportError && error.code === code);

test("plans writes only for changed targets and counts identical icons", () => {
  const plan = planApply(entries, [
    { sourceId: A, targetId: "proj_cccccccccc", expectedRevision: null },
    { sourceId: B, targetId: "proj_dddddddddd", expectedRevision: 7 },
  ], targets({ proj_cccccccccc: { revision: null, image: null }, proj_dddddddddd: { revision: 7, image } }));
  assert.deepEqual(plan, { writes: [{ targetId: "proj_cccccccccc", image }], pins: [], unchanged: 1 });
  assert.deepEqual(planApply(entries, [], targets({})), { writes: [], pins: [], unchanged: 0 });
});

test("an identical icon that another plugin still manages is pinned, not rewritten", () => {
  const plan = planApply(entries, [
    { sourceId: A, targetId: "proj_cccccccccc", expectedRevision: 7 },
    { sourceId: B, targetId: "proj_dddddddddd", expectedRevision: 8 },
  ], targets({ proj_cccccccccc: { revision: 7, image, automatic: true }, proj_dddddddddd: { revision: 8, image, automatic: false } }));
  assert.deepEqual(plan, { writes: [], pins: ["proj_cccccccccc"], unchanged: 1 });
});

test("rejects selections that do not match the file", () => {
  const state = { proj_cccccccccc: { revision: null, image: null }, proj_dddddddddd: { revision: null, image: null } };
  planFails([{ sourceId: "proj_zzzzzzzzzz", targetId: "proj_cccccccccc", expectedRevision: null }], state, "bad-selection");
  planFails([{ sourceId: A, targetId: "proj_cccccccccc", expectedRevision: null }, { sourceId: A, targetId: "proj_dddddddddd", expectedRevision: null }], state, "bad-selection");
  planFails([{ sourceId: A, targetId: "proj_cccccccccc", expectedRevision: null }, { sourceId: B, targetId: "proj_cccccccccc", expectedRevision: null }], state, "bad-selection");
  planFails(Array(3).fill({ sourceId: A, targetId: "proj_cccccccccc", expectedRevision: null }), state, "bad-selection");
});

test("replacement needs the revision the user confirmed", () => {
  const state = { proj_cccccccccc: { revision: 9, image: opaquePng.toString("base64") } };
  planFails([{ sourceId: A, targetId: "proj_cccccccccc", expectedRevision: null }], state, "stale");
  planFails([{ sourceId: A, targetId: "proj_cccccccccc", expectedRevision: 8 }], state, "stale");
  planFails([{ sourceId: A, targetId: "proj_missingmiss", expectedRevision: null }], state, "stale");
  planFails([{ sourceId: A, targetId: "proj_cccccccccc", expectedRevision: 9 }, { sourceId: B, targetId: "proj_eeeeeeeeee", expectedRevision: null }], state, "stale");
  assert.equal(planApply(entries, [{ sourceId: A, targetId: "proj_cccccccccc", expectedRevision: 9 }], targets(state)).writes.length, 1);
});

const textChunk = (text) => {
  const body = Buffer.concat([Buffer.from("tEXt"), Buffer.from(text, "latin1")]);
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(body.length - 4);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), body.length + 4);
  return chunk;
};
const withChunks = (png, chunks) => Buffer.concat([png.subarray(0, 33), ...chunks, png.subarray(33)]);

test("metadata chunks are stripped and pixel chunks are kept byte for byte", () => {
  assert.ok(stripPngMetadata(transparentPng).equals(transparentPng));
  const secret = "Source" + ch(0) + "C:/Users/alice/secret/project";
  const noisy = withChunks(transparentPng, [textChunk(secret), textChunk("Comment" + ch(0) + "hello")]);
  assert.ok(decodePng(noisy.toString("base64")));
  assert.ok(noisy.toString("latin1").includes("alice"));
  const clean = stripPngMetadata(noisy);
  assert.ok(clean.equals(transparentPng));
  assert.ok(decodePng(clean.toString("base64")));
});

test("nesting deeper than a valid file is refused before JSON parsing", () => {
  let parsed = false;
  const original = JSON.parse;
  JSON.parse = (...args) => { parsed = true; return original(...args); };
  try {
    const text = "[".repeat(6_000_000) + "]".repeat(6_000_000);
    assert.throws(() => parse(text), error => error instanceof ImportError && error.code === "malformed");
    assert.throws(() => parse(file([{ ...icon(), projectName: ["deep"] }])), error => error.code === "malformed");
  } finally { JSON.parse = original; }
  assert.equal(parsed, false);
  assert.equal(parse(file([icon(A, "Brackets [ { \" ] } in names")])).length, 1);
  assert.equal(parse(file([icon(A, "quote \" [[[[[ { { { {")])).length, 1);
  assert.equal(parse(file([icon(A, "backslash " + String.fromCharCode(92) + " [[[[[")])).length, 1);
});

test("names keep zero-width joiners but refuse invisible direction and tag characters", () => {
  const family = "Team " + ch(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
  assert.equal(parse(file([icon(A, family)]))[0].name, family);
  for (const code of [0x61c, 0x2028, 0x2029, 0xe0001, 0xe007f]) rejects(file([icon(A, "x" + ch(code))]), "malformed");
});
