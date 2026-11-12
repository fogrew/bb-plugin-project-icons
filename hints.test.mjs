import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { A, B, hostile, setup, VERSIONS } from "./test-fixtures/peer-host.mjs";
import { MAX_PEER_RESPONSE_CHARS } from "./lib/adoption.ts";
import { HintsUnavailable, MAX_HINT_PROJECTS, createHintSource } from "./lib/hints.ts";
import { createCapabilities } from "./lib/peer-gate.ts";
import { createHintsStore, loadHints, parseHints } from "./lib/hints-store.ts";
import { parseHexColor } from "./lib/hint-color.ts";
import { THREADSPACE_COLORS } from "./lib/peers.ts";
import { contrast, foreground, palette } from "./lib/icon-presets.ts";

const theme = (color, extra = {}) => ({ color, threads: true, browser: false, background: false, ...extra });
const themes = value => ({ themes: value });
const space = entries => Object.fromEntries(entries.map(([id, color, emoji = null]) => [id, { emoji, color }]));
const pristine = () => assert.deepEqual([Object.keys(Object.prototype), ({}).polluted], [[], undefined]);

test("Project Themes colours become hints with the colour normalised", async () => {
  const host = setup({ peers: { "project-themes": { reply: themes({ [A]: theme("#AABBCC"), [B]: theme("#102030", { threads: false, background: true }) }) } } });
  assert.deepEqual(await host.hints(), { colors: { [A]: "#aabbcc", [B]: "#102030" } });
  assert.deepEqual(host.calls[0], { pluginId: "project-themes", method: "list", input: null });
  await host.dispose();
});

test("a theme with every surface switched off, or with a malformed colour, is not a hint", async () => {
  const off = { threads: false, browser: false, background: false };
  const bad = ["red", "#fff", "#GGGGGG", "#12345678", " #aabbcc", "#aabbcc ", "", null, undefined, 5, {}, ["#aabbcc"], "rgb(1,2,3)"];
  for (const color of bad) {
    const host = setup({ peers: { "project-themes": { reply: themes({ [A]: theme(color) }) } } });
    assert.deepEqual(await host.hints(), { colors: {} }, JSON.stringify(color));
    await host.dispose();
  }
  const host = setup({ peers: { "project-themes": { reply: themes({
    [A]: theme("#aabbcc", off), [B]: { color: "#112233", threads: "yes", browser: null },
  }) } } });
  assert.deepEqual(await host.hints(), { colors: { [B]: "#112233" } }, "only an explicit all-off theme is skipped");
  await host.dispose();
});

test("Project Themes replies of the wrong shape produce no hints", async () => {
  for (const reply of [themes({ [A]: null }), themes({ [A]: 5 }), themes({ [A]: [] }), themes({ [A]: "#aabbcc" }), themes({ [A]: {} }),
    themes({ other: theme("#aabbcc") })]) {
    const host = setup({ peers: { "project-themes": { reply } } });
    assert.deepEqual(await host.hints(), { colors: {} }, JSON.stringify(reply));
    await host.dispose();
  }
  for (const reply of [undefined, null, "x", 5, [], {}, themes(null), themes([]), themes("x"), new Error("boom")]) {
    const host = setup({ peers: { "project-themes": { reply }, threadspace: { reply: space([[A, "red"]]) } } });
    const response = await host.hintsResponse();
    assert.equal(response.status, 503, String(JSON.stringify(reply)));
    assert.deepEqual((await response.json()).colors, {});
    assert.equal(host.calls.some(item => item.pluginId === "threadspace"), false, "a structurally broken source holds back the next one");
    await host.dispose();
  }
});

