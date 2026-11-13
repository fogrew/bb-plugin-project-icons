import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { MAX_ICONS, MAX_PAYLOAD_CHARS, buildExport } from "./lib/icon-transfer.ts";
import { crc32 } from "node:zlib";
import { readFile } from "node:fs/promises";
import { opaquePng, transparentPng } from "./test-fixtures/png.mjs";
import { A, B, setup } from "./test-fixtures/peer-host.mjs";

const C = "proj_cccccccccc";
const D = "proj_dddddddddd";
const E = "proj_eeeeeeeeee";
const plugin = { experimental_caller: { kind: "plugin", pluginId: "other" } };
const b64 = bytes => bytes.toString("base64");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const file = icons => buildExport(icons.map(([projectId, projectName, bytes]) => ({ projectId, projectName, image: b64(bytes) })));

async function host(projects, icons = {}) {
  const fixture = setup({ projects });
  for (const [id, bytes] of Object.entries(icons)) await fixture.call("save", { projectId: id, base64: b64(bytes) });
  return fixture;
}
const snapshot = async bb => Object.fromEntries(await Promise.all((await bb.storage.kv.list()).map(async key => [key, await bb.storage.kv.get(key)])));
const stable = async bb => { const { revisionHighwater: _ignored, ...rest } = await snapshot(bb); return rest; };
function instrument(bb, { failAt = null, failFrom = null } = {}) {
  const log = [];
  let calls = 0;
  for (const method of ["set", "delete"]) {
    const original = bb.storage.kv[method].bind(bb.storage.kv);
    bb.storage.kv[method] = async (...args) => {
      calls += 1;
      log.push([method, args[0]]);
      if (calls === failAt || (failFrom !== null && calls >= failFrom)) throw new Error("injected storage failure");
      return original(...args);
    };
  }
  return { log, reset: () => { calls = 0; log.length = 0; } };
}
const icon = async (fixture, id) => {
  const response = await fixture.harness.behavior.fetchHttp("GET", `/icon?projectId=${id}`);
  return response.status === 200 ? Buffer.from(await response.arrayBuffer()) : null;
};
const decide = (sourceId, targetId, expectedRevision = null) => ({ sourceId, targetId, expectedRevision });

test("export lists only projects with icons and only the documented fields", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }, { id: B, name: "Beta" }, { id: C, name: "No icon" }], { [A]: transparentPng, [B]: opaquePng });
  const result = await fixture.call("exportIcons", null);
  assert.equal(result.status, "ok");
  assert.deepEqual([result.count, result.skipped], [2, 0]);
  const parsed = JSON.parse(result.json);
  assert.deepEqual(Object.keys(parsed), ["format", "version", "icons"]);
  assert.deepEqual(parsed.icons.map(entry => Object.keys(entry).join()), Array(2).fill("projectId,projectName,image"));
  assert.deepEqual(parsed.icons.map(entry => [entry.projectId, entry.projectName]), [[A, "Alpha"], [B, "Beta"]]);
  assert.doesNotMatch(result.json, /\/repo\/|host_1|src_|\\\\|[A-Za-z]:\\|token|secret|password/i);
  await fixture.dispose();
});

test("export sanitises names, drops orphans and counts unreadable icons", async () => {
  const projects = [{ id: A, name: `Evil\u202e\nname ${"x".repeat(400)}` }, { id: B, name: "Beta" }, { id: C, name: "Gamma" }];
  const fixture = await host(projects, { [A]: transparentPng, [B]: opaquePng, [C]: transparentPng });
  await fixture.bb.storage.kv.set(`image:${B}`, "AAAA");
  projects.pop();
  const result = await fixture.call("exportIcons", null);
  assert.deepEqual([result.status, result.count, result.skipped], ["ok", 1, 1]);
  const [entry] = JSON.parse(result.json).icons;
  assert.equal(entry.projectId, A);
  assert.doesNotMatch(entry.projectName, /[\u202e\n]/);
  assert.ok(entry.projectName.length <= 200);
  const preview = await fixture.call("importPreview", { payload: result.json });
  assert.equal(preview.status, "ok");
  await fixture.dispose();
});

