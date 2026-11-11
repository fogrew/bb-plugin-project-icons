import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./dist/server.js";
import { transparentPng as png } from "./test-fixtures/png.mjs";
import { createIconResolver } from "./examples/artwork-consumer.ts";
import { fetchPeerImage } from "./lib/peer-image.ts";
import { peerAvailability, versionAtLeast } from "./lib/artwork-contract.ts";

const projectId = "proj_aaaaaaaaaa";
const peerRow = (overrides = {}) => ({ id: "homepage", version: "0.2.7", enabled: true, status: "running", ...overrides });

function iconsHost(sdk = {}) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "project-icons",
    sdk: { projects: { list: async () => [{ id: projectId, name: "Demo" }] }, ...sdk },
  });
  plugin(bb);
  const call = (method, input, caller = { kind: "client" }, signal) =>
    harness.behavior.callRpc(method, input, { experimental_caller: caller, signal });
  return { call, dispose: () => harness.lifecycle.dispose() };
}
const resolveInput = (extra = {}) => ({ version: 1, projectId, ...extra });
const asPlugin = { kind: "plugin", pluginId: "consumer" };

test("resolveIcon reports missing, found, not-modified, stale revisions and removal", async () => {
  const host = iconsHost();
  assert.deepEqual(await host.call("resolveIcon", resolveInput(), asPlugin), { version: 1, status: "missing", projectId });
  const { revision } = await host.call("save", { projectId, base64: png.toString("base64") });
  const found = await host.call("resolveIcon", resolveInput(), asPlugin);
  assert.equal(found.status, "found");
  assert.deepEqual([found.revision, found.source, found.theme, found.mimeType, found.width, found.height, found.sizeBytes],
    [revision, "manual", "any", "image/png", 64, 64, png.length]);
  assert.equal(found.base64, png.toString("base64"));
  assert.equal(found.urlPath, `/api/v1/plugins/project-icons/http/icon?projectId=${projectId}&v=${revision}`);
  assert.deepEqual(await host.call("resolveIcon", resolveInput({ ifRevision: revision, theme: "dark" }), asPlugin),
    { version: 1, status: "not-modified", projectId, revision });
  assert.equal((await host.call("resolveIcon", resolveInput({ ifRevision: revision - 1 }), asPlugin)).status, "found");
  const next = (await host.call("save", { projectId, base64: png.toString("base64") })).revision;
  assert.ok(next > revision);
  assert.equal((await host.call("resolveIcon", resolveInput({ ifRevision: revision }), asPlugin)).revision, next);
  await host.call("remove", { projectId });
  assert.equal((await host.call("resolveIcon", resolveInput({ ifRevision: next }), asPlugin)).status, "missing");
  await host.dispose();
});

test("resolveIcon rejects unknown projects, unsupported versions, recursion and unbounded input", async () => {
  const host = iconsHost();
  assert.equal((await host.call("resolveIcon", resolveInput({ projectId: "proj_cccccccccc" }))).status, "unknown-project");
  assert.equal((await host.call("resolveIcon", resolveInput({ projectId: "not an id" }))).status, "unknown-project");
  assert.deepEqual(await host.call("resolveIcon", resolveInput({ version: 2 })), { version: 1, status: "unsupported-version", supportedVersions: [1] });
  assert.equal((await host.call("resolveIcon", resolveInput({ trail: ["homepage", "project-icons"] }))).status, "recursive");
  for (const bad of [{ extra: 1 }, { projectId: "x".repeat(65) }, { trail: Array(9).fill("a") }, { theme: "sepia" }, { ifRevision: -1 }]) {
    await assert.rejects(host.call("resolveIcon", resolveInput(bad)), undefined, JSON.stringify(bad));
  }
  await host.dispose();
});

test("consumer harness resolves through plugins.callRpc with revision caching and graceful failure", async () => {
  const icons = iconsHost();
  const calls = [];
  let down = false;
  const consumer = createFakePluginHost({
    pluginId: "consumer",
    sdk: { plugins: { callRpc: async ({ pluginId, method, input, outputSchema, signal }) => {
      calls.push({ pluginId, method, input });
      if (down) throw new Error("plugin disabled");
      return outputSchema.parse(await icons.call(method, input, asPlugin, signal));
    } } },
  });
  let clock = 0;
  const resolver = createIconResolver(consumer.bb, "consumer", () => clock);
  assert.deepEqual(await resolver.resolve(projectId), { kind: "none", reason: "missing" });
  assert.deepEqual(calls[0], { pluginId: "project-icons", method: "resolveIcon", input: { version: 1, projectId, trail: ["consumer"] } });
  const { revision } = await icons.call("save", { projectId, base64: png.toString("base64") });
  assert.deepEqual(await resolver.resolve(projectId), { kind: "none", reason: "missing" }, "fresh cache entry is served without a call");
  assert.equal(calls.length, 1);
  clock += 61_000;
  const image = await resolver.resolve(projectId);
  assert.deepEqual([image.kind, image.revision], ["image", revision]);
  clock += 61_000;
  await resolver.resolve(projectId);
  assert.equal(calls.at(-1).input.ifRevision, revision);
  assert.equal((await resolver.resolve(projectId)).revision, revision);
  clock += 61_000;
  const updated = (await icons.call("save", { projectId, base64: png.toString("base64") })).revision;
  assert.equal((await resolver.resolve(projectId)).revision, updated);
  down = true;
  clock += 61_000;
  assert.equal((await resolver.resolve(projectId)).revision, updated, "stale copy survives a disabled provider");
  resolver.invalidate();
  assert.deepEqual(await resolver.resolve(projectId), { kind: "none", reason: "unavailable" });
  down = false;
  const recursive = createIconResolver(consumer.bb, "project-icons", () => clock);
  assert.deepEqual(await recursive.resolve(projectId), { kind: "none", reason: "unsupported" });
  await icons.dispose();
  await consumer.harness.lifecycle.dispose();
});

