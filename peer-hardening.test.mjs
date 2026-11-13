import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { A, B, hostile, setup, url } from "./test-fixtures/peer-host.mjs";
import { opaquePng } from "./test-fixtures/png.mjs";
import { MAX_PEER_RESPONSE_CHARS } from "./lib/adoption.ts";

const SHAPES = {
  homepage: { method: "getProjectArtwork", good: { kind: "image" } },
  "cursor-sidebar": { method: "listProjectIcons", good: { icons: [{ projectId: A, icon: url(opaquePng) }] } },
  "nested-sidebar": { method: "listProjectIcons", good: { icons: [{ projectId: A, icon: { src: url(opaquePng) } }] } },
  "chat-sidebar": { method: "images_get", good: { [`project:${A}`]: url(opaquePng) } },
  "bb-sidebar": { method: "listProjectIconSettings", good: { projects: [{ id: A, name: "A", customPath: null, customUploadName: "a.png" }] } },
  threadspace: { method: "appearance_get", good: { [A]: { emoji: "😀", color: "red" } } },
};
const IDS = Object.keys(SHAPES);
const reply = (id, value) => id === "homepage"
  ? args => args.input.projectId === A ? value : { kind: "missing" }
  : value;
const peer = (id, value, extra = {}) => ({ reply: reply(id, value), ...extra });
const solo = (id, value, extra) => setup({ peers: { [id]: peer(id, value, extra) } });
const sentinel = { reply: { [A]: { emoji: "🎉", color: "blue" } } };
const lowerThan = id => id === "threadspace" ? {} : { threadspace: sentinel };
const served = host => host.calls.filter(item => item.pluginId === "threadspace").flatMap(item => item.input.projectIds ?? []);
const pristine = () => assert.deepEqual([Object.keys(Object.prototype), ({}).polluted], [[], undefined]);

test("every peer's good reply yields exactly one candidate for the matching project", async () => {
  for (const id of IDS) {
    const host = solo(id, SHAPES[id].good);
    assert.deepEqual((await host.scan()).candidates.map(item => [item.projectId, item.peer]), [[A, id]], id);
    assert.equal(host.calls.every(item => item.method === SHAPES[id].method), true, id);
    await host.dispose();
  }
});

test("a peer that is not installed, disabled, too old, incompatible or not running is never called", async () => {
  for (const id of IDS) {
    const states = [{ enabled: false }, { enabled: false, status: "disabled" }, { version: "0.0.1" }, { version: "garbage" },
      { status: "incompatible" }, { status: "starting" }, { status: "crashed" }, { status: "" }];
    for (const state of states) {
      const host = solo(id, SHAPES[id].good, state);
      assert.deepEqual(await host.scan(), { status: "ok", candidates: [] }, `${id} ${JSON.stringify(state)}`);
      assert.equal(host.calls.length, 0, `${id} ${JSON.stringify(state)}`);
      await host.dispose();
    }
    const missing = setup({ peers: {} });
    assert.deepEqual(await missing.scan(), { status: "ok", candidates: [] }, id);
    assert.equal(missing.calls.length, 0);
    await missing.dispose();
  }
});

test("garbage in the plugin list is ignored and no peer is called", async () => {
  const lists = ["nope", null, 7, {}, [null, 1, "x", [], {}, { id: "cursor-sidebar" },
    { id: "cursor-sidebar", version: 3, enabled: true, status: "running" },
    { id: "cursor-sidebar", version: "0.3.5", enabled: "yes", status: "running" },
    { id: "cursor-sidebar", version: "0.3.5", enabled: true, status: null }]];
  for (const pluginRows of lists) {
    const host = setup({ peers: { "cursor-sidebar": peer("cursor-sidebar", SHAPES["cursor-sidebar"].good) }, pluginRows });
    assert.deepEqual(await host.scan(), { status: "ok", candidates: [] }, JSON.stringify(pluginRows));
    assert.equal(host.calls.length, 0);
    await host.dispose();
  }
});

test("a missing RPC method degrades to an absent peer, is remembered per version and never blocks lower peers", async () => {
  for (const id of IDS.filter(item => item !== "threadspace")) {
    const peers = { [id]: { ...peer(id, SHAPES[id].good), unknownMethod: true }, ...lowerThan(id) };
    const host = setup({ peers });
    assert.deepEqual((await host.scan()).candidates.map(item => [item.projectId, item.peer]), [[A, "threadspace"]], `${id} yields to the next peer`);
    const first = host.calls.filter(item => item.pluginId === id).length;
    assert.ok(first >= 1, id);
    await host.scan();
    assert.equal(host.calls.filter(item => item.pluginId === id).length, first, `${id} is not asked again`);
    peers[id].version = "99.0.0";
    await host.scan();
    assert.ok(host.calls.filter(item => item.pluginId === id).length > first, `${id} is probed again after a version change`);
    await host.dispose();
  }
  const own = solo("threadspace", SHAPES.threadspace.good, { unknownMethod: true });
  assert.deepEqual((await own.scan()).candidates, []);
  await own.dispose();
});