test("export refuses more icons than an import accepts", async () => {
  const projects = Array.from({ length: MAX_ICONS + 1 }, (_, number) => ({ id: `proj_${String(number).padStart(10, "0")}`, name: `P${number}` }));
  const fixture = setup({ projects });
  const index = {};
  for (const { id } of projects) { index[id] = 1; await fixture.bb.storage.kv.set(`image:${id}`, b64(transparentPng)); }
  await fixture.bb.storage.kv.set("index", index);
  const result = await fixture.call("exportIcons", null);
  assert.deepEqual([result.status, result.code], ["rejected", "too-many"]);
  await fixture.dispose();
});

test("export, preview and import are unavailable to other plugins", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }], { [A]: transparentPng });
  const payload = file([[A, "Alpha", transparentPng]]);
  const before = await snapshot(fixture.bb);
  await assert.rejects(fixture.call("exportIcons", null, plugin), /Not available to other plugins/);
  await assert.rejects(fixture.call("importPreview", { payload }, plugin), /Not available to other plugins/);
  await assert.rejects(fixture.call("importApply", { payload, decisions: [decide(A, A, 1)] }, plugin), /Not available to other plugins/);
  assert.deepEqual(await snapshot(fixture.bb), before);
  await fixture.dispose();
});

test("round trip across servers never maps by name until the user chooses", async () => {
  const source = await host([{ id: A, name: "Alpha" }, { id: B, name: "Beta" }], { [A]: transparentPng, [B]: opaquePng });
  const { json } = await source.call("exportIcons", null);
  const target = await host([{ id: C, name: "Alpha" }, { id: D, name: "Beta" }, { id: E, name: "Beta" }]);
  const writes = instrument(target.bb);
  const signals = target.harness.realtimeSignals.length;
  const preview = await target.call("importPreview", { payload: json });
  assert.equal(preview.status, "ok");
  assert.deepEqual(preview.entries.map(entry => [entry.sourceId, entry.name, entry.target]), [[A, "Alpha", null], [B, "Beta", null]]);
  assert.deepEqual(preview.projects.map(row => [row.id, row.name, row.revision, row.hash]), [[C, "Alpha", null, null], [D, "Beta", null, null], [E, "Beta", null, null]]);
  assert.equal(preview.entries[0].hash, sha(transparentPng));
  assert.equal(preview.entries[0].image, b64(transparentPng));
  assert.deepEqual(await target.call("importApply", { payload: json, decisions: [] }), { status: "imported", imported: 0, pinned: 0, unchanged: 0 });
  assert.deepEqual(writes.log, []);
  assert.equal(target.harness.realtimeSignals.length, signals);
  assert.equal(await icon(target, C), null);

  const result = await target.call("importApply", { payload: json, decisions: [decide(A, C), decide(B, E)] });
  assert.deepEqual(result, { status: "imported", imported: 2, pinned: 0, unchanged: 0 });
  assert.ok((await icon(target, C)).equals(transparentPng));
  assert.ok((await icon(target, E)).equals(opaquePng));
  assert.equal(await icon(target, D), null);
  const rows = (await target.call("list", null)).projects;
  assert.deepEqual(rows.map(row => [row.id, row.revision !== null, row.automatic, row.source]), [[C, true, false, null], [D, false, true, null], [E, true, false, null]]);
  assert.ok(rows[0].revision !== rows[2].revision);
  assert.equal(target.harness.realtimeSignals.length, signals + 1);
  assert.deepEqual(await target.bb.storage.kv.get("adoption"), { [C]: { mode: "manual" }, [E]: { mode: "manual" } });
  const index = await target.bb.storage.kv.get("index");
  assert.ok(Math.max(...Object.values(index)) <= await target.bb.storage.kv.get("revisionHighwater"));
  await source.dispose();
  await target.dispose();
});

