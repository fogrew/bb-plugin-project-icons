import test from "node:test";
import assert from "node:assert/strict";
import { PeerAbsent, createCapabilities, guardedCall } from "./lib/peer-gate.ts";
import { unknownMethod } from "./test-fixtures/peer-host.mjs";

const MINUTE = 60_000;
const row = (extra = {}) => ({ id: "threadspace", version: "0.2.2", enabled: true, status: "running", ...extra });
const peer = { id: "threadspace", version: "0.2.2" };

test("capability keys are bounded and the memory cannot grow without limit", () => {
  const capabilities = createCapabilities(() => 0);
  const long = "x".repeat(10_000);
  capabilities.markMissing({ id: "a".repeat(128) + "1", version: long }, "m".repeat(500));
  assert.equal(capabilities.isMissing({ id: "a".repeat(128) + "2", version: long + "different" }, "m".repeat(500)), true,
    "only the first 128 characters of an id, version or method take part in the key");
  for (let index = 0; index < 100; index += 1) capabilities.markMissing({ id: `peer-${index}`, version: "1.0.0" }, "list");
  assert.equal(capabilities.isMissing({ id: "peer-0", version: "1.0.0" }, "list"), false, "the oldest entries are evicted");
  assert.equal(capabilities.isMissing({ id: "peer-99", version: "1.0.0" }, "list"), true);
});

test("a missing method is forgotten when the plugin's state changes, so a restart is probed again", () => {
  const capabilities = createCapabilities(() => 0);
  capabilities.observe("threadspace", row());
  capabilities.markMissing(peer, "appearance_get");
  capabilities.observe("threadspace", row());
  assert.equal(capabilities.isMissing(peer, "appearance_get"), true, "an unchanged plugin stays remembered");
  for (const next of [row({ status: "starting" }), row(), row({ enabled: false }), row(), undefined, row()]) {
    capabilities.markMissing(peer, "appearance_get");
    capabilities.observe("threadspace", next);
    assert.equal(capabilities.isMissing(peer, "appearance_get"), false, JSON.stringify(next));
  }
  capabilities.markMissing({ id: "other", version: "1.0.0" }, "list");
  capabilities.observe("threadspace", row({ status: "crashed" }));
  assert.equal(capabilities.isMissing({ id: "other", version: "1.0.0" }, "list"), true, "other plugins keep their memory");
});

test("an unknown method seen right after a plugin changed state is remembered only briefly", () => {
  let clock = 0;
  const capabilities = createCapabilities(() => clock);
  capabilities.observe("threadspace", row({ status: "starting" }));
  clock = 10_000;
  capabilities.observe("threadspace", row());
  capabilities.markMissing(peer, "appearance_get");
  clock = 10_000 + 59_000;
  assert.equal(capabilities.isMissing(peer, "appearance_get"), true);
  clock = 10_000 + 61_000;
  assert.equal(capabilities.isMissing(peer, "appearance_get"), false, "re-probed after a minute");
  clock = 10 * MINUTE;
  capabilities.observe("threadspace", row());
  capabilities.markMissing(peer, "appearance_get");
  clock = 10 * MINUTE + 29 * MINUTE;
  assert.equal(capabilities.isMissing(peer, "appearance_get"), true, "a long-stable plugin keeps the full memory");
  clock = 10 * MINUTE + 31 * MINUTE;
  assert.equal(capabilities.isMissing(peer, "appearance_get"), false);
});

test("the guard maps unknown_method to an absent peer once and lets other failures through unremembered", async () => {
  const capabilities = createCapabilities(() => 0);
  const seen = [];
  let failure = unknownMethod();
  const callPeer = async (pluginId, method) => { seen.push([pluginId, method]); throw failure; };
  const call = guardedCall(callPeer, capabilities, peer);
  await assert.rejects(call("appearance_get", null), PeerAbsent);
  await assert.rejects(call("appearance_get", null), PeerAbsent);
  assert.equal(seen.length, 1, "the second call never reaches the peer");
  failure = new Error("boom");
  await assert.rejects(call("other", null), /boom/);
  await assert.rejects(call("other", null), /boom/);
  assert.equal(seen.length, 3, "an ordinary failure is not remembered");
  const hostileCode = guardedCall(async () => { throw Object.assign(new Error("x"), { code: { toString: () => "unknown_method" } }); }, capabilities, peer);
  await assert.rejects(hostileCode("third", null), /x/);
  const big = guardedCall(async () => ({ value: "x".repeat(12_000_001) }), capabilities, peer);
  await assert.rejects(big("fourth", null), /too large/);
  const cyclic = {};
  cyclic.self = cyclic;
  await assert.rejects(guardedCall(async () => cyclic, capabilities, peer)("fifth", null), /too large/);
});