test("a throwing peer yields nothing and blocks lower peers for the projects it would serve", async () => {
  for (const id of IDS.filter(item => item !== "threadspace")) {
    for (const failure of [new Error("boom"), Object.assign(new Error("denied"), { code: "forbidden" }), new TypeError("bad")]) {
      const host = setup({ peers: { [id]: peer(id, failure), ...lowerThan(id) } });
      assert.deepEqual((await host.scan()).candidates, [], `${id} ${failure.message}`);
      assert.deepEqual(served(host), [], `${id} blocks Threadspace`);
      await host.dispose();
    }
  }
  const own = solo("threadspace", new Error("boom"));
  assert.deepEqual((await own.scan()).candidates, []);
  await own.dispose();
});

test("a hanging peer times out and degrades to nothing", async () => {
  for (const id of IDS) {
    const host = setup({ peers: { [id]: { hang: true } } });
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const pending = host.scan();
      for (let i = 0; i < 400 && !host.calls.length; i += 1) await new Promise(resolve => setImmediate(resolve));
      mock.timers.tick(5000);
      assert.deepEqual((await pending).candidates, [], id);
    } finally { mock.timers.reset(); }
    await host.dispose();
  }
});

const MALFORMED = {
  homepage: [undefined, null, "image", 5, [], {}, { kind: 5 }, { kind: null }, { kind: undefined }, { kind: "weird" }, { kind: ["image"] }],
  "cursor-sidebar": [undefined, null, "x", 5, [], {}, { icons: null }, { icons: "x" }, { icons: {} },
    { icons: [null, 1, "x", [], {}, { projectId: null, icon: "x" }, { projectId: A }, { projectId: A, icon: 5 }, { projectId: A, icon: null },
      { projectId: A, icon: {} }, { projectId: 5, icon: url(opaquePng) }, { projectId: A, icon: ["x"] }] }],
  "nested-sidebar": [undefined, null, "x", [], {}, { icons: null }, { icons: [null, { projectId: A }, { projectId: A, icon: null },
    { projectId: A, icon: {} }, { projectId: A, icon: { src: 5 } }, { projectId: A, icon: { src: null } }, { projectId: A, icon: [] },
    { projectId: A, icon: "str" }, { projectId: 7, icon: { src: url(opaquePng) } }] }],
  "chat-sidebar": [undefined, null, "x", 5, [], [url(opaquePng)], { [`project:${A}`]: 5 }, { [`project:${A}`]: null },
    { [`project:${A}`]: {} }, { [`project:${A}`]: undefined }, { project: url(opaquePng), "custom:x": url(opaquePng) }, { [A]: url(opaquePng) }],
  "bb-sidebar": [undefined, null, "x", 5, [], {}, { projects: null }, { projects: "x" }, { projects: {} },
    { projects: [null, 1, "x", [], {}, { id: 5 }, { id: A }, { id: A, customPath: 5 }, { id: A, customPath: {} }, { id: A, customUploadName: false },
      { id: A, customPath: "", customUploadName: null }, { id: A, customPath: "   ", customUploadName: "" },
      { id: A, customPath: "x".repeat(5000) }, { id: A, customUploadName: ["a.png"] }, { id: null, customUploadName: "a.png" }] }],
  threadspace: [undefined, null, "x", 5, [], {}, { [A]: null }, { [A]: 5 }, { [A]: "😀" }, { [A]: [] }, { [A]: {} }, { [A]: { emoji: 5 } },
    { [A]: { emoji: ["😀"] } }, { [A]: { emoji: { value: "😀" } } }, { [A]: { emoji: null, color: 5 } }, { [A]: { emoji: undefined } },
    { [A]: { emoji: "\u{1F4C1}" } }, { [A]: { emoji: "😀😀" } }, { [A]: { emoji: "x".repeat(33) } }],
};

test("malformed replies, wrong field types and null or missing fields produce no candidates for every peer", async () => {
  for (const id of IDS) {
    for (const value of MALFORMED[id]) {
      const host = solo(id, value);
      assert.deepEqual(await host.scan(), { status: "ok", candidates: [] }, `${id} ${JSON.stringify(value)}`);
      await host.dispose();
    }
  }
  pristine();
});

test("valid rows beside garbage rows are still used", async () => {
  const cases = {
    "cursor-sidebar": { icons: [null, 1, { projectId: A, icon: 5 }, { projectId: A, icon: url(opaquePng) }] },
    "nested-sidebar": { icons: [null, { projectId: A, icon: { src: 5 } }, { projectId: A, icon: { src: url(opaquePng) } }] },
    "chat-sidebar": { x: 1, [`project:${B}`]: 5, [`project:${A}`]: url(opaquePng) },
    "bb-sidebar": { projects: [null, { id: 5 }, { id: A, customPath: 5 }, { id: A, customUploadName: "a.png" }] },
    threadspace: { [B]: 5, [A]: { emoji: "😀", color: "red" } },
  };
  for (const [id, value] of Object.entries(cases)) {
    const host = solo(id, value);
    assert.deepEqual((await host.scan()).candidates.map(item => [item.projectId, item.peer]), [[A, id]], id);
    await host.dispose();
  }
});