test("same-server restore maps by project id and the icons become manual", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }, { id: B, name: "Beta" }], { [A]: transparentPng, [B]: opaquePng });
  const { json } = await fixture.call("exportIcons", null);
  await fixture.call("remove", { projectId: A });
  await fixture.call("remove", { projectId: B });
  const preview = await fixture.call("importPreview", { payload: json });
  assert.deepEqual(preview.entries.map(entry => entry.target), [A, B]);
  const applied = await fixture.call("importApply", { payload: json, decisions: [decide(A, A), decide(B, B)] });
  assert.equal(applied.imported, 2);
  assert.ok((await icon(fixture, A)).equals(transparentPng));
  const { revision } = await fixture.row(A);
  const candidate = { projectId: A, peer: "homepage", hash: "a".repeat(64), revision };
  assert.deepEqual(await fixture.adopt(candidate), { status: "skipped", reason: "manual" });
  assert.deepEqual(await fixture.scan(), { status: "ok", candidates: [] });
  await fixture.dispose();
});

test("automatic adoption still works for projects that were not imported", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }, { id: B, name: "Beta" }]);
  const result = await fixture.adopt({ projectId: B, peer: "homepage", hash: "a".repeat(64), revision: null });
  assert.equal(result.status, "adopted");
  await fixture.dispose();
});

test("replacing an icon needs the revision shown in the preview", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }], { [A]: transparentPng });
  const payload = file([[A, "Alpha", opaquePng]]);
  const preview = await fixture.call("importPreview", { payload });
  const [row] = preview.projects;
  assert.equal(row.hash, sha(transparentPng));
  assert.notEqual(row.hash, preview.entries[0].hash);
  const before = await snapshot(fixture.bb);
  const writes = instrument(fixture.bb);
  const signals = fixture.harness.realtimeSignals.length;
  for (const expectedRevision of [null, row.revision - 1, row.revision + 1]) {
    const refused = await fixture.call("importApply", { payload, decisions: [decide(A, A, expectedRevision)] });
    assert.deepEqual([refused.status, refused.code], ["rejected", "stale"]);
  }
  assert.deepEqual(writes.log, []);
  assert.deepEqual(await snapshot(fixture.bb), before);
  assert.equal(fixture.harness.realtimeSignals.length, signals);
  const applied = await fixture.call("importApply", { payload, decisions: [decide(A, A, row.revision)] });
  assert.deepEqual(applied, { status: "imported", imported: 1, pinned: 0, unchanged: 0 });
  assert.ok((await icon(fixture, A)).equals(opaquePng));
  assert.ok((await fixture.row(A)).revision > row.revision);
  await fixture.dispose();
});

test("importing an identical icon changes nothing", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }], { [A]: transparentPng });
  const payload = file([[A, "Alpha", transparentPng]]);
  const { projects: [row], entries: [entry] } = await fixture.call("importPreview", { payload });
  assert.equal(row.hash, entry.hash);
  const before = await snapshot(fixture.bb);
  const writes = instrument(fixture.bb);
  assert.deepEqual(await fixture.call("importApply", { payload, decisions: [decide(A, A, row.revision)] }), { status: "imported", imported: 0, pinned: 0, unchanged: 1 });
  assert.deepEqual(writes.log, []);
  assert.deepEqual(await snapshot(fixture.bb), before);
  await fixture.dispose();
});