test("Threadspace colours map by name and the default or unknown names are not hints", async () => {
  const host = setup({ peers: { threadspace: { reply: space([[A, "red"], [B, "default"]]) } } });
  assert.deepEqual(await host.hints(), { colors: { [A]: "#d44c47" } });
  assert.deepEqual(host.calls[0], { pluginId: "threadspace", method: "appearance_get", input: { projectIds: [A, B] } });
  await host.dispose();
  for (const color of ["magenta", "Red", "__proto__", "constructor", "toString", "hasOwnProperty", "", null, undefined, 5, {}, ["red"]]) {
    const odd = setup({ peers: { threadspace: { reply: space([[A, color]]) } } });
    assert.deepEqual(await odd.hints(), { colors: {} }, JSON.stringify(color));
    await odd.dispose();
  }
  for (const [name, hex] of THREADSPACE_COLORS) assert.equal(parseHexColor(hex), hex, name);
});

test("Project Themes wins over Threadspace per project and Threadspace fills the rest", async () => {
  const host = setup({ peers: {
    "project-themes": { reply: themes({ [A]: theme("#0000ff") }) },
    threadspace: { reply: space([[A, "red"], [B, "green"]]) },
  } });
  assert.deepEqual(await host.hints(), { colors: { [A]: "#0000ff", [B]: "#448361" } });
  await host.dispose();
});

test("hints respect the global toggle and absent, disabled, old or stopped peers", async () => {
  const peers = { "project-themes": { reply: themes({ [A]: theme("#0000ff") }) }, threadspace: { reply: space([[A, "red"]]) } };
  const off = setup({ peers });
  await off.call("setAutomaticAdoption", { enabled: false });
  assert.deepEqual(await off.hints(), { colors: {} });
  assert.equal(off.calls.length, 0, "no peer is called while automatic adoption is off");
  await off.dispose();
  for (const state of [{ enabled: false }, { version: "0.0.9" }, { status: "incompatible" }]) {
    const host = setup({ peers: { "project-themes": { ...peers["project-themes"], ...state }, threadspace: { ...peers.threadspace, ...state } } });
    assert.deepEqual(await host.hints(), { colors: {} }, JSON.stringify(state));
    assert.equal(host.calls.length, 0, JSON.stringify(state));
    await host.dispose();
  }
  const starting = setup({ peers: { "project-themes": { ...peers["project-themes"], status: "starting" }, threadspace: { ...peers.threadspace, status: "starting" } } });
  assert.equal((await starting.hintsResponse()).status, 503, "a plugin that is installed but not running is a failure, not an empty answer");
  assert.equal(starting.calls.length, 0);
  await starting.dispose();
  const none = setup({});
  assert.deepEqual(await none.hints(), { colors: {} });
  assert.equal(none.calls.length, 0);
  await none.dispose();
});

test("a peer without the method counts as absent and the next source still answers", async () => {
  const host = setup({ peers: {
    "project-themes": { reply: themes({ [A]: theme("#0000ff") }), unknownMethod: true },
    threadspace: { reply: space([[B, "red"]]) },
  } });
  const response = await host.hintsResponse();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { colors: { [B]: "#d44c47" } });
  await host.dispose();
});

test("a failing hints read is an error response that is never cached, so the browser keeps its colours", async () => {
  const host = setup({ peers: { "project-themes": { reply: themes({ [A]: theme("#0000ff") }) } } });
  host.control.listFails = true;
  const failed = await host.hintsResponse();
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { colors: {}, error: true });
  host.control.listFails = false;
  const recovered = await host.hintsResponse();
  assert.equal(recovered.status, 200);
  assert.deepEqual(await recovered.json(), { colors: { [A]: "#0000ff" } }, "the failure was not cached");
  host.control.listFails = true;
  assert.equal((await host.hintsResponse()).status, 200, "a good answer is served from the short cache");
  await host.dispose();
  const garbage = setup({ pluginRows: "nope" });
  assert.equal((await garbage.hintsResponse()).status, 503, "an unreadable plugin list is a failure, not an empty answer");
  await garbage.dispose();
});