test("peer availability follows plugin state and minimum version", () => {
  assert.deepEqual(peerAvailability([]), { reason: "not-installed" });
  assert.deepEqual(peerAvailability([peerRow({ enabled: false })]), { reason: "disabled" });
  assert.deepEqual(peerAvailability([peerRow({ status: "incompatible" })]), { reason: "incompatible" });
  assert.deepEqual(peerAvailability([peerRow({ version: "0.2.6" })]), { reason: "incompatible" });
  assert.deepEqual(peerAvailability([peerRow({ status: "starting" })]), { reason: "not-running" });
  assert.deepEqual(peerAvailability([peerRow({ version: "1.0.0", status: "degraded" })]), { ok: true, version: "1.0.0" });
  assert.equal(versionAtLeast("0.10.0", [0, 2, 7]), true);
  assert.equal(versionAtLeast("garbage", [0, 2, 7]), false);
});

const peerHost = ({ plugins = [peerRow()], reply, throwError, hang } = {}) => {
  const seen = [];
  const host = iconsHost({ plugins: {
    list: async () => ({ plugins }),
    callRpc: async args => {
      seen.push(args);
      if (hang) return new Promise((_, reject) => args.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      if (throwError) throw new Error("boom");
      return reply;
    },
  } });
  return { ...host, seen };
};
const probe = host => host.call("peerArtwork", { projectId, peer: "homepage" });

test("peerArtwork maps Homepage replies and failures to explicit outcomes", async () => {
  for (const [options, expected] of [
    [{ plugins: [] }, { status: "unavailable", reason: "not-installed" }],
    [{ plugins: [peerRow({ enabled: false })] }, { status: "unavailable", reason: "disabled" }],
    [{ plugins: [peerRow({ version: "0.1.0" })] }, { status: "unavailable", reason: "incompatible" }],
    [{ reply: { kind: "missing" } }, { status: "none" }],
    [{ reply: { kind: "glyph", svg: "<svg/>" } }, { status: "glyph" }],
    [{ reply: { kind: "image" } }, { status: "image", pluginVersion: "0.2.7" }],
    [{ reply: { kind: "mystery" } }, { status: "unavailable", reason: "malformed" }],
    [{ reply: "nope" }, { status: "unavailable", reason: "malformed" }],
    [{ throwError: true }, { status: "unavailable", reason: "error" }],
  ]) {
    const host = peerHost(options);
    assert.deepEqual(await probe(host), expected, JSON.stringify(options));
    await host.dispose();
  }
  const host = peerHost({ reply: { kind: "image" } });
  await probe(host);
  assert.deepEqual([host.seen[0].pluginId, host.seen[0].method, host.seen[0].input], ["homepage", "getProjectArtwork", { projectId }]);
  await assert.rejects(host.call("peerArtwork", { projectId, peer: "homepage" }, asPlugin), /app only/);
  await assert.rejects(host.call("peerArtwork", { projectId: "proj_cccccccccc", peer: "homepage" }), /Project not found/);
  await assert.rejects(host.call("peerArtwork", { projectId, peer: "project-icons" }));
  assert.equal(host.seen.length, 1, "rejected calls never reach the peer");
  await host.dispose();
});

test("peerArtwork times out a hanging peer", async () => {
  const host = peerHost({ hang: true });
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = probe(host);
    for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve));
    mock.timers.tick(5000);
    assert.deepEqual(await pending, { status: "unavailable", reason: "timeout" });
  } finally { mock.timers.reset(); }
  await host.dispose();
});

const response = (body, init = {}) => () => Promise.resolve(new Response(body, init));
test("fetchPeerImage accepts bounded raster images and rejects everything else", async () => {
  const signal = new AbortController().signal;
  const file = await fetchPeerImage(projectId, signal, response(png, { headers: { "content-type": "image/png" } }));
  assert.deepEqual([file.name, file.type, file.size], ["homepage-icon.png", "image/png", png.length]);
  let request;
  await fetchPeerImage(projectId, signal, (url, init) => { request = { url, init }; return Promise.resolve(new Response(png)); });
  assert.equal(request.url, `/api/v1/plugins/homepage/http/project-icon?projectId=${projectId}`);
  assert.deepEqual([request.init.credentials, request.init.redirect, request.init.signal], ["same-origin", "error", signal]);
  await assert.rejects(fetchPeerImage(projectId, signal, response(null, { status: 404 })), /no image/);
  await assert.rejects(fetchPeerImage(projectId, signal, response("<svg xmlns='http://www.w3.org/2000/svg'/>", { headers: { "content-type": "image/svg+xml" } })), /not a PNG, JPEG or WebP/);
  await assert.rejects(fetchPeerImage(projectId, signal, response(Buffer.from([0, 0, 1, 0, 1, 0]))), /not a PNG/);
  await assert.rejects(fetchPeerImage(projectId, signal, response(png, { headers: { "content-length": String(3 * 1024 * 1024) } })), /larger than 2 MB/);
  const huge = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(512 * 1024).fill(1)); } });
  await assert.rejects(fetchPeerImage(projectId, signal, response(huge)), /larger than 2 MB/);
  await assert.rejects(fetchPeerImage(projectId, signal, () => Promise.reject(new Error("offline"))), /offline/);
});