test("an auto-adopted icon replaced by an import turns manual", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }]);
  assert.equal((await fixture.adopt({ projectId: A, peer: "homepage", hash: "a".repeat(64), revision: null })).status, "adopted");
  const adopted = await fixture.row(A);
  assert.equal(adopted.source.pluginId, "homepage");
  const payload = file([[A, "Alpha", opaquePng]]);
  await fixture.call("importApply", { payload, decisions: [decide(A, A, adopted.revision)] });
  assert.equal((await fixture.row(A)).source, null);
  assert.equal((await fixture.adopt({ projectId: A, peer: "homepage", hash: "b".repeat(64), revision: (await fixture.row(A)).revision })).reason, "manual");
  await fixture.dispose();
});

test("a pending Undo offer cannot restore over an imported icon", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }], { [A]: transparentPng });
  const { undo } = await fixture.call("removeWithUndo", { projectId: A });
  await fixture.call("importApply", { payload: file([[A, "Alpha", opaquePng]]), decisions: [decide(A, A)] });
  assert.equal((await fixture.call("restore", { projectId: A, token: undo.token })).status, "conflict");
  assert.ok((await icon(fixture, A)).equals(opaquePng));
  await fixture.dispose();
});

test("projects or icons that changed since the preview refuse the whole import", async () => {
  const projects = [{ id: A, name: "Alpha" }, { id: B, name: "Beta" }];
  const fixture = await host(projects, { [B]: transparentPng });
  const payload = file([[A, "Alpha", opaquePng], [B, "Beta", opaquePng]]);
  const { projects: rows } = await fixture.call("importPreview", { payload });
  const decisions = [decide(A, A, null), decide(B, B, rows[1].revision)];
  await fixture.call("save", { projectId: B, base64: b64(opaquePng) });
  const before = await snapshot(fixture.bb);
  const writes = instrument(fixture.bb);
  assert.equal((await fixture.call("importApply", { payload, decisions })).code, "stale");
  projects.shift();
  assert.equal((await fixture.call("importApply", { payload, decisions: [decide(A, A, null)] })).code, "stale");
  assert.deepEqual(writes.log, []);
  assert.deepEqual(await snapshot(fixture.bb), before);
  await fixture.dispose();
});

test("malformed selections are refused before any write", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }, { id: B, name: "Beta" }]);
  const payload = file([[A, "Alpha", transparentPng], [B, "Beta", opaquePng]]);
  const before = await snapshot(fixture.bb);
  const writes = instrument(fixture.bb);
  for (const decisions of [
    [decide(A, A), decide(B, A)],
    [decide(A, A), decide(A, B)],
    [decide(C, A)],
    [decide(A, A), decide(B, B), decide(A, A)],
  ]) {
    const result = await fixture.call("importApply", { payload, decisions });
    assert.deepEqual([result.status, result.code], ["rejected", "bad-selection"]);
  }
  assert.deepEqual(writes.log, []);
  assert.deepEqual(await snapshot(fixture.bb), before);
  await fixture.dispose();
});

test("selections with hostile shapes fail schema validation", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }]);
  const payload = file([[A, "Alpha", transparentPng]]);
  const valid = decide(A, A);
  const bad = [
    { ...valid, targetId: "__proto__" }, { ...valid, targetId: "constructor" }, { ...valid, targetId: "proj_AAAAAAAAAA" },
    { ...valid, expectedRevision: -1 }, { ...valid, expectedRevision: 1.5 }, { ...valid, expectedRevision: "1" },
    { ...valid, extra: true }, JSON.parse('{"sourceId":"proj_aaaaaaaaaa","targetId":"proj_aaaaaaaaaa","expectedRevision":null,"__proto__":{"x":1}}'),
  ];
  for (const decision of bad) await assert.rejects(fixture.call("importApply", { payload, decisions: [decision] }));
  await assert.rejects(fixture.call("importApply", { payload, decisions: Array(MAX_ICONS + 1).fill(valid) }));
  await assert.rejects(fixture.call("importApply", { payload, decisions: [valid], extra: 1 }));
  await assert.rejects(fixture.call("importApply", { payload, decisions: "all" }));
  await assert.rejects(fixture.call("importPreview", { payload, extra: 1 }));
  assert.equal(Object.prototype.x, undefined);
  await fixture.dispose();
});

