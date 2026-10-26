import test from "node:test";
import assert from "node:assert/strict";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./dist/server.js";

const projectId = "proj_aaaaaaaaaa", otherId = "proj_bbbbbbbbbb";
const png = Buffer.alloc(45);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
png.writeUInt32BE(13, 8); png.write("IHDR", 12);
png.writeUInt32BE(64, 16); png.writeUInt32BE(64, 20);
const base64 = png.toString("base64");
async function setup(t) {
  const projects = [{ id: projectId, name: "A" }, { id: otherId, name: "B" }];
  const { bb, harness } = createFakePluginHost({ pluginId: "project-icons", sdk: { projects: { list: async () => projects } } });
  const api = { ...bb, sdk: { projects: { list: async () => projects } }, storage: { ...bb.storage, kv: {
    get: bb.storage.kv.get.bind(bb.storage.kv), set: bb.storage.kv.set.bind(bb.storage.kv), delete: bb.storage.kv.delete.bind(bb.storage.kv),
  } } };
  plugin(api);
  t.after(() => harness.lifecycle.dispose());
  const call = (method, input) => harness.behavior.callRpc(method, input);
  const save = () => call("save", { projectId, base64 });
  const remove = () => call("removeWithUndo", { projectId });
  const restore = (offer, id = projectId) => call("restore", { projectId: id, token: offer.token });
  return { bb: api, harness, projects, call, save, remove, restore };
}

for (const method of ["remove", "removeWithUndo", "reconcile"]) {
  for (const persisted of [5000, 20000]) {
    test(`${method} retains the larger of a legacy index revision and watermark ${persisted}`, async t => {
      const s = await setup(t);
      await s.bb.storage.kv.set("index", { [projectId]: 10000 });
      await s.bb.storage.kv.set(`image:${projectId}`, base64);
      await s.bb.storage.kv.set("revisionHighwater", persisted);
      t.mock.method(Date, "now", () => 9999);
      if (method === "reconcile") {
        s.projects.shift();
        await s.call("list", null);
        s.projects.push({ id: projectId, name: "A" });
      } else await s.call(method, { projectId });
      const maximum = Math.max(10000, persisted);
      assert.equal(await s.bb.storage.kv.get("revisionHighwater"), maximum);
      const replacement = await s.harness.lifecycle.reload(plugin);
      t.after(() => replacement.harness.lifecycle.dispose());
      assert.ok((await replacement.harness.behavior.callRpc("save", { projectId, base64 })).revision > maximum);
    });
  }

  test(`legacy revision survives ${method}, reload and clock rollback without an existing highwater`, async t => {
    const s = await setup(t);
    const legacyRevision = 10000;
    await s.bb.storage.kv.set("index", { [projectId]: legacyRevision });
    await s.bb.storage.kv.set(`image:${projectId}`, base64);
    assert.equal(await s.bb.storage.kv.get("revisionHighwater"), undefined);
    t.mock.method(Date, "now", () => legacyRevision - 1);
    if (method === "reconcile") {
      s.projects.shift();
      await s.call("list", null);
      s.projects.push({ id: projectId, name: "A" });
    } else await s.call(method, { projectId });
    const replacement = await s.harness.lifecycle.reload(plugin);
    t.after(() => replacement.harness.lifecycle.dispose());
    const changed = Buffer.from(png); changed[44] = 5;
    const saved = await replacement.harness.behavior.callRpc("save", { projectId, base64: changed.toString("base64") });
    assert.ok(saved.revision > legacyRevision, `Revision ${saved.revision} reused the discarded legacy cache key`);
  });

  for (const failure of ["get", "set"]) {
    test(`${method} fails before discarding legacy data when highwater ${failure} fails`, async t => {
      const s = await setup(t);
      const legacyIndex = { [projectId]: 10000, [otherId]: 20000 };
      await s.bb.storage.kv.set("index", legacyIndex);
      await s.bb.storage.kv.set(`image:${projectId}`, base64);
      await s.bb.storage.kv.set(`image:${otherId}`, base64);
      const original = s.bb.storage.kv[failure];
      s.bb.storage.kv[failure] = async (key, ...args) => {
        if (key === "revisionHighwater") throw new Error("Highwater unavailable");
        return original(key, ...args);
      };
      if (method === "reconcile") s.projects.splice(0);
      await assert.rejects(method === "reconcile" ? s.call("list", null) : s.call(method, { projectId }));
      s.bb.storage.kv[failure] = original;
      assert.deepEqual(await s.bb.storage.kv.get("index"), legacyIndex);
      assert.equal(await s.bb.storage.kv.get(`image:${projectId}`), base64);
      assert.equal(await s.bb.storage.kv.get(`image:${otherId}`), base64);
      // The failed operation must not poison the shared queue.
      s.projects.splice(0, s.projects.length, { id: projectId, name: "A" }, { id: otherId, name: "B" });
      assert.ok((await s.save()).revision > 20000);
    });
  }

  for (const key of [`image:${projectId}`, "index"]) {
    test(`${method} keeps the legacy watermark when ${key} is written then reports failure`, async t => {
      const s = await setup(t);
      await s.bb.storage.kv.set("index", { [projectId]: 10000 });
      await s.bb.storage.kv.set(`image:${projectId}`, base64);
      t.mock.method(Date, "now", () => 9999);
      const mutation = key === "index" ? "set" : "delete";
      const original = s.bb.storage.kv[mutation];
      s.bb.storage.kv[mutation] = async (writtenKey, ...args) => {
        const result = await original(writtenKey, ...args);
        if (writtenKey === key) throw new Error("Write completed but acknowledgement failed");
        return result;
      };
      if (method === "reconcile") s.projects.shift();
      await assert.rejects(method === "reconcile" ? s.call("list", null) : s.call(method, { projectId }));
      s.bb.storage.kv[mutation] = original;
      assert.equal(await s.bb.storage.kv.get("revisionHighwater"), 10000);
      if (method === "reconcile") s.projects.push({ id: projectId, name: "A" });
      const replacement = await s.harness.lifecycle.reload(plugin);
      t.after(() => replacement.harness.lifecycle.dispose());
      assert.ok((await replacement.harness.behavior.callRpc("save", { projectId, base64 })).revision > 10000);
    });
  }
}

