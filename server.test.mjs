import test from "node:test";
import assert from "node:assert/strict";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./dist/server.js";

const projectId = "proj_aaaaaaaaaa";
const secondId = "proj_bbbbbbbbbb";
const png = Buffer.alloc(45);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
png.writeUInt32BE(13, 8);
png.write("IHDR", 12);
png.writeUInt32BE(64, 16);
png.writeUInt32BE(64, 20);

test("validates uploads, lists projects, serves and removes icons", async () => {
  const projects = [{ id: projectId, name: "Demo" }, { id: secondId, name: "Other" }];
  const { bb, harness } = createFakePluginHost({
    pluginId: "project-icons",
    sdk: { projects: { list: async () => projects } },
  });
  await plugin(bb);
  try {
    const initial = await harness.behavior.callRpc("list", null);
    assert.equal(initial.projects[0].revision, null);
    await assert.rejects(harness.behavior.callRpc("save", { projectId, base64: Buffer.from("<svg/>").toString("base64") }));
    await assert.rejects(harness.behavior.callRpc("save", { projectId: "proj_cccccccccc", base64: png.toString("base64") }));
    await assert.rejects(harness.behavior.callRpc("save", { projectId, base64: Buffer.alloc(65537).toString("base64") }));
    const saved = await harness.behavior.callRpc("save", { projectId, base64: png.toString("base64") });
    assert.ok(saved.revision > 0);
    assert.equal((await harness.behavior.callRpc("list", null)).projects[0].revision, saved.revision);
    const image = await harness.behavior.fetchHttp("GET", `/icon?projectId=${projectId}`);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal((await image.arrayBuffer()).byteLength, png.length);
    assert.equal((await harness.behavior.callRpc("remove", { projectId })).removed, true);
    assert.equal((await harness.behavior.callRpc("list", null)).projects[0].revision, null);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("concurrent edits retain both icons and deleted projects are pruned", async () => {
  const projects = [{ id: projectId, name: "Demo" }, { id: secondId, name: "Other" }];
  const { bb, harness } = createFakePluginHost({
    pluginId: "project-icons",
    sdk: { projects: { list: async () => projects } },
  });
  await plugin(bb);
  try {
    const base64 = png.toString("base64");
    await Promise.all([
      harness.behavior.callRpc("save", { projectId, base64 }),
      harness.behavior.callRpc("save", { projectId: secondId, base64 }),
    ]);
    assert.equal((await harness.behavior.callRpc("list", null)).projects.filter((row) => row.revision !== null).length, 2);
    await Promise.all([
      harness.behavior.callRpc("remove", { projectId }),
      harness.behavior.callRpc("save", { projectId: secondId, base64 }),
    ]);
    const rows = (await harness.behavior.callRpc("list", null)).projects;
    assert.equal(rows.find((row) => row.id === projectId).revision, null);
    assert.ok(rows.find((row) => row.id === secondId).revision);
    projects.splice(1, 1);
    await harness.behavior.callRpc("list", null);
    assert.equal((await harness.behavior.fetchHttp("GET", `/icon?projectId=${secondId}`)).status, 404);
    assert.deepEqual(await (await harness.behavior.fetchHttp("GET", "/icons")).json(), {});
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("reconciliation observes projects after earlier queued saves", async () => {
  const projects = [{ id: projectId, name: "Demo" }];
  let releaseFirstLookup;
  let firstLookupStarted;
  const firstLookupGate = new Promise((resolve) => { releaseFirstLookup = resolve; });
  const started = new Promise((resolve) => { firstLookupStarted = resolve; });
  let lookupCount = 0;
  const { bb, harness } = createFakePluginHost({
    pluginId: "project-icons",
    sdk: { projects: { list: async () => {
      lookupCount += 1;
      const snapshot = projects.map((project) => ({ ...project }));
      if (lookupCount === 1) {
        firstLookupStarted();
        await firstLookupGate;
      }
      return snapshot;
    } } },
  });
  await plugin(bb);
  try {
    const base64 = png.toString("base64");
    const firstSave = harness.behavior.callRpc("save", { projectId, base64 });
    await started;
    const secondSave = harness.behavior.callRpc("save", { projectId: secondId, base64 });
    const listing = harness.behavior.callRpc("list", null);
    projects.push({ id: secondId, name: "New project" });
    releaseFirstLookup();
    await Promise.all([firstSave, secondSave]);
    const rows = (await listing).projects;
    assert.ok(rows.find((row) => row.id === secondId)?.revision);
    assert.equal((await harness.behavior.fetchHttp("GET", `/icon?projectId=${secondId}`)).status, 200);
  } finally {
    await harness.lifecycle.dispose();
  }
});