test("corrupt, oversized and hostile files are rejected without side effects", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }], { [A]: transparentPng });
  const before = await snapshot(fixture.bb);
  const writes = instrument(fixture.bb);
  const signals = fixture.harness.realtimeSignals.length;
  const flipped = Buffer.from(transparentPng);
  flipped[flipped.length - 20] ^= 0xff;
  const icons = (...entries) => JSON.stringify({ format: "bb-project-icons", version: 1, icons: entries });
  const entry = { projectId: A, projectName: "Alpha", image: b64(transparentPng) };
  const cases = [
    ["not-json", "{"], ["not-json", ""], ["wrong-format", "[]"], ["wrong-format", JSON.stringify({ format: "x", version: 1, icons: [] })],
    ["unsupported-version", JSON.stringify({ format: "bb-project-icons", version: 99, icons: [] })],
    ["malformed", `{"format":"bb-project-icons","version":1,"icons":[],"__proto__":{"polluted":true}}`],
    ["malformed", icons({ ...entry, projectId: "__proto__" })],
    ["malformed", icons({ ...entry, path: "C:\\secret" })],
    ["duplicate", icons(entry, entry)],
    ["bad-image", icons({ ...entry, image: b64(flipped) })],
    ["bad-image", icons({ ...entry, image: b64(transparentPng.subarray(0, 100)) })],
    ["bad-image", icons({ ...entry, image: "A".repeat(87385) })],
    ["too-many", `{"format":"bb-project-icons","version":1,"icons":[${Array(MAX_ICONS + 1).fill("{}").join(",")}]}`],
  ];
  for (const [code, payload] of cases) {
    const preview = await fixture.call("importPreview", { payload });
    assert.deepEqual([preview.status, preview.code], ["rejected", code], `preview ${code}`);
    const applied = await fixture.call("importApply", { payload, decisions: [] });
    assert.deepEqual([applied.status, applied.code], ["rejected", code], `apply ${code}`);
  }
  await assert.rejects(fixture.call("importPreview", { payload: " ".repeat(MAX_PAYLOAD_CHARS + 1) }));
  await assert.rejects(fixture.call("importApply", { payload: " ".repeat(MAX_PAYLOAD_CHARS + 1), decisions: [] }));
  await assert.rejects(fixture.call("importPreview", { payload: 5 }));
  assert.equal(Object.prototype.polluted, undefined);
  assert.deepEqual(writes.log, []);
  assert.deepEqual(await snapshot(fixture.bb), before);
  assert.equal(fixture.harness.realtimeSignals.length, signals);
  await fixture.dispose();
});

test("previewing and abandoning an import leaves storage untouched", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }, { id: B, name: "Beta" }], { [A]: transparentPng });
  const payload = file([[A, "Alpha", opaquePng], [B, "Beta", opaquePng]]);
  const before = await snapshot(fixture.bb);
  const writes = instrument(fixture.bb);
  const signals = fixture.harness.realtimeSignals.length;
  await fixture.call("importPreview", { payload });
  await fixture.call("importPreview", { payload });
  assert.deepEqual(writes.log, []);
  assert.deepEqual(await snapshot(fixture.bb), before);
  assert.equal(fixture.harness.realtimeSignals.length, signals);
  await fixture.dispose();
});

const failureScenario = async (inject) => {
  const projects = [{ id: A, name: "Alpha" }, { id: B, name: "Beta" }, { id: C, name: "Gamma" }];
  const fixture = await host(projects, { [A]: transparentPng });
  const payload = file([[A, "Alpha", opaquePng], [B, "Beta", opaquePng], [C, "Gamma", transparentPng]]);
  const { projects: rows } = await fixture.call("importPreview", { payload });
  const decisions = [decide(A, A, rows[0].revision), decide(B, B), decide(C, C)];
  return { fixture, payload, decisions, before: await stable(fixture.bb), signals: fixture.harness.realtimeSignals.length, writes: instrument(fixture.bb, inject) };
};