test("a plugin list that hangs times out into an error response", async () => {
  const host = setup({ peers: { "project-themes": { reply: themes({ [A]: theme("#0000ff") }) } } });
  host.control.listHangs = true;
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = host.hintsResponse();
    for (let i = 0; i < 100; i += 1) await new Promise(resolve => setImmediate(resolve));
    mock.timers.tick(5000);
    assert.equal((await pending).status, 503);
  } finally { mock.timers.reset(); }
  host.control.listHangs = false;
  assert.deepEqual(await host.hints(), { colors: { [A]: "#0000ff" } });
  await host.dispose();
});

test("a failing or stopped Project Themes holds back Threadspace colours until it recovers", async () => {
  const peers = {
    "project-themes": { reply: new Error("boom") },
    threadspace: { reply: space([[A, "red"], [B, "green"]]) },
  };
  const host = setup({ peers });
  const failing = await host.hintsResponse();
  assert.equal(failing.status, 503);
  assert.equal(host.calls.some(item => item.pluginId === "threadspace"), false, "Threadspace is not even asked");
  peers["project-themes"].reply = themes({ [A]: theme("#0000ff") });
  assert.deepEqual(await host.hints(), { colors: { [A]: "#0000ff", [B]: "#448361" } });
  await host.dispose();
  const stopped = setup({ peers: {
    "project-themes": { reply: themes({ [A]: theme("#0000ff") }), status: "starting" },
    threadspace: { reply: space([[A, "red"]]) },
  } });
  assert.equal((await stopped.hintsResponse()).status, 503);
  assert.equal(stopped.calls.length, 0);
  await stopped.dispose();
  const alone = setup({ peers: { threadspace: { reply: new Error("boom") }, "project-themes": { reply: themes({ [A]: theme("#0000ff") }) } } });
  assert.deepEqual(await alone.hints(), { colors: { [A]: "#0000ff" } }, "a failing last source holds nothing back");
  await alone.dispose();
});

test("prototype-key hostile data and oversize replies never produce hints for foreign keys", async () => {
  const host = setup({ peers: {
    "project-themes": { reply: hostile('{"themes":{"__proto__":{"color":"#ff0000","threads":true,"polluted":true},"constructor":{"color":"#00ff00","threads":true},"toString":{"color":"#00ff00","threads":true},"proj_aaaaaaaaaa":{"color":"#0000ff","threads":true,"__proto__":{"color":"#ff0000"}}},"__proto__":{"polluted":true}}') },
    threadspace: { reply: hostile('{"__proto__":{"emoji":null,"color":"red","polluted":true},"constructor":{"color":"red"},"proj_bbbbbbbbbb":{"emoji":null,"color":"green","__proto__":{"color":"blue"}}}') },
  } });
  assert.deepEqual(await host.hints(), { colors: { [A]: "#0000ff", [B]: "#448361" } });
  pristine();
  await host.dispose();
  const big = "x".repeat(MAX_PEER_RESPONSE_CHARS + 1);
  const oversize = setup({ peers: {
    "project-themes": { reply: { ...themes({ [A]: theme("#0000ff") }), filler: big } },
    threadspace: { reply: { ...space([[B, "red"]]), filler: big } },
  } });
  const rejected = await oversize.hintsResponse();
  assert.equal(rejected.status, 503, "an oversize reply is a failure that holds back lower sources");
  assert.deepEqual((await rejected.json()).colors, {});
  assert.equal(oversize.calls.some(item => item.pluginId === "threadspace"), false);
  await oversize.dispose();
});

function source({ now, ttlMs = 1000, replies }) {
  const calls = [];
  const state = { plugins: [{ id: "project-themes", version: "0.1.0", enabled: true, status: "running" }], replies };
  const deps = {
    listPlugins: async () => state.plugins,
    callPeer: async (pluginId, method, input) => {
      calls.push({ pluginId, method, input });
      const value = typeof state.replies[pluginId] === "function" ? state.replies[pluginId]() : state.replies[pluginId];
      if (value instanceof Error) throw value;
      return value;
    },
    capabilities: createCapabilities(now),
    warn: () => {},
  };
  return { hints: createHintSource(deps, { now, ttlMs }), calls, state };
}