test("retention evicts oldest offers and reconciles removed projects", async (t) => {
  const s = await setup(t);
  let oldest, latest;
  for (let i = 0; i < 17; i++) {
    const id = `proj_${String(i).padStart(10, "0")}`;
    s.projects.push({ id, name: id });
    await s.call("save", { projectId: id, base64 });
    const { undo } = await s.call("removeWithUndo", { projectId: id });
    if (!oldest) oldest = { id, undo };
    latest = { id, undo };
  }
  assert.equal((await s.restore(oldest.undo, oldest.id)).status, "conflict");
  s.projects.pop();
  await s.call("list", null);
  assert.equal((await s.restore(latest.undo, latest.id)).status, "conflict");
});

test("failed validation leaves a valid removal offer usable", async (t) => {
  const s = await setup(t); await s.save();
  const { undo } = await s.remove();
  await assert.rejects(s.call("save", { projectId, base64: "bad=" }));
  assert.equal((await s.restore(undo)).status, "restored");
});

test("reload invalidates offers and reserves revisions across clock rollback", async (t) => {
  const s = await setup(t); const first = await s.save();
  const { undo } = await s.remove();
  const replacement = await s.harness.lifecycle.reload(plugin);
  t.after(() => replacement.harness.lifecycle.dispose());
  t.mock.method(Date, "now", () => 1);
  assert.equal((await replacement.harness.behavior.callRpc("restore", { projectId, token: undo.token })).status, "conflict");
  const saved = await replacement.harness.behavior.callRpc("save", { projectId, base64 });
  assert.ok(saved.revision > first.revision);
});

test("queued save wins over restore without overwriting the newer bytes", async (t) => {
  const s = await setup(t); await s.save();
  const { undo } = await s.remove();
  const changed = Buffer.from(png); changed[44] = 9;
  const saved = s.call("save", { projectId, base64: changed.toString("base64") });
  const restored = s.restore(undo);
  await saved;
  assert.equal((await restored).status, "conflict");
  assert.deepEqual(Buffer.from(await (await s.harness.behavior.fetchHttp("GET", `/icon?projectId=${projectId}`)).arrayBuffer()), changed);
});

