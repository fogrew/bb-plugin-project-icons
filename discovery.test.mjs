import test from "node:test";
import assert from "node:assert/strict";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./dist/server.js";
import { transparentPng as png } from "./test-fixtures/png.mjs";
import { bmpEntry, buildIco, pngEntry } from "./test-fixtures/ico.mjs";
import { MAX_CANDIDATES, isDiscoverablePath, isSafeRelativePath, selectCandidates, sniffImage, sniffRepositoryImage } from "./lib/icon-discovery.ts";

const projectId = "proj_aaaaaaaaaa";
const patchedCopy = (bytes, change) => { const copy = Buffer.from(bytes); change(copy); return copy; };
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
    "src/deep/er/than/eight/levels/of/dirs/logo.png", "assets/logo.webp", "assets/photo.png", "assets/icon.gif", "icon.jpg",
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
  const groups = [[
    "public/apple-touch-icon.png", "public/android-chrome-192x192.png", "app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
    "src-tauri/icons/128x128.png", "src-tauri/icons/128x128@2x.png", "src-tauri/icons/icon.png", "build/icon.png", "build/icons/512x512.png",
  ], [
    "resources/app-icon.webp", "ios/App/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png", "static/favicon.jpg", "assets/icons/512.png",
  ]];
  for (const positives of groups) {
    assert.ok(positives.length < MAX_CANDIDATES);
    const found = selectCandidates([...positives, "src/icons/arrow.png", "assets/icons/readme.txt"]).candidates.map(c => c.path);
    for (const path of positives) assert.ok(found.includes(path), path);
    assert.ok(!found.includes("src/icons/arrow.png") && !found.includes("assets/icons/readme.txt"));
  }
  assert.ok(isDiscoverablePath("build/icon.png") && isDiscoverablePath("src-tauri/icons/32x32.png"));
});