test("hints are cached for the TTL, single-flight and bounded", async () => {
  let clock = 0;
  const { hints, calls } = source({ now: () => clock, replies: { "project-themes": themes({ [A]: theme("#0000ff") }) } });
  const [first, second] = await Promise.all([hints.read([A, B]), hints.read([A, B])]);
  assert.deepEqual([first, second], [{ [A]: "#0000ff" }, { [A]: "#0000ff" }]);
  assert.equal(calls.length, 1);
  await hints.read([A, B]);
  assert.equal(calls.length, 1, "served from the cache");
  clock = 1500;
  await hints.read([A, B]);
  assert.equal(calls.length, 2, "refetched after the TTL");
  await hints.read([A]);
  assert.equal(calls.length, 3, "another project set is a different request");
  const many = source({ now: () => clock, replies: { "project-themes": themes({}) } });
  many.state.plugins.push({ id: "threadspace", version: "0.2.2", enabled: true, status: "running" });
  many.state.replies.threadspace = {};
  await many.hints.read(Array.from({ length: 700 }, (_, index) => `proj_${String(index).padStart(10, "0")}`));
  const asked = many.calls.filter(item => item.pluginId === "threadspace").flatMap(item => item.input.projectIds);
  assert.equal(asked.length, MAX_HINT_PROJECTS);
  assert.deepEqual(many.calls.filter(item => item.pluginId === "threadspace").map(item => item.input.projectIds.length), [200, 200, 100]);
});

test("a failing peer keeps its last colours for a while, then the read fails; an absent peer clears them", async () => {
  let clock = 0;
  const { hints, state } = source({ now: () => clock, ttlMs: 0, replies: { "project-themes": themes({ [A]: theme("#0000ff") }) } });
  assert.deepEqual(await hints.read([A]), { [A]: "#0000ff" });
  state.replies["project-themes"] = new Error("boom");
  clock = 60_000;
  assert.deepEqual(await hints.read([A]), { [A]: "#0000ff" }, "a transient failure keeps the colour");
  clock = 31 * 60_000;
  await assert.rejects(hints.read([A]), HintsUnavailable, "stale colours expire into an error, not an empty answer");
  state.replies["project-themes"] = themes({ [A]: theme("#0000ff") });
  assert.deepEqual(await hints.read([A]), { [A]: "#0000ff" });
  state.plugins[0].enabled = false;
  state.replies["project-themes"] = new Error("boom");
  assert.deepEqual(await hints.read([A]), {});
  state.plugins[0].enabled = true;
  await assert.rejects(hints.read([A]), HintsUnavailable, "nothing is resurrected after the peer was absent");
});

test("stale colours never cover a project they were not read for, and Threadspace waits for Project Themes", async () => {
  let clock = 0;
  const { hints, state, calls } = source({ now: () => clock, ttlMs: 0, replies: { "project-themes": themes({ [A]: theme("#0000ff") }) } });
  state.plugins.push({ id: "threadspace", version: "0.2.2", enabled: true, status: "running" });
  state.replies.threadspace = space([[A, "red"], [B, "green"]]);
  assert.deepEqual(await hints.read([A]), { [A]: "#0000ff" });
  state.replies["project-themes"] = new Error("boom");
  assert.deepEqual(await hints.read([A]), { [A]: "#0000ff" }, "the stale source keeps its own colours first");
  const asked = () => calls.filter(item => item.pluginId === "threadspace").length;
  const before = asked();
  await assert.rejects(hints.read([A, B]), HintsUnavailable, "a project the stale read never covered cannot take Threadspace's colour");
  assert.equal(asked(), before);
});