test("a failed write at any step rolls the whole import back", async () => {
  const dry = await failureScenario({});
  dry.writes.reset();
  assert.equal((await dry.fixture.call("importApply", { payload: dry.payload, decisions: dry.decisions })).imported, 3);
  const total = dry.writes.log.length;
  assert.deepEqual(dry.writes.log.map(([, key]) => key), ["revisionHighwater", `image:${A}`, `image:${B}`, `image:${C}`, "adoption", "index"]);
  assert.ok(total >= 6, `expected several writes, saw ${total}`);
  await dry.fixture.dispose();
  for (let step = 1; step <= total; step += 1) {
    const run = await failureScenario({ failAt: step });
    run.writes.reset();
    const result = await run.fixture.call("importApply", { payload: run.payload, decisions: run.decisions });
    assert.deepEqual(result, { status: "failed", rolledBack: true }, `step ${step}`);
    assert.deepEqual(await stable(run.fixture.bb), run.before, `state after failure at step ${step}`);
    assert.equal(run.fixture.harness.realtimeSignals.length, run.signals);
    assert.ok((await icon(run.fixture, A)).equals(transparentPng));
    assert.equal(await icon(run.fixture, B), null);
    const rows = (await run.fixture.call("list", null)).projects;
    assert.deepEqual(rows.map(row => [row.revision !== null, row.automatic]), [[true, false], [false, true], [false, true]]);
    const retried = await run.fixture.call("importApply", { payload: run.payload, decisions: run.decisions.map((decision, position) => position === 0 ? { ...decision, expectedRevision: rows[0].revision } : decision) });
    assert.equal(retried.imported, 3, `retry after step ${step}`);
    await run.fixture.dispose();
  }
});

test("a rollback that cannot complete is reported as such", async () => {
  const run = await failureScenario({ failFrom: 4 });
  run.writes.reset();
  const result = await run.fixture.call("importApply", { payload: run.payload, decisions: run.decisions });
  assert.deepEqual(result, { status: "failed", rolledBack: false });
  assert.equal(run.fixture.harness.realtimeSignals.length, run.signals);
  await run.fixture.dispose();
});

test("a storage read failure before any write leaves everything untouched", async () => {
  const run = await failureScenario({});
  const original = run.fixture.bb.storage.kv.get.bind(run.fixture.bb.storage.kv);
  run.fixture.bb.storage.kv.get = async key => { if (key === "adoption") throw new Error("injected read failure"); return original(key); };
  run.writes.reset();
  await assert.rejects(run.fixture.call("importApply", { payload: run.payload, decisions: run.decisions }));
  run.fixture.bb.storage.kv.get = original;
  assert.deepEqual(run.writes.log, []);
  assert.deepEqual(await stable(run.fixture.bb), run.before);
  await run.fixture.dispose();
});

test("concurrent imports and saves serialize without losing icons", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }, { id: B, name: "Beta" }, { id: C, name: "Gamma" }]);
  const payload = file([[A, "Alpha", opaquePng], [B, "Beta", opaquePng]]);
  const results = await Promise.all([
    fixture.call("importApply", { payload, decisions: [decide(A, A), decide(B, B)] }),
    fixture.call("save", { projectId: C, base64: b64(transparentPng) }),
    fixture.call("importApply", { payload, decisions: [decide(A, A), decide(B, B)] }),
  ]);
  assert.deepEqual([results[0].status, results[2].status, results[2].code], ["imported", "rejected", "stale"]);
  const rows = (await fixture.call("list", null)).projects;
  assert.ok(rows.every(row => row.revision !== null));
  assert.equal(new Set(rows.map(row => row.revision)).size, 3);
  await fixture.dispose();
});

