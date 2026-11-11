import test from "node:test";
import assert from "node:assert/strict";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./dist/server.js";
import { transparentPng as png } from "./test-fixtures/png.mjs";
import { isSafeRelativePath, selectCandidates, sniffImage } from "./lib/icon-discovery.ts";

const projectId = "proj_aaaaaaaaaa";
const host = (sdkProjects) => {
  const { bb, harness } = createFakePluginHost({
    pluginId: "project-icons",
    sdk: { projects: { list: async () => [{ id: projectId, name: "Demo" }], ...sdkProjects } },
  });
  plugin(bb);
  return { call: (method, input) => harness.behavior.callRpc(method, input), dispose: () => harness.lifecycle.dispose() };
};

test("selection ranks, bounds and rejects unsafe or ignored paths", () => {
  const paths = [
    "node_modules/pkg/logo.png", "../escape/logo.png", "/abs/logo.png", "a\b/logo.png", "public/favicon.png", "docs/logo.svg",
    "src/deep/er/than/eight/levels/of/dirs/logo.png", "assets/logo.webp", "assets/photo.png", "assets/icon.ico", "icon.jpg",
    "public/favicon.png", ...Array.from({ length: 30 }, (_, i) => `img/logo-${i}.png`),
  ];
  const result = selectCandidates(paths);
  assert.equal(result.candidates[0].path, "public/favicon.png");
  assert.equal(result.candidates.length, 12);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.rejected, { svg: 1, unsupported: 1 });
  assert.ok(result.candidates.every(c => isSafeRelativePath(c.path) && !c.path.includes("node_modules")));
  assert.equal(new Set(result.candidates.map(c => c.path)).size, result.candidates.length);
});

test("sniffing identifies supported formats only", () => {
  assert.equal(sniffImage(png), "png");
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
  assert.equal(sniffImage(Buffer.from("RIFF0000WEBPVP8 ")), "webp");
  assert.equal(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
});

test("discover merges bounded host results and reports unavailable hosts", async () => {
  const queries = [];
  const ok = host({ files: async ({ query }) => { queries.push(query); return { files: [{ name: "favicon.png", path: "public/favicon.png" }, { name: "logo.svg", path: "logo.svg" }], truncated: false }; } });
  const result = await ok.call("discover", { projectId });
  assert.deepEqual(queries.sort(), ["favicon", "icon", "logo"]);
  assert.equal(result.status, "ok");
  assert.deepEqual(result.candidates, [{ path: "public/favicon.png", name: "favicon.png" }]);
  assert.equal(result.rejected.svg, 1);
  await ok.dispose();
  const down = host({ files: async () => { throw new Error("host offline"); } });
  assert.equal((await down.call("discover", { projectId })).status, "unavailable");
  await down.dispose();
  const none = host({ files: async () => ({ files: [], truncated: false }) });
  const empty = await none.call("discover", { projectId });
  assert.deepEqual([empty.status, empty.candidates.length], ["ok", 0]);
  await none.dispose();
});

test("readCandidate validates path, size, encoding and content", async () => {
  const read = { value: { content: png.toString("base64"), contentEncoding: "base64", mimeType: "image/png", sizeBytes: png.length } };
  const h = host({ fileContent: async () => read.value });
  const good = await h.call("readCandidate", { projectId, path: "public/favicon.png" });
  assert.deepEqual([good.mimeType, good.sizeBytes], ["image/png", png.length]);
  for (const path of ["../secret.png", "/etc/passwd.png", "a/../b.png", "notes.txt", "logo.svg", "C:/x.png"]) {
    await assert.rejects(h.call("readCandidate", { projectId, path }), undefined, path);
  }
  read.value = { ...read.value, sizeBytes: 3 * 1024 * 1024 };
  await assert.rejects(h.call("readCandidate", { projectId, path: "big.png" }));
  read.value = { ...read.value, sizeBytes: 10, content: Buffer.from("<svg/>").toString("base64") };
  await assert.rejects(h.call("readCandidate", { projectId, path: "fake.png" }));
  read.value = { content: "<svg/>", contentEncoding: "utf8", mimeType: "image/svg+xml", sizeBytes: 6 };
  await assert.rejects(h.call("readCandidate", { projectId, path: "text.png" }));
  read.value = { content: png.toString("base64"), contentEncoding: "base64", mimeType: "image/png", sizeBytes: png.length };
  await assert.rejects(h.call("readCandidate", { projectId, path: "mismatch.jpg" }));
  await assert.rejects(h.call("readCandidate", { projectId: "proj_cccccccccc", path: "logo.png" }));
  await h.dispose();
});
