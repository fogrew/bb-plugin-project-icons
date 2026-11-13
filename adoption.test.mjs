import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./dist/server.js";
import { opaquePng, transparentPng } from "./test-fixtures/png.mjs";
import { imageDimensions, withinPeerBounds } from "./lib/image-bounds.ts";
import { MAX_PEER_RESPONSE_CHARS, targetFor } from "./lib/adoption.ts";

const A = "proj_aaaaaaaaaa";
const B = "proj_bbbbbbbbbb";
const client = { experimental_caller: { kind: "client" } };
const VERSIONS = { homepage: "0.2.7", "cursor-sidebar": "0.3.5", "nested-sidebar": "0.5.0", "chat-sidebar": "0.2.8" };
const url = (bytes, mime = "image/png") => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
const cursor = (...rows) => ({ icons: rows.map(([projectId, icon]) => ({ projectId, icon })) });

function jpeg(width, height) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08,
    height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
}
function webp(width, height) {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0); bytes.write("WEBP", 8); bytes.write("VP8X", 12); bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3); bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}
function pngWithSize(width, height) {
  const bytes = Buffer.from(opaquePng);
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return bytes;
}

function setup({ peers = {}, projects = [{ id: A, name: "Alpha" }, { id: B, name: "Beta" }] } = {}) {
  const calls = [];
  const rows = () => Object.entries(peers).map(([id, peer]) => ({
    id, version: peer.version ?? VERSIONS[id], enabled: peer.enabled ?? true, status: peer.status ?? "running",
  }));
  const { bb, harness } = createFakePluginHost({
    pluginId: "project-icons",
    sdk: {
      projects: { list: async () => projects },
      plugins: {
        list: async () => ({ plugins: rows() }),
        callRpc: async args => {
          calls.push({ pluginId: args.pluginId, method: args.method, input: args.input });
          const peer = peers[args.pluginId];
          if (!peer) throw new Error("unknown plugin");
          if (peer.hang) return new Promise((_, reject) => args.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
          const reply = typeof peer.reply === "function" ? peer.reply(args) : peer.reply;
          if (reply instanceof Error) throw reply;
          return reply;
        },
      },
    },
  });
  plugin(bb);
  const call = (method, input, caller = client) => harness.behavior.callRpc(method, input, caller);
  const scan = skip => call("adoptionScan", skip ? { skip } : {});
  const adopt = (candidate, extra = {}) => call("adoptPeer", {
    projectId: candidate.projectId, peer: candidate.peer, hash: candidate.hash, base64: transparentPng.toString("base64"),
    ifRevision: candidate.revision, ...extra,
  });
  const row = async id => (await call("list", null)).projects.find(project => project.id === id);
  return { bb, harness, calls, call, scan, adopt, row, dispose: () => harness.lifecycle.dispose() };
}

test("unavailable peers never throw and are never called", async () => {
  for (const peers of [
    {},
    { "cursor-sidebar": { reply: cursor([A, url(opaquePng)]), enabled: false } },
    { "cursor-sidebar": { reply: cursor([A, url(opaquePng)]), version: "0.1.0" } },
    { "cursor-sidebar": { reply: cursor([A, url(opaquePng)]), status: "incompatible" } },
    { "cursor-sidebar": { reply: cursor([A, url(opaquePng)]), status: "starting" } },
  ]) {
    const host = setup({ peers });
    assert.deepEqual(await host.scan(), { status: "ok", candidates: [] }, JSON.stringify(Object.keys(peers)));
    assert.equal(host.calls.length, 0);
    await host.dispose();
  }
});

test("malformed or failing peer replies produce no candidates", async () => {
  const bad = [null, "nope", 7, [], { icons: "x" }, { icons: [null, 3, { projectId: 5, icon: "x" }, { projectId: A }] },
    new Error("boom")];
  for (const reply of bad) {
    const host = setup({ peers: {
      "cursor-sidebar": { reply },
      "nested-sidebar": { reply: { icons: [{ projectId: A, icon: { src: 5 } }, { projectId: B, icon: null }] } },
      "chat-sidebar": { reply: ["array"] },
    } });
    assert.deepEqual(await host.scan(), { status: "ok", candidates: [] }, JSON.stringify(reply));
    await host.dispose();
  }
});

test("a failing higher-priority peer blocks lower-priority adoption for the projects it would serve", async () => {
  const nested = { reply: { icons: [{ projectId: A, icon: { src: url(opaquePng) } }] } };
  for (const cursorPeer of [{ reply: new Error("boom") }, { reply: "nope" }, { reply: cursor([A, url(opaquePng)]), status: "starting" }]) {
    const host = setup({ peers: { "cursor-sidebar": cursorPeer, "nested-sidebar": nested } });
    assert.deepEqual((await host.scan()).candidates, [], JSON.stringify(cursorPeer.reply));
    assert.equal(host.calls.some(item => item.pluginId === "nested-sidebar"), false, "the lower-priority peer is not even asked");
    await host.dispose();
  }
  const disabled = setup({ peers: { "cursor-sidebar": { reply: cursor([A, url(opaquePng)]), enabled: false }, "nested-sidebar": nested } });
  assert.deepEqual((await disabled.scan()).candidates.map(item => item.peer), ["nested-sidebar"], "a disabled peer is not a failure");
  await disabled.dispose();
  const lower = setup({ peers: { "cursor-sidebar": { reply: cursor([A, url(opaquePng)]) }, "chat-sidebar": { reply: new Error("boom") } } });
  assert.deepEqual((await lower.scan()).candidates.map(item => [item.projectId, item.peer]), [[A, "cursor-sidebar"]], "failures never block higher-priority peers");
  await lower.dispose();
});

test("a partly failing Homepage lookup blocks only the projects it could not probe", async () => {
  const ids = ["proj_aaaaaaaaaa", "proj_bbbbbbbbbb", "proj_cccccccccc", "proj_dddddddddd", "proj_eeeeeeeeee"];
  const host = setup({
    projects: ids.map(id => ({ id, name: id })),
    peers: {
      homepage: { reply: ({ input }) => input.projectId === ids[4] ? new Error("boom") : { kind: "missing" } },
      "cursor-sidebar": { reply: cursor(...ids.map(id => [id, url(opaquePng)])) },
    },
  });
  assert.deepEqual((await host.scan()).candidates.map(item => item.projectId).sort(), ids.slice(0, 4));
  await host.dispose();
  const odd = setup({ peers: {
    homepage: { reply: ({ input }) => input.projectId === A ? { kind: "weird" } : { kind: "missing" } },
    "cursor-sidebar": { reply: cursor([A, url(opaquePng)], [B, url(opaquePng)]) },
  } });
  assert.deepEqual((await odd.scan()).candidates.map(item => item.projectId), [B], "a malformed per-project reply blocks that project");
  await odd.dispose();
});

test("a peer response over the size cap is ignored and blocks lower-priority peers", async () => {
  const filler = (size) => ({ projectId: "proj_zzzzzzzzzz", icon: "x".repeat(size) });
  const huge = setup({ peers: {
    "cursor-sidebar": { reply: { icons: [{ projectId: A, icon: url(opaquePng) }, filler(MAX_PEER_RESPONSE_CHARS)] } },
    "nested-sidebar": { reply: { icons: [{ projectId: A, icon: { src: url(opaquePng) } }] } },
  } });
  assert.deepEqual((await huge.scan()).candidates, []);
  assert.equal(huge.calls.some(item => item.pluginId === "nested-sidebar"), false);
  await huge.dispose();
  const large = setup({ peers: { "cursor-sidebar": { reply: { icons: [{ projectId: A, icon: url(opaquePng) }, filler(MAX_PEER_RESPONSE_CHARS - 10_000)] } } } });
  assert.deepEqual((await large.scan()).candidates.map(item => item.projectId), [A]);
  await large.dispose();
});

test("rejects svg, oversize, mismatched, truncated, non-base64 and oversize-pixel data", async () => {
  const padded = Buffer.concat([transparentPng, Buffer.alloc(260 * 1024)]);
  const rejected = [
    url("<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml"),
    url(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/png"),
    url(jpeg(32, 32), "image/png"),
    url(opaquePng, "image/jpeg"),
    url(padded),
    url(pngWithSize(5000, 5000)),
    url(pngWithSize(4096, 4096).subarray(0, 20)),
    url(jpeg(8000, 8000), "image/jpeg"),
    url(webp(9000, 100), "image/webp"),
    url(Buffer.from([0, 0, 1, 0, 1, 0, 16, 16]), "image/x-icon"),
    "data:image/png;base64,@@@@",
    "https://example.test/icon.png",
    "📁",
    "",
  ];
  for (const icon of rejected) {
    const host = setup({ peers: { "cursor-sidebar": { reply: cursor([A, icon]) } } });
    assert.deepEqual((await host.scan()).candidates, [], icon.slice(0, 40));
    await host.dispose();
  }
  const accepted = [[opaquePng, "image/png"], [jpeg(64, 64), "image/jpeg"], [webp(64, 64), "image/webp"]];
  for (const [bytes, mime] of accepted) {
    const host = setup({ peers: { "cursor-sidebar": { reply: cursor([A, url(bytes, mime)]) } } });
    const [candidate] = (await host.scan()).candidates;
    assert.deepEqual([candidate.mimeType, candidate.base64], [mime, bytes.toString("base64")]);
    await host.dispose();
  }
});

test("adopts on first run with provenance, then stays quiet while the peer is unchanged", async () => {
  const host = setup({ peers: { "cursor-sidebar": { reply: cursor([A, url(opaquePng)], ["proj_cccccccccc", url(opaquePng)]) } } });
  const { status, candidates } = await host.scan();
  assert.equal(status, "ok");
  assert.equal(candidates.length, 1);
  const [candidate] = candidates;
  assert.deepEqual([candidate.projectId, candidate.peer, candidate.transport, candidate.revision, candidate.knownHash],
    [A, "cursor-sidebar", "inline", null, null]);
  assert.match(candidate.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(host.calls[0], { pluginId: "cursor-sidebar", method: "listProjectIcons", input: {} });
  const adopted = await host.adopt(candidate);
  assert.equal(adopted.status, "adopted");
  const row = await host.row(A);
  assert.deepEqual([row.revision, row.automatic, row.source.pluginId], [adopted.revision, true, "cursor-sidebar"]);
  assert.ok(row.source.importedAt > 0);
  assert.equal((await host.row(B)).source, null);
  const resolved = await host.call("resolveIcon", { version: 1, projectId: A }, { experimental_caller: { kind: "plugin", pluginId: "consumer" } });
  assert.deepEqual([resolved.status, resolved.source, resolved.adoptedFrom], ["found", "manual", "cursor-sidebar"]);
  assert.equal((await host.harness.behavior.fetchHttp("GET", `/icon?projectId=${A}`)).status, 200);
  assert.deepEqual((await host.scan()).candidates, []);
  await host.dispose();
});

test("each project takes the first peer in priority order that has usable artwork", async () => {
  const host = setup({ peers: {
    homepage: { reply: ({ input }) => input.projectId === A ? { kind: "image" } : { kind: "glyph", svg: "<svg/>" } },
    "cursor-sidebar": { reply: cursor([A, url(opaquePng)], [B, "emoji"]) },
    "nested-sidebar": { reply: { icons: [{ projectId: B, icon: { src: url(opaquePng) } }] } },
    "chat-sidebar": { reply: { [`project:${B}`]: url(transparentPng) } },
  } });
  const byProject = Object.fromEntries((await host.scan()).candidates.map(item => [item.projectId, item]));
  assert.deepEqual([byProject[A].peer, byProject[A].transport, byProject[A].hash, byProject[A].base64], ["homepage", "http", null, undefined]);
  assert.deepEqual([byProject[B].peer, byProject[B].transport], ["nested-sidebar", "inline"]);
  assert.deepEqual(host.calls.filter(item => item.pluginId === "homepage").map(item => item.method), ["getProjectArtwork", "getProjectArtwork"]);
  await host.dispose();
  const chat = setup({ peers: { "chat-sidebar": { reply: { [`project:${A}`]: url(transparentPng, "image/png"), "custom:x": url(opaquePng), [`project:${B}`]: 4 } } } });
  assert.deepEqual((await chat.scan()).candidates.map(item => [item.projectId, item.peer]), [[A, "chat-sidebar"]]);
  assert.deepEqual(chat.calls[0], { pluginId: "chat-sidebar", method: "images_get", input: null });
  await chat.dispose();
});

test("manual save stops automatic adoption until re-enabled and removal resets to automatic", async () => {
  const host = setup({ peers: { "cursor-sidebar": { reply: cursor([A, url(opaquePng)]) } } });
  const [candidate] = (await host.scan()).candidates;
  await host.adopt(candidate);
  const saved = await host.call("save", { projectId: A, base64: opaquePng.toString("base64") });
  let row = await host.row(A);
  assert.deepEqual([row.revision, row.automatic, row.source], [saved.revision, false, null]);
  assert.deepEqual((await host.scan()).candidates, []);
  assert.equal((await host.call("resolveIcon", { version: 1, projectId: A })).adoptedFrom, undefined);
  await host.call("remove", { projectId: A });
  assert.equal((await host.row(A)).revision, null);
  const again = (await host.scan()).candidates;
  assert.equal(again.length, 1, "removal resets the project to automatic");
  assert.equal((await host.adopt(again[0])).status, "adopted");
  const removed = await host.call("removeWithUndo", { projectId: A });
  assert.deepEqual((await host.scan()).candidates, [], "a pending Undo pauses adoption for that project");
  assert.equal((await host.adopt(again[0], { ifRevision: null })).reason, "stale");
  assert.equal((await host.call("restore", { projectId: A, token: removed.undo.token })).status, "restored");
  await host.call("setAutomaticAdoption", { enabled: false });
  assert.deepEqual((await host.scan()).candidates, [], "global switch keeps a removed icon empty");
  await host.dispose();
});

test("existing icons without provenance and icons with manual edits are never replaced", async () => {
  const host = setup({ peers: { "cursor-sidebar": { reply: cursor([A, url(opaquePng)], [B, url(opaquePng)]) } } });
  await host.bb.storage.kv.set("index", { [A]: 5 });
  await host.bb.storage.kv.set(`image:${A}`, transparentPng.toString("base64"));
  assert.deepEqual((await host.scan()).candidates.map(item => item.projectId), [B]);
  assert.equal((await host.row(A)).automatic, false);
  assert.deepEqual(await host.call("enableAutomatic", { projectId: A }), { status: "has-icon" });
  const [candidate] = (await host.scan()).candidates;
  await host.call("save", { projectId: B, base64: transparentPng.toString("base64") });
  assert.deepEqual(await host.adopt(candidate), { status: "skipped", reason: "manual" }, "an edit made after the scan wins");
  assert.deepEqual((await host.row(B)).source, null);
  await host.dispose();
});

test("refreshes only while the icon is still auto-imported and the same peer's artwork changed", async () => {
  const peer = { reply: cursor([A, url(opaquePng)]) };
  const host = setup({ peers: { "cursor-sidebar": peer } });
  const first = (await host.scan()).candidates[0];
  const { revision } = await host.adopt(first);
  peer.reply = cursor([A, url(transparentPng)]);
  const [refresh] = (await host.scan()).candidates;
  assert.deepEqual([refresh.revision, refresh.knownHash, refresh.hash === first.hash], [revision, first.hash, false]);
  assert.deepEqual(await host.adopt(refresh, { ifRevision: revision - 1 }), { status: "skipped", reason: "stale" });
  assert.deepEqual(await host.adopt({ ...refresh, peer: "nested-sidebar" }), { status: "skipped", reason: "stale" });
  assert.deepEqual(await host.adopt({ ...refresh, hash: first.hash }), { status: "skipped", reason: "unchanged" });
  const next = await host.adopt(refresh);
  assert.equal(next.status, "adopted");
  assert.ok(next.revision > revision);
  assert.equal((await host.row(A)).source.pluginId, "cursor-sidebar");
  assert.deepEqual((await host.scan()).candidates, []);
  peer.reply = { icons: [] };
  assert.deepEqual((await host.scan()).candidates, [], "vanished artwork keeps the icon");
  assert.equal((await host.row(A)).revision, next.revision);
  peer.reply = cursor([A, url(opaquePng)]);
  await host.call("save", { projectId: A, base64: opaquePng.toString("base64") });
  assert.deepEqual((await host.scan()).candidates, [], "manual edit ends refreshing");
  await host.dispose();
});

test("a refresh asks only the original source and never switches peers", async () => {
  const peers = { "cursor-sidebar": { reply: cursor([A, url(opaquePng)]) } };
  const host = setup({ peers });
  await host.adopt((await host.scan()).candidates[0]);
  peers.homepage = { reply: { kind: "image" } };
  host.calls.length = 0;
  assert.deepEqual((await host.scan()).candidates.map(item => [item.projectId, item.peer]), [[B, "homepage"]]);
  assert.deepEqual(host.calls.filter(item => item.pluginId === "homepage").map(item => item.input.projectId), [B]);
  await host.dispose();
});

test("the global toggle disables scanning and adoption without touching existing icons", async () => {
  const host = setup({ peers: { "cursor-sidebar": { reply: cursor([A, url(opaquePng)], [B, url(opaquePng)]) } } });
  assert.equal((await host.call("list", null)).automaticAdoption, true);
  const [first, second] = (await host.scan()).candidates;
  await host.adopt(first);
  assert.deepEqual(await host.call("setAutomaticAdoption", { enabled: false }), { enabled: false });
  assert.equal((await host.call("list", null)).automaticAdoption, false);
  host.calls.length = 0;
  assert.deepEqual(await host.scan(), { status: "disabled", candidates: [] });
  assert.equal(host.calls.length, 0);
  assert.deepEqual(await host.adopt(second), { status: "skipped", reason: "disabled" });
  assert.equal((await host.row(first.projectId)).source.pluginId, "cursor-sidebar");
  assert.equal((await host.row(second.projectId)).revision, null);
  await host.call("setAutomaticAdoption", { enabled: true });
  assert.equal((await host.adopt(second)).status, "adopted");
  await host.dispose();
});

test("adoption RPCs reject plugin callers, bad hashes, invalid PNG and unknown projects", async () => {
  const host = setup({ peers: { "cursor-sidebar": { reply: cursor([A, url(opaquePng)]) } } });
  const plugin = { experimental_caller: { kind: "plugin", pluginId: "other" } };
  const [candidate] = (await host.scan()).candidates;
  for (const [method, input] of [["adoptionScan", {}], ["setAutomaticAdoption", { enabled: false }], ["enableAutomatic", { projectId: A }],
    ["adoptPeer", { projectId: A, peer: "cursor-sidebar", hash: candidate.hash, base64: transparentPng.toString("base64"), ifRevision: null }]]) {
    await assert.rejects(host.call(method, input, plugin), /other plugins/, method);
  }
  await assert.rejects(host.adopt(candidate, { hash: "zz" }));
  await assert.rejects(host.adopt(candidate, { peer: "unknown-plugin" }));
  await assert.rejects(host.adopt(candidate, { base64: Buffer.from("not a png").toString("base64") }));
  await assert.rejects(host.call("adoptionScan", { skip: ["bad id"] }));
  assert.deepEqual(await host.adopt({ ...candidate, projectId: "proj_cccccccccc" }), { status: "skipped", reason: "unknown-project" });
  await assert.rejects(host.call("enableAutomatic", { projectId: "proj_cccccccccc" }), /not found/);
  assert.equal((await host.row(A)).revision, null);
  await host.dispose();
});

test("skip lists exclude projects and orphaned provenance is cleaned up", async () => {
  const projects = [{ id: A, name: "Alpha" }, { id: B, name: "Beta" }];
  const host = setup({ projects, peers: { "cursor-sidebar": { reply: cursor([A, url(opaquePng)], [B, url(opaquePng)]) } } });
  assert.deepEqual((await host.scan([A])).candidates.map(item => item.projectId), [B]);
  await host.adopt((await host.scan([B])).candidates[0]);
  assert.deepEqual(Object.keys(await host.bb.storage.kv.get("adoption")), [A]);
  projects.splice(0, projects.length, { id: B, name: "Beta" });
  await host.call("list", null);
  assert.deepEqual(Object.keys(await host.bb.storage.kv.get("adoption")), []);
  await host.dispose();
});

test("a hanging peer times out without throwing", async () => {
  const host = setup({ peers: {
    "cursor-sidebar": { hang: true },
    "nested-sidebar": { reply: { icons: [{ projectId: A, icon: { src: url(opaquePng) } }] } },
  } });
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = host.scan();
    for (let i = 0; i < 400 && !host.calls.length; i += 1) await new Promise(resolve => setImmediate(resolve));
    assert.equal(host.calls[0].pluginId, "cursor-sidebar");
    mock.timers.tick(5000);
    assert.deepEqual((await pending).candidates, [], "the timed-out peer blocks lower-priority adoption for this scan");
    assert.equal(host.calls.length, 1);
  } finally { mock.timers.reset(); }
  await host.dispose();
});

test("target eligibility and image bounds helpers", () => {
  const peer = { mode: "peer", pluginId: "cursor-sidebar", importedAt: 1, hash: "a".repeat(64), revision: 4 };
  assert.deepEqual(targetFor(A, undefined, undefined), { projectId: A, revision: null, source: null, knownHash: null });
  assert.equal(targetFor(A, 3, undefined), null);
  assert.equal(targetFor(A, undefined, { mode: "manual" }), null);
  assert.equal(targetFor(A, 5, peer), null);
  assert.equal(targetFor(A, undefined, peer), null);
  assert.deepEqual(targetFor(A, 4, peer), { projectId: A, revision: 4, source: "cursor-sidebar", knownHash: peer.hash });
  assert.deepEqual(imageDimensions(opaquePng, "png"), { width: 64, height: 64 });
  assert.deepEqual(imageDimensions(jpeg(120, 80), "jpeg"), { width: 120, height: 80 });
  assert.deepEqual(imageDimensions(webp(300, 200), "webp"), { width: 300, height: 200 });
  const lossless = Buffer.alloc(30);
  lossless.write("RIFF", 0); lossless.write("WEBP", 8); lossless.write("VP8L", 12); lossless[20] = 0x2f;
  lossless.writeUInt32LE((63) | (31 << 14), 21);
  assert.deepEqual(imageDimensions(lossless, "webp"), { width: 64, height: 32 });
  const lossy = Buffer.alloc(30);
  lossy.write("RIFF", 0); lossy.write("WEBP", 8); lossy.write("VP8 ", 12); lossy.set([0x9d, 0x01, 0x2a], 23);
  lossy.writeUInt16LE(48, 26); lossy.writeUInt16LE(40, 28);
  assert.deepEqual(imageDimensions(lossy, "webp"), { width: 48, height: 40 });
  assert.equal(imageDimensions(Buffer.alloc(10), "png"), null);
  assert.equal(imageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "jpeg"), null);
  assert.equal(withinPeerBounds({ width: 4096, height: 4096 }), true);
  assert.equal(withinPeerBounds({ width: 4097, height: 10 }), false);
  assert.equal(withinPeerBounds({ width: 0, height: 10 }), false);
  assert.equal(withinPeerBounds(null), false);
});