const withText = (png, text) => {
  const body = Buffer.concat([Buffer.from("tEXt"), Buffer.from(text, "latin1")]);
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(body.length - 4);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), body.length + 4);
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
};

test("preview reports whether another plugin still manages a project's icon", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }, { id: B, name: "Beta" }, { id: C, name: "Gamma" }], { [B]: transparentPng });
  await fixture.adopt({ projectId: A, peer: "homepage", hash: "a".repeat(64), revision: null });
  const preview = await fixture.call("importPreview", { payload: file([[A, "Alpha", opaquePng]]) });
  assert.deepEqual(preview.projects.map(row => [row.id, row.revision !== null, row.automatic]), [[A, true, true], [B, true, false], [C, false, true]]);
  await fixture.dispose();
});

test("importing the icon another plugin already supplied keeps it as manual without rewriting it", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }]);
  await fixture.adopt({ projectId: A, peer: "homepage", hash: "a".repeat(64), revision: null });
  const adopted = await fixture.row(A);
  const payload = file([[A, "Alpha", transparentPng]]);
  const writes = instrument(fixture.bb);
  const index = await fixture.bb.storage.kv.get("index");
  const result = await fixture.call("importApply", { payload, decisions: [decide(A, A, adopted.revision)] });
  assert.deepEqual(result, { status: "imported", imported: 0, pinned: 1, unchanged: 0 });
  assert.deepEqual(writes.log, [["set", "adoption"]]);
  assert.deepEqual(await fixture.bb.storage.kv.get("index"), index);
  const after = await fixture.row(A);
  assert.deepEqual([after.revision, after.source, after.automatic], [adopted.revision, null, false]);
  assert.equal((await fixture.adopt({ projectId: A, peer: "homepage", hash: "b".repeat(64), revision: after.revision })).reason, "manual");
  await fixture.dispose();
});

test("a failed pin is rolled back", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }]);
  await fixture.adopt({ projectId: A, peer: "homepage", hash: "a".repeat(64), revision: null });
  const { revision } = await fixture.row(A);
  const before = await snapshot(fixture.bb);
  instrument(fixture.bb, { failAt: 1 });
  const result = await fixture.call("importApply", { payload: file([[A, "Alpha", transparentPng]]), decisions: [decide(A, A, revision)] });
  assert.deepEqual(result, { status: "failed", rolledBack: true });
  assert.deepEqual(await snapshot(fixture.bb), before);
  await fixture.dispose();
});

test("export drops PNG metadata that could carry local paths, and the result still imports", async () => {
  const secret = "Source" + String.fromCharCode(0) + "C:/Users/alice/secret/project";
  const noisy = withText(transparentPng, secret);
  const fixture = await host([{ id: A, name: "Alpha" }], { [A]: noisy });
  assert.ok((await icon(fixture, A)).toString("latin1").includes("alice"));
  const { json, count } = await fixture.call("exportIcons", null);
  assert.equal(count, 1);
  assert.ok(!json.includes("alice"));
  const [entry] = JSON.parse(json).icons;
  assert.ok(Buffer.from(entry.image, "base64").equals(transparentPng));
  const preview = await fixture.call("importPreview", { payload: json });
  assert.equal(preview.status, "ok");
  await fixture.dispose();
});

test("the built settings app mounts the export and import controls", async () => {
  const bundle = await readFile(new URL("./dist/app.js", import.meta.url), "utf8");
  for (const text of ["Export and import", "Export icons", "Import icons from a file", "Import preview"]) assert.ok(bundle.includes(text), text);
});

test("a failing change notification does not fail a committed import", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }]);
  fixture.bb.realtime.publish = () => { throw new Error("injected publish failure"); };
  const result = await fixture.call("importApply", { payload: file([[A, "Alpha", opaquePng]]), decisions: [decide(A, A)] });
  assert.deepEqual(result, { status: "imported", imported: 1, pinned: 0, unchanged: 0 });
  assert.ok((await icon(fixture, A)).equals(opaquePng));
  await fixture.dispose();
});

