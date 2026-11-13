import test from "node:test";
import assert from "node:assert/strict";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./dist/server.js";
import { transparentPng, opaquePng, emojiPng } from "./test-fixtures/png.mjs";
import { parseVariants, pickIcon, withVariant, withoutVariant } from "./lib/theme-variants.ts";

const projectId = "proj_aaaaaaaaaa";
const otherId = "proj_bbbbbbbbbb";
const b64 = png => png.toString("base64");

async function host(projects = [{ id: projectId, name: "Demo" }, { id: otherId, name: "Other" }]) {
  const { bb, harness } = createFakePluginHost({ pluginId: "project-icons", sdk: { projects: { list: async () => projects } } });
  await plugin(bb);
  const call = (method, input) => harness.behavior.callRpc(method, input);
  const fetchBytes = async path => {
    const response = await harness.behavior.fetchHttp("GET", path);
    return { status: response.status, bytes: response.status === 200 ? Buffer.from(await response.arrayBuffer()) : null };
  };
  return { bb, harness, call, fetchBytes, projects };
}

test("storage written by 0.4 keeps working: single icons stay valid and no variants appear", async () => {
  const { bb, harness, call, fetchBytes } = await host();
  try {
    await bb.storage.kv.set("index", { [projectId]: 1700000000000 });
    await bb.storage.kv.set(`image:${projectId}`, b64(transparentPng));
    const { projects } = await call("list", null);
    assert.equal(projects[0].revision, 1700000000000);
    assert.deepEqual(projects[0].variants, { light: null, dark: null });
    assert.equal((await fetchBytes(`/icon?projectId=${projectId}`)).bytes.length, transparentPng.length);
    assert.deepEqual(await (await harness.behavior.fetchHttp("GET", "/icon-variants")).json(), {});
    for (const theme of [undefined, "light", "dark"]) {
      const found = await call("resolveIcon", { version: 1, projectId, ...(theme ? { theme } : {}) });
      assert.equal(found.status, "found");
      assert.equal(found.theme, "any");
      assert.equal(found.revision, 1700000000000);
      assert.equal(found.base64, b64(transparentPng));
    }
  } finally { await harness.lifecycle.dispose(); }
});

test("a variant needs a default icon and is served per theme", async () => {
  const { harness, call, fetchBytes } = await host();
  try {
    await assert.rejects(call("save", { projectId, base64: b64(opaquePng), theme: "dark" }), /default icon/);
    const base = await call("save", { projectId, base64: b64(transparentPng) });
    const dark = await call("save", { projectId, base64: b64(opaquePng), theme: "dark" });
    assert.ok(dark.revision > base.revision);
    const [row] = (await call("list", null)).projects;
    assert.equal(row.revision, base.revision);
    assert.deepEqual(row.variants, { light: null, dark: dark.revision });
    assert.equal((await fetchBytes(`/icon?projectId=${projectId}`)).bytes.length, transparentPng.length);
    assert.equal((await fetchBytes(`/icon?projectId=${projectId}&theme=dark`)).bytes.length, opaquePng.length);
    assert.equal((await fetchBytes(`/icon?projectId=${projectId}&theme=light`)).status, 404);
    assert.equal((await fetchBytes(`/icon?projectId=${projectId}&theme=sepia`)).status, 404);
    assert.deepEqual(await (await harness.behavior.fetchHttp("GET", "/icon-variants")).json(), { [projectId]: { dark: dark.revision } });
    assert.deepEqual(await (await harness.behavior.fetchHttp("GET", "/icons")).json(), { [projectId]: base.revision });
  } finally { await harness.lifecycle.dispose(); }
});

test("resolveIcon version 1 stays compatible and honours the optional theme", async () => {
  const ctx = await host();
  try {
    const base = await ctx.call("save", { projectId, base64: b64(transparentPng) });
    const dark = await ctx.call("save", { projectId, base64: b64(opaquePng), theme: "dark" });
    const plain = await ctx.call("resolveIcon", { version: 1, projectId });
    assert.equal(plain.theme, "any");
    assert.equal(plain.revision, base.revision);
    assert.equal(plain.urlPath, `/api/v1/plugins/project-icons/http/icon?projectId=${projectId}&v=${base.revision}`);
    const asLight = await ctx.call("resolveIcon", { version: 1, projectId, theme: "light" });
    assert.equal(asLight.theme, "any");
    assert.equal(asLight.revision, base.revision);
    const asDark = await ctx.call("resolveIcon", { version: 1, projectId, theme: "dark" });
    assert.equal(asDark.status, "found");
    assert.equal(asDark.theme, "dark");
    assert.equal(asDark.revision, dark.revision);
    assert.equal(asDark.base64, b64(opaquePng));
    assert.equal(asDark.sizeBytes, opaquePng.length);
    assert.equal(asDark.urlPath, `/api/v1/plugins/project-icons/http/icon?projectId=${projectId}&theme=dark&v=${dark.revision}`);
    assert.equal((await ctx.call("resolveIcon", { version: 1, projectId, theme: "dark", ifRevision: dark.revision })).status, "not-modified");
    assert.equal((await ctx.call("resolveIcon", { version: 1, projectId, theme: "dark", ifRevision: base.revision })).status, "found");
    assert.equal((await ctx.call("resolveIcon", { version: 2, projectId, theme: "dark" })).status, "unsupported-version");
    assert.equal((await ctx.call("resolveIcon", { version: 1, projectId: otherId, theme: "dark" })).status, "missing");
    await assert.rejects(ctx.call("resolveIcon", { version: 1, projectId, theme: "sepia" }));
  } finally { await ctx.harness.lifecycle.dispose(); }
});