test("the hints loader treats a non-OK answer as a failure and the store keeps its colours", async () => {
  const answers = [new Response(JSON.stringify({ colors: { [A]: "#aabbcc" } })), new Response("{}", { status: 503 }),
    new Response(JSON.stringify({ colors: {}, error: true }), { status: 503 }), new Response(JSON.stringify({ colors: {} }))];
  let clock = 0;
  const store = createHintsStore(signal => loadHints(signal, async () => answers.shift()), () => clock);
  await store.refresh();
  assert.equal(store.get(A), "#aabbcc");
  for (let step = 0; step < 2; step += 1) {
    clock += 11_000;
    await store.refresh();
    assert.equal(store.get(A), "#aabbcc", "a 503 never clears the colours");
  }
  clock += 11_000;
  await store.refresh();
  assert.equal(store.get(A), null, "only a successful empty answer clears them");
});

test("the client hint store validates responses, notifies on change only and keeps the last good colours", async () => {
  assert.equal(parseHints(null), null);
  assert.equal(parseHints([]), null);
  assert.equal(parseHints({}), null);
  assert.equal(parseHints({ colors: null }), null);
  assert.equal(parseHints({ colors: [] }), null);
  assert.deepEqual([...parseHints({ colors: { [A]: "#AABBCC", bad: "#aabbcc", [B]: "red", proj_cccccccccc: 5, "proj_dddddddddd": "#123456" } })],
    [[A, "#aabbcc"], ["proj_dddddddddd", "#123456"]]);
  assert.deepEqual([...parseHints(hostile('{"colors":{"__proto__":"#aabbcc","constructor":"#aabbcc","proj_aaaaaaaaaa":"#aabbcc"}}'))], [[A, "#aabbcc"]]);
  pristine();
  let clock = 0;
  let next = { colors: { [A]: "#aabbcc" } };
  let loads = 0;
  const store = createHintsStore(async () => { loads += 1; if (next instanceof Error) throw next; return next; }, () => clock);
  let notified = 0;
  const unsubscribe = store.subscribe(() => { notified += 1; });
  await Promise.all([store.refresh(), store.refresh()]);
  assert.deepEqual([loads, notified, store.get(A), store.get(B)], [1, 1, "#aabbcc", null]);
  await store.refresh();
  assert.equal(loads, 1, "rate limited");
  clock = 11_000;
  await store.refresh();
  assert.deepEqual([loads, notified], [2, 1], "an unchanged answer does not notify");
  next = { colors: { [A]: "#aabbcc", [B]: "#010203" } };
  clock = 22_000;
  await store.refresh();
  assert.deepEqual([notified, store.get(B)], [2, "#010203"]);
  for (const bad of [new Error("offline"), { nope: true }, "x", null]) {
    next = bad;
    clock += 11_000;
    await store.refresh();
    assert.equal(store.get(B), "#010203", "a failed or malformed answer keeps the last colours");
  }
  next = { colors: {} };
  await store.refresh({ force: true });
  assert.deepEqual([store.get(A), notified], [null, 3], "an empty answer clears the hints");
  unsubscribe();
  next = { colors: { [A]: "#ffffff" } };
  await store.refresh({ force: true });
  assert.equal(notified, 3, "unsubscribed listeners are not called");
});

test("whatever colour a peer supplies, the chosen initials keep at least 4.5:1 contrast", () => {
  const hex = value => `#${value.toString(16).padStart(6, "0")}`;
  let worst = Infinity;
  for (let red = 0; red < 256; red += 5) {
    for (let green = 0; green < 256; green += 5) {
      for (let blue = 0; blue < 256; blue += 5) {
        const color = hex((red << 16) | (green << 8) | blue);
        worst = Math.min(worst, contrast(color, foreground(color)));
      }
    }
  }
  for (const color of [...THREADSPACE_COLORS.values(), ...palette.map(item => item.background), "#808080", "#767676", "#777777", "#ff0000", "#00ff00"]) {
    worst = Math.min(worst, contrast(color, foreground(color)));
  }
  assert.ok(worst >= 4.5, `worst contrast ${worst}`);
  assert.equal(VERSIONS["project-themes"], "0.1.0");
});