test("selection keeps build output, tool directories and non-image formats out", () => {
  const paths = ["build/static/logo.png", "build/logo.png", "bin/Debug/icon.png", "obj/icon.png", ".claude/worktrees/a/Launcher/Resources/logo.png",
    "dist/icons/512x512.png", "icons/32x32.gif", "icons/icon.svg", "public/favicon.bmp",
    "build/icons/node_modules/a/icon.png", "build/icons/dist/logo.png", "build/icons/sub/build/icon.png", "packages/app/build/icon.png"];
  const result = selectCandidates(paths);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.rejected, { svg: 1, unsupported: 2 });
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

test("selection ranks android densities, variants, multipliers and ignores years", () => {
  const order = (paths) => selectCandidates(paths).candidates.map(c => c.path);
  const mipmaps = order([
    "res/mipmap-mdpi/ic_launcher.png", "res/mipmap-hdpi/ic_launcher.png", "res/mipmap-xhdpi/ic_launcher.png",
    "res/mipmap-xxhdpi/ic_launcher.png", "res/mipmap-xxxhdpi/ic_launcher.png",
    "res/mipmap-xxxhdpi/ic_launcher_round.png", "res/mipmap-xxxhdpi/ic_launcher_foreground.png",
  ]);
  assert.equal(mipmaps[0], "res/mipmap-xxxhdpi/ic_launcher.png");
  assert.ok(mipmaps.indexOf("res/mipmap-xxxhdpi/ic_launcher.png") < mipmaps.indexOf("res/mipmap-xxxhdpi/ic_launcher_round.png"));
  assert.ok(mipmaps.indexOf("res/mipmap-xxxhdpi/ic_launcher.png") < mipmaps.indexOf("res/mipmap-xxxhdpi/ic_launcher_foreground.png"));
  assert.ok(mipmaps.indexOf("res/mipmap-xhdpi/ic_launcher.png") < mipmaps.indexOf("res/mipmap-hdpi/ic_launcher.png"));
  assert.ok(mipmaps.indexOf("res/mipmap-hdpi/ic_launcher.png") < mipmaps.indexOf("res/mipmap-mdpi/ic_launcher.png"));
  const chrome = order(["public/android-chrome-16.png", "public/android-chrome-192.png"]);
  assert.deepEqual(chrome, ["public/android-chrome-192.png", "public/android-chrome-16.png"]);
  const multipliers = order(["icons/icon-64.png", "icons/icon-64@2x.png", "icons/icon-64@3x.png"]);
  assert.deepEqual(multipliers, ["icons/icon-64@3x.png", "icons/icon-64@2x.png", "icons/icon-64.png"]);
  const years = order(["public/logo-2024.png", "public/logo-16.png", "public/logo-1024x1024.png"]);
  assert.deepEqual(years, ["public/logo-1024x1024.png", "public/logo-2024.png", "public/logo-16.png"]);
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

test("selection accepts ICO candidates and keeps other containers unsupported", () => {
  const result = selectCandidates(["public/favicon.ico", "icons/32x32.ico", "assets/logo.gif", "assets/logo.svg", "static/ICON.ICO", "node_modules/x/favicon.ico", "docs/photo.ico"]);
  assert.deepEqual(result.candidates.map(c => c.path).sort(), ["icons/32x32.ico", "public/favicon.ico", "static/ICON.ICO"]);
  assert.deepEqual(result.rejected, { svg: 1, unsupported: 1 });
  assert.ok(isDiscoverablePath("public/favicon.ico") && isDiscoverablePath("src-tauri/icons/icon.ico"));
  assert.ok(!isDiscoverablePath("node_modules/x/favicon.ico") && !isDiscoverablePath("docs/photo.ico"));
});

test("favicon.ico competes with PNG candidates by size class, then yields ties to PNG", () => {
  const order = selectCandidates([
    "public/favicon.ico", "public/favicon.png", "public/favicon-16x16.png", "public/favicon-32x32.png", "public/favicon-192x192.png",
  ]).candidates.map(c => c.path);
  assert.deepEqual(order, [
    "public/favicon-192x192.png", "public/favicon.png", "public/favicon.ico", "public/favicon-32x32.png", "public/favicon-16x16.png",
  ]);
  const roots = selectCandidates(["assets/logo.png", "favicon.ico"]).candidates.map(c => c.path);
  assert.deepEqual(roots, ["favicon.ico", "assets/logo.png"]);
  const sized = selectCandidates(["icons/512x512.ico", "icons/512x512.png", "icons/32x32.ico"]).candidates.map(c => c.path);
  assert.deepEqual(sized, ["icons/512x512.png", "icons/512x512.ico", "icons/32x32.ico"]);
});

test("readCandidate extracts the largest ICO entry as a PNG or a standalone ICO", async () => {
  const pngs = [pngEntry(16), pngEntry(48), pngEntry(32)];
  const bmps = [bmpEntry(16), bmpEntry(32), bmpEntry(24)];
  const files = { "public/favicon.ico": buildIco(pngs), "icons/icon.ico": buildIco(bmps) };
  const h = host({ fileContent: async ({ path }) => ({ content: files[path].toString("base64"), contentEncoding: "base64", mimeType: "image/x-icon", sizeBytes: files[path].length }) });
  const fromPng = await h.call("readCandidate", { projectId, path: "public/favicon.ico" });
  assert.equal(fromPng.mimeType, "image/png");
  assert.ok(Buffer.from(fromPng.base64, "base64").equals(pngs[1].data));
  assert.equal(fromPng.sizeBytes, pngs[1].data.length);
  const fromBmp = await h.call("readCandidate", { projectId, path: "icons/icon.ico" });
  assert.equal(fromBmp.mimeType, "image/x-icon");
  const out = Buffer.from(fromBmp.base64, "base64");
  assert.equal(fromBmp.sizeBytes, out.length);
  assert.deepEqual([out.readUInt16LE(2), out.readUInt16LE(4), out[6]], [1, 1, 32]);
  assert.ok(out.subarray(22).equals(bmps[1].data));
  await h.dispose();
});

test("readCandidate rejects ICO extension mismatches, hostile directories and oversize files", async () => {
  const good = buildIco([pngEntry(32)]);
  const content = { value: good };
  const h = host({ fileContent: async () => ({ content: content.value.toString("base64"), contentEncoding: "base64", mimeType: "image/x-icon", sizeBytes: content.value.length }) });
  for (const path of ["public/logo.png", "public/logo.jpg", "public/logo.webp"]) {
    await assert.rejects(h.call("readCandidate", { projectId, path }), /not a supported image/, path);
  }
  content.value = png;
  await assert.rejects(h.call("readCandidate", { projectId, path: "public/favicon.ico" }), /not a supported image/);
  content.value = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>");
  await assert.rejects(h.call("readCandidate", { projectId, path: "public/favicon.ico" }), /not a supported image/);
  content.value = patchedCopy(good, copy => copy.writeUInt16LE(2, 2));
  await assert.rejects(h.call("readCandidate", { projectId, path: "public/favicon.ico" }), /not a supported image/);
  const hostile = {
    truncated: good.subarray(0, good.length - 1),
    "offset out of bounds": patchedCopy(good, copy => copy.writeUInt32LE(good.length + 1, 18)),
    "entry count": patchedCopy(good, copy => copy.writeUInt16LE(0xffff, 4)),
  };
  for (const [name, bytes] of Object.entries(hostile)) {
    content.value = bytes;
    await assert.rejects(h.call("readCandidate", { projectId, path: "public/favicon.ico" }), /malformed or unsupported/, name);
  }
  const lying = pngEntry(32);
  lying.data = patchedCopy(lying.data, copy => { copy.writeUInt32BE(8192, 16); copy.writeUInt32BE(8192, 20); });
  content.value = buildIco([lying]);
  await assert.rejects(h.call("readCandidate", { projectId, path: "public/favicon.ico" }), /no usable image/);
  const oversized = host({ fileContent: async () => ({ content: good.toString("base64"), contentEncoding: "base64", mimeType: "image/x-icon", sizeBytes: 3 * 1024 * 1024 }) });
  await assert.rejects(oversized.call("readCandidate", { projectId, path: "public/favicon.ico" }), /larger than 2 MB/);
  await oversized.dispose();
  await h.dispose();
});

test("readCandidate still returns PNG candidates unchanged", async () => {
  const h = host({ fileContent: async () => ({ content: png.toString("base64"), contentEncoding: "base64", mimeType: "image/png", sizeBytes: png.length }) });
  assert.deepEqual(await h.call("readCandidate", { projectId, path: "public/favicon.png" }), { base64: png.toString("base64"), mimeType: "image/png", sizeBytes: png.length });
  await assert.rejects(h.call("readCandidate", { projectId, path: "public/favicon.bmp" }), /Unsupported image path/);
  await h.dispose();
});
