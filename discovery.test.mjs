import test from "node:test";
import assert from "node:assert/strict";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./dist/server.js";
import { transparentPng as png } from "./test-fixtures/png.mjs";
import { isDiscoverablePath, isSafeRelativePath, selectCandidates, sniffImage } from "./lib/icon-discovery.ts";

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
    "node_modules/pkg/logo.png", "../escape/logo.png", "/abs/logo.png", "a\b/logo.png", "a/b:stream/logo.png", "ab/logo.png", "public/favicon.png", "docs/logo.svg",
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

test("selection finds framework icon conventions", () => {
  const paths = [
    "public/apple-touch-icon.png", "public/android-chrome-192x192.png", "app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
    "src-tauri/icons/128x128.png", "src-tauri/icons/128x128@2x.png", "src-tauri/icons/icon.png", "build/icon.png", "build/icons/512x512.png",
    "resources/app-icon.webp", "ios/App/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png", "static/favicon.jpg",
    "assets/icons/512.png", "src/icons/arrow.png", "assets/icons/readme.txt",
  ];
  const found = selectCandidates(paths).candidates.map(c => c.path);
  for (const path of paths.filter(p => !["src/icons/arrow.png", "assets/icons/readme.txt"].includes(p))) assert.ok(found.includes(path), path);
  assert.ok(!found.includes("src/icons/arrow.png") && !found.includes("assets/icons/readme.txt"));
  assert.ok(isDiscoverablePath("build/icon.png") && isDiscoverablePath("src-tauri/icons/32x32.png"));
});

test("selection keeps build output, tool directories and non-image formats out", () => {
  const paths = ["build/static/logo.png", "build/logo.png", "bin/Debug/icon.png", "obj/icon.png", ".claude/worktrees/a/Launcher/Resources/logo.png",
    "dist/icons/512x512.png", "icons/app.ico", "icons/icon.svg", "public/favicon.ico"];
  const result = selectCandidates(paths);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.rejected, { svg: 1, unsupported: 1 });
  for (const path of paths.filter(p => p.endsWith(".png"))) assert.equal(isDiscoverablePath(path), false, path);
});

test("selection prefers larger square icons over small or non-square ones", () => {
  const order = selectCandidates([
    "public/favicon-16x16.png", "public/favicon-32x32.png", "public/favicon.png", "public/icon-512.png", "public/icon-192.png", "public/icon-16.png",
    "public/icon-512x128.png", "public/android-chrome-512x512.png", "public/android-chrome-192x192.png",
  ]).candidates.map(c => c.path);
  assert.deepEqual(order.slice(0, 3), ["public/favicon.png", "public/favicon-32x32.png", "public/favicon-16x16.png"]);
  assert.ok(order.indexOf("public/android-chrome-512x512.png") < order.indexOf("public/icon-512.png"));
  assert.ok(order.indexOf("public/icon-512.png") < order.indexOf("public/icon-192.png"));
  assert.ok(order.indexOf("public/icon-192.png") < order.indexOf("public/icon-512x128.png"));
  assert.ok(order.indexOf("public/icon-512x128.png") < order.indexOf("public/icon-16.png"));
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
  assert.deepEqual(queries.sort(), ["android-chrome", "apple-touch", "favicon", "ic_launcher", "icon", "logo"]);
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
  for (const path of ["../secret.png", "/etc/passwd.png", "a/../b.png", "notes.txt", "logo.svg", "C:/x.png", "node_modules/pkg/logo.png", "photo.png"]) {
    await assert.rejects(h.call("readCandidate", { projectId, path }), /Unsupported image path/, path);
  }
  read.value = { ...read.value, sizeBytes: 3 * 1024 * 1024 };
  await assert.rejects(h.call("readCandidate", { projectId, path: "logo-big.png" }), /larger than 2 MB/);
  read.value = { ...read.value, sizeBytes: 10, content: Buffer.from("<svg/>").toString("base64") };
  await assert.rejects(h.call("readCandidate", { projectId, path: "logo-fake.png" }), /not a supported image/);
  read.value = { content: "<svg/>", contentEncoding: "utf8", mimeType: "image/svg+xml", sizeBytes: 6 };
  await assert.rejects(h.call("readCandidate", { projectId, path: "logo-text.png" }), /Not an image file/);
  read.value = { content: png.toString("base64"), contentEncoding: "base64", mimeType: "image/png", sizeBytes: png.length };
  await assert.rejects(h.call("readCandidate", { projectId, path: "logo-mismatch.jpg" }), /not a supported image/);
  for (const path of ["src-tauri/icons/128x128.png", "build/icon.png", "app/res/mipmap-hdpi/ic_launcher.png", "public/apple-touch-icon.png"]) {
    assert.equal((await h.call("readCandidate", { projectId, path })).mimeType, "image/png", path);
  }
  for (const path of ["src/icons/arrow.png", "build/static/logo.png", ".claude/x/logo.png"]) {
    await assert.rejects(h.call("readCandidate", { projectId, path }), /Unsupported image path/, path);
  }
  await assert.rejects(h.call("readCandidate", { projectId: "proj_cccccccccc", path: "logo.png" }), /Project not found/);
  await h.dispose();
});

test("readCandidate hides host error details", async () => {
  const h = host({ fileContent: async () => { throw new Error("EACCES /home/secret/logo.png"); } });
  await assert.rejects(h.call("readCandidate", { projectId, path: "logo.png" }), error => error.message === "Image could not be read");
  await h.dispose();
});