test("restores exact bytes once, with fresh revisions at the same timestamp", async (t) => {
  t.mock.method(Date, "now", () => 1000);
  const s = await setup(t);
  const first = await s.save();
  const { undo } = await s.remove();
  assert.equal(undo.expiresAt, 16000);
  assert.equal((await s.restore(undo)).status, "restored");
  assert.equal((await s.restore(undo)).status, "conflict");
  const rows = await s.call("list", null);
  assert.ok(rows.projects[0].revision > first.revision);
  assert.equal(Buffer.from(await (await s.harness.behavior.fetchHttp("GET", `/icon?projectId=${projectId}`)).arrayBuffer()).toString("base64"), base64);
});

test("cross-project attempts cannot consume the rightful offer", async (t) => {
  const s = await setup(t); await s.save();
  const { undo } = await s.remove();
  assert.equal((await s.restore(undo, otherId)).status, "conflict");
  assert.equal((await s.restore(undo)).status, "restored");
});

for (const newer of ["save", "remove", "removeWithUndo"]) {
  test(`${newer} after removal invalidates restoration, including no-icon removal`, async (t) => {
    const s = await setup(t); await s.save();
    const { undo } = await s.remove();
    await s.call(newer, { projectId, ...(newer === "save" ? { base64 } : {}) });
    assert.equal((await s.restore(undo)).status, "conflict");
    assert.equal((await s.call("list", null)).projects[0].revision !== null, newer === "save");
  });
}

test("two clients restoring concurrently get exactly one success", async (t) => {
  const s = await setup(t); await s.save();
  const { undo } = await s.remove();
  const results = await Promise.all([s.restore(undo), s.restore(undo)]);
  assert.deepEqual(results.map(r => r.status).sort(), ["conflict", "restored"]);
});

test("expiry is checked after awaited lookup inside the mutation queue", async (t) => {
  const s = await setup(t); await s.save();
  const { undo } = await s.remove();
  let release, started;
  const gate = new Promise(r => { release = r; });
  const lookup = new Promise(r => { started = r; });
  s.bb.sdk.projects.list = async () => { started(); await gate; return s.projects; };
  const pending = s.restore(undo);
  await lookup;
  t.mock.method(Date, "now", () => undo.expiresAt);
  release();
  assert.equal((await pending).status, "expired");
});

test("expiry is checked after a delayed revision highwater read", async (t) => {
  const s = await setup(t); await s.save();
  const { undo } = await s.remove();
  const original = s.bb.storage.kv.get;
  let release, started;
  const gate = new Promise(r => { release = r; });
  const lookup = new Promise(r => { started = r; });
  s.bb.storage.kv.get = async key => {
    if (key === "revisionHighwater") { started(); await gate; }
    return original(key);
  };
  const pending = s.restore(undo);
  await lookup;
  t.mock.method(Date, "now", () => undo.expiresAt);
  release();
  assert.equal((await pending).status, "expired");
  assert.equal((await s.call("list", null)).projects[0].revision, null);
});

for (const method of ["save", "remove", "restore"]) {
  for (const key of ["index", `image:${projectId}`]) {
    test(`failed ${method} write to ${key} invalidates the old offer`, async (t) => {
      const s = await setup(t); await s.save();
      const { undo } = await s.remove();
      const original = s.bb.storage.kv.set.bind(s.bb.storage.kv);
      const deletion = s.bb.storage.kv.delete.bind(s.bb.storage.kv);
      s.bb.storage.kv.set = async (k, v) => { if (k === key) throw new Error("disk full"); return original(k, v); };
      s.bb.storage.kv.delete = async k => { if (k === key) throw new Error("disk full"); return deletion(k); };
      await assert.rejects(method === "restore" ? s.restore(undo) : s.call(method, { projectId, ...(method === "save" ? { base64 } : {}) }));
      s.bb.storage.kv.set = original; s.bb.storage.kv.delete = deletion;
      assert.equal((await s.restore(undo)).status, "conflict");
      await s.save(); // A rejected operation must not poison the queue.
    });
  }
}