test("removing a variant keeps the default; removing the default removes variants and Undo restores them", async () => {
  const { bb, harness, call, fetchBytes } = await host();
  try {
    const base = await call("save", { projectId, base64: b64(transparentPng) });
    const light = await call("save", { projectId, base64: b64(opaquePng), theme: "light" });
    const dark = await call("save", { projectId, base64: b64(emojiPng), theme: "dark" });
    const withoutDark = await call("removeWithUndo", { projectId, theme: "dark" });
    assert.deepEqual(withoutDark, { removed: true, undo: null });
    assert.equal((await fetchBytes(`/icon?projectId=${projectId}&theme=dark`)).status, 404);
    assert.equal((await fetchBytes(`/icon?projectId=${projectId}&theme=light`)).bytes.length, opaquePng.length);
    assert.deepEqual(await call("remove", { projectId, theme: "dark" }), { removed: false });
    await call("save", { projectId, base64: b64(emojiPng), theme: "dark" });
    const { undo } = await call("removeWithUndo", { projectId });
    assert.ok(undo);
    assert.deepEqual((await call("list", null)).projects[0].variants, { light: null, dark: null });
    assert.equal((await fetchBytes(`/icon?projectId=${projectId}&theme=light`)).status, 404);
    assert.deepEqual(await bb.storage.kv.get("variants"), {});
    const restored = await call("restore", { projectId, token: undo.token });
    assert.equal(restored.status, "restored");
    const [row] = (await call("list", null)).projects;
    assert.ok(row.revision > light.revision && row.revision > dark.revision && row.revision > base.revision);
    assert.ok(row.variants.light > row.revision && row.variants.dark > row.variants.light);
    assert.equal((await fetchBytes(`/icon?projectId=${projectId}&theme=light`)).bytes.length, opaquePng.length);
    assert.equal((await fetchBytes(`/icon?projectId=${projectId}&theme=dark`)).bytes.length, emojiPng.length);
    assert.equal((await call("resolveIcon", { version: 1, projectId, theme: "dark" })).revision, row.variants.dark);
  } finally { await harness.lifecycle.dispose(); }
});

test("revisions are never reused after variants are removed or projects disappear", async () => {
  const projects = [{ id: projectId, name: "Demo" }];
  const { bb, harness, call } = await host(projects);
  try {
    await call("save", { projectId, base64: b64(transparentPng) });
    const dark = await call("save", { projectId, base64: b64(opaquePng), theme: "dark" });
    await call("remove", { projectId, theme: "dark" });
    assert.ok((await bb.storage.kv.get("revisionHighwater")) >= dark.revision);
    const next = await call("save", { projectId, base64: b64(opaquePng), theme: "dark" });
    assert.ok(next.revision > dark.revision);
    projects.length = 0;
    await call("list", null);
    assert.equal((await bb.storage.kv.list()).some(key => key.startsWith("image:")), false);
    assert.deepEqual(await bb.storage.kv.get("variants"), {});
    assert.ok((await bb.storage.kv.get("revisionHighwater")) >= next.revision);
  } finally { await harness.lifecycle.dispose(); }
});

test("a variant save marks the project manual so adoption cannot replace the default beneath it", async () => {
  const { bb, harness, call } = await host();
  try {
    await call("save", { projectId, base64: b64(transparentPng) });
    await bb.storage.kv.set("adoption", { [projectId]: { mode: "peer", pluginId: "homepage", importedAt: 1, hash: "sha256:" + "a".repeat(64), revision: 1 } });
    await call("save", { projectId, base64: b64(opaquePng), theme: "light" });
    assert.deepEqual((await bb.storage.kv.get("adoption"))[projectId], { mode: "manual" });
  } finally { await harness.lifecycle.dispose(); }
});

test("hostile or malformed stored variants are ignored", async () => {
  const { bb, harness, call, fetchBytes } = await host();
  try {
    await call("save", { projectId, base64: b64(transparentPng) });
    await bb.storage.kv.set("variants", JSON.parse(JSON.stringify({ [projectId]: { light: "7", dark: -1, extra: 1 }, nope: { dark: 3 }, [otherId]: [1] })
      .replace("{", '{"__proto__":{"light":5},"constructor":{"dark":9},')));
    assert.deepEqual((await call("list", null)).projects[0].variants, { light: null, dark: null });
    assert.deepEqual(await (await harness.behavior.fetchHttp("GET", "/icon-variants")).json(), {});
    assert.equal((await fetchBytes(`/icon?projectId=${projectId}&theme=light`)).status, 404);
  } finally { await harness.lifecycle.dispose(); }
});

test("variant helpers", () => {
  assert.deepEqual(parseVariants(null), {});
  assert.deepEqual(parseVariants({ [projectId]: { light: 4, dark: 0 } }), { [projectId]: { light: 4 } });
  assert.deepEqual(withVariant({}, projectId, "dark", 5), { [projectId]: { dark: 5 } });
  assert.deepEqual(withoutVariant({ [projectId]: { dark: 5, light: 6 } }, projectId, "dark"), { [projectId]: { light: 6 } });
  assert.deepEqual(withoutVariant({ [projectId]: { dark: 5 } }, projectId, "dark"), {});
  assert.deepEqual(withoutVariant({ [projectId]: { dark: 5 } }, projectId), {});
  assert.equal(pickIcon("dark", undefined, { dark: 5 }), null);
  assert.deepEqual(pickIcon("dark", 3, undefined), { revision: 3, theme: null });
  assert.deepEqual(pickIcon("dark", 3, { dark: 5 }), { revision: 5, theme: "dark" });
  assert.deepEqual(pickIcon("light", 3, { dark: 5 }), { revision: 3, theme: null });
});