test("prototype-key hostile data never pollutes anything or yields candidates for those keys", async () => {
  const icon = JSON.stringify(url(opaquePng));
  const cases = {
    homepage: hostile('{"kind":"missing","__proto__":{"kind":"image","polluted":true},"constructor":{"prototype":{"polluted":true}}}'),
    "cursor-sidebar": hostile(`{"icons":[{"projectId":"__proto__","icon":${icon}},{"projectId":"constructor","icon":${icon}},{"projectId":"toString","icon":${icon}},{"projectId":"${A}","icon":${icon},"__proto__":{"polluted":true}}],"__proto__":{"polluted":true}}`),
    "nested-sidebar": hostile(`{"icons":[{"projectId":"__proto__","icon":{"src":${icon}}},{"projectId":"${A}","icon":{"src":${icon},"__proto__":{"polluted":true}}}]}`),
    "chat-sidebar": hostile(`{"__proto__":${icon},"project:__proto__":${icon},"constructor":${icon},"project:constructor":${icon},"project:toString":${icon},"project:${A}":${icon}}`),
    "bb-sidebar": hostile(`{"projects":[{"id":"__proto__","customUploadName":"x.png"},{"id":"constructor","customUploadName":"x.png"},{"id":"${A}","name":"A","customPath":null,"customUploadName":null,"__proto__":{"customPath":"x","customUploadName":"y","polluted":true}}],"__proto__":{"polluted":true}}`),
    threadspace: hostile('{"__proto__":{"emoji":"😀","color":"red","polluted":true},"constructor":{"emoji":"😀"},"toString":{"emoji":"😀"},"hasOwnProperty":{"emoji":"😀"},"proj_aaaaaaaaaa":{"emoji":"🎉","color":"red","__proto__":{"emoji":"💥"}}}'),
  };
  const expected = { homepage: [], "cursor-sidebar": [A], "nested-sidebar": [A], "chat-sidebar": [A], "bb-sidebar": [], threadspace: [A] };
  for (const id of IDS) {
    const host = solo(id, cases[id]);
    assert.deepEqual((await host.scan()).candidates.map(item => item.projectId), expected[id], id);
    await host.dispose();
    pristine();
  }
  const space = solo("threadspace", cases.threadspace);
  assert.equal((await space.scan()).candidates[0].emoji, "🎉", "own properties win over a hostile prototype key");
  await space.dispose();
});

test("oversize payloads, row floods and oversize strings are rejected", async () => {
  const filler = "x".repeat(MAX_PEER_RESPONSE_CHARS + 1);
  const flood = Array.from({ length: 5001 }, () => null);
  const cases = {
    homepage: args => ({ kind: "image", filler, project: args.input.projectId }),
    "cursor-sidebar": { icons: [{ projectId: A, icon: url(opaquePng) }], filler },
    "nested-sidebar": { icons: [{ projectId: A, icon: { src: url(opaquePng) } }], filler },
    "chat-sidebar": { [`project:${A}`]: url(opaquePng), filler },
    "bb-sidebar": { projects: [{ id: A, customUploadName: "a.png" }], filler },
    threadspace: { [A]: { emoji: "😀", color: "red" }, filler },
  };
  for (const id of IDS) {
    const host = setup({ peers: { [id]: { reply: cases[id] } } });
    assert.deepEqual((await host.scan()).candidates, [], `${id} oversize`);
    await host.dispose();
  }
  for (const [id, value] of [
    ["cursor-sidebar", { icons: [...flood, { projectId: A, icon: url(opaquePng) }] }],
    ["nested-sidebar", { icons: [...flood, { projectId: A, icon: { src: url(opaquePng) } }] }],
    ["bb-sidebar", { projects: [...flood, { id: A, customUploadName: "a.png" }] }],
  ]) {
    const host = solo(id, value);
    assert.deepEqual((await host.scan()).candidates, [], `${id} row flood`);
    await host.dispose();
  }
  const chat = solo("chat-sidebar", { [`project:${A}`]: `data:image/png;base64,${"A".repeat(400000)}` });
  assert.deepEqual((await chat.scan()).candidates, []);
  await chat.dispose();
});

test("the emoji transport never reaches the server as pre-rendered bytes and invalid candidates are rejected", async () => {
  const host = solo("threadspace", SHAPES.threadspace.good);
  const [candidate] = (await host.scan()).candidates;
  assert.equal(candidate.transport, "emoji");
  assert.equal("base64" in candidate, false);
  await assert.rejects(host.adopt({ ...candidate, peer: "threadspace" }, { base64: "not-a-png" }));
  await assert.rejects(host.adopt({ ...candidate, peer: "unknown-plugin" }));
  assert.equal((await host.row(A)).revision, null);
  await host.dispose();
});