test("an exhausted revision counter refuses the import before any write", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }, { id: B, name: "Beta" }, { id: C, name: "Gamma" }]);
  await fixture.bb.storage.kv.set("revisionHighwater", Number.MAX_SAFE_INTEGER - 1);
  const before = await snapshot(fixture.bb);
  const writes = instrument(fixture.bb);
  await assert.rejects(fixture.call("importApply", {
    payload: file([[A, "Alpha", opaquePng], [B, "Beta", opaquePng], [C, "Gamma", opaquePng]]),
    decisions: [decide(A, A), decide(B, B), decide(C, C)],
  }), /revision exhausted/);
  assert.deepEqual(writes.log, []);
  assert.deepEqual(await snapshot(fixture.bb), before);
  await fixture.dispose();
});

test("a storage outage before the first write is a clean failure, not a half rollback", async () => {
  const run = await failureScenario({ failFrom: 1 });
  run.writes.reset();
  const result = await run.fixture.call("importApply", { payload: run.payload, decisions: run.decisions });
  assert.deepEqual(result, { status: "failed", rolledBack: true });
  assert.deepEqual(await stable(run.fixture.bb), run.before);
  await run.fixture.dispose();
});

test("a failed write rolls back to an empty store by deleting the keys it created", async () => {
  const projects = [{ id: A, name: "Alpha" }, { id: B, name: "Beta" }];
  const payload = file([[A, "Alpha", opaquePng], [B, "Beta", transparentPng]]);
  const dry = await host(projects);
  const dryWrites = instrument(dry.bb);
  await dry.call("importApply", { payload, decisions: [decide(A, A), decide(B, B)] });
  const total = dryWrites.log.length;
  await dry.dispose();
  for (let step = 1; step <= total; step += 1) {
    const fixture = await host(projects);
    const before = await stable(fixture.bb);
    instrument(fixture.bb, { failAt: step });
    assert.deepEqual(await fixture.call("importApply", { payload, decisions: [decide(A, A), decide(B, B)] }), { status: "failed", rolledBack: true }, `step ${step}`);
    assert.deepEqual(await stable(fixture.bb), before, `state after failure at step ${step}`);
    assert.deepEqual(Object.keys(await stable(fixture.bb)), Object.keys(before));
    await fixture.dispose();
  }
});

test("imports interleave safely with removals, restores and automatic adoption", async () => {
  const fixture = await host([{ id: A, name: "Alpha" }, { id: B, name: "Beta" }, { id: C, name: "Gamma" }, { id: D, name: "Delta" }], { [C]: transparentPng });
  const payload = file([[A, "Alpha", opaquePng], [B, "Beta", opaquePng]]);
  const { undo } = await fixture.call("removeWithUndo", { projectId: C });
  const results = await Promise.all([
    fixture.call("importApply", { payload, decisions: [decide(A, A), decide(B, B)] }),
    fixture.call("restore", { projectId: C, token: undo.token }),
    fixture.adopt({ projectId: D, peer: "homepage", hash: "a".repeat(64), revision: null }),
    fixture.call("remove", { projectId: A }),
  ]);
  assert.equal(results[0].status, "imported");
  assert.equal(results[1].status, "restored");
  assert.equal(results[2].status, "adopted");
  const rows = Object.fromEntries((await fixture.call("list", null)).projects.map(row => [row.id, row]));
  assert.equal(rows[A].revision, null);
  assert.ok(rows[B].revision && rows[C].revision && rows[D].revision);
  assert.equal(new Set([rows[B].revision, rows[C].revision, rows[D].revision]).size, 3);
  assert.deepEqual([rows[B].automatic, rows[D].automatic], [false, true]);
  await fixture.dispose();
});
