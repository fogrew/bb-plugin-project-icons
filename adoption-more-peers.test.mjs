import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { A, B, defaultProject, readyEnvironment, setup, url } from "./test-fixtures/peer-host.mjs";
import { opaquePng } from "./test-fixtures/png.mjs";
import { isChosenEmoji } from "./lib/peers.ts";
import { fetchPeerImage } from "./lib/peer-image.ts";
import { peerImageRoute } from "./lib/artwork-contract.ts";

const settings = (...projects) => ({ projects: projects.map(([id, customPath = null, customUploadName = null]) => ({ id, name: id, customPath, customUploadName })) });
const appearance = entries => Object.fromEntries(entries.map(([id, emoji, color = "default"]) => [id, { emoji, color }]));
const bySource = candidates => candidates.map(item => [item.projectId, item.peer, item.transport]);

test("BB Sidebar uploads become http candidates that need no environment", async () => {
  const host = setup({ peers: { "bb-sidebar": { reply: settings([A, null, "logo.png"], [B]) } } });
  const { candidates } = await host.scan();
  assert.deepEqual(bySource(candidates), [[A, "bb-sidebar", "http"]]);
  assert.deepEqual([candidates[0].hash, candidates[0].base64, candidates[0].environmentId], [null, undefined, undefined]);
  assert.deepEqual(host.calls[0], { pluginId: "bb-sidebar", method: "listProjectIconSettings", input: {} });
  assert.equal(host.environmentCalls.length, 0);
  await host.dispose();
});

test("BB Sidebar path icons resolve the project's own environment through the SDK", async () => {
  const host = setup({
    peers: { "bb-sidebar": { reply: settings([A, "public/logo.png"]) } },
    listEnvironments: () => [
      readyEnvironment(A, { id: "env_other_host", hostId: "host_2" }),
      readyEnvironment(A, { id: "env_wrong_path", path: "/elsewhere" }),
      readyEnvironment(A, { id: "env_not_ready", status: "error" }),
      readyEnvironment(A, { id: "env_retiring", lifecycle: { phase: "retiring" } }),
      readyEnvironment("proj_zzzzzzzzzz", { id: "env_foreign" }),
      readyEnvironment(A, { id: "env bad id!" }),
      readyEnvironment(A, { id: "env_main" }),
    ],
  });
  const { candidates } = await host.scan();
  assert.deepEqual([candidates[0].peer, candidates[0].environmentId], ["bb-sidebar", "env_main"]);
  assert.deepEqual(host.environmentCalls.map(item => [item.projectId, item.status]), [[A, "ready"]]);
  await host.dispose();
});

test("BB Sidebar path icons fall back to the route's default host when no environment matches", async () => {
  for (const listEnvironments of [() => [], () => new Error("offline"), () => "nope", () => null, () => [null, 4, "x", {}, { id: "env_x" }]]) {
    const host = setup({ peers: { "bb-sidebar": { reply: settings([A, "logo.png"]) } }, listEnvironments });
    const { candidates } = await host.scan();
    assert.deepEqual(bySource(candidates), [[A, "bb-sidebar", "http"]]);
    assert.equal(candidates[0].environmentId, undefined);
    await host.dispose();
  }
});

test("BB Sidebar path icons are skipped cleanly, and block lower peers, when the project cannot be resolved", async () => {
  const wrong = [
    () => new Error("gone"), () => null, () => "x", () => ({}), () => ({ id: "other", sources: [] }),
    id => ({ ...defaultProject(id), sources: [] }), id => ({ ...defaultProject(id), sources: "x" }),
    id => ({ ...defaultProject(id), sources: [{ isDefault: true, path: "/x" }] }),
    id => ({ ...defaultProject(id), sources: [{ isDefault: true, hostId: 7, path: "/x" }] }),
  ];
  for (const getProject of wrong) {
    const host = setup({ peers: {
      "bb-sidebar": { reply: settings([A, "logo.png"]) },
      threadspace: { reply: appearance([[A, "😀"]]) },
    }, getProject });
    assert.deepEqual((await host.scan()).candidates, [], String(getProject("proj_aaaaaaaaaa")));
    const asked = host.calls.filter(item => item.pluginId === "threadspace").flatMap(item => item.input.projectIds);
    assert.deepEqual(asked, [B], "the lower peer waits instead of pinning the unresolved project");
    await host.dispose();
  }
});

test("a hanging project lookup times out and skips the BB Sidebar path icon", async () => {
  const host = setup({ peers: { "bb-sidebar": { reply: settings([A, "logo.png"]) } }, getProject: () => new Promise(() => {}) });
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = host.scan();
    for (let i = 0; i < 400 && !host.calls.length; i += 1) await new Promise(resolve => setImmediate(resolve));
    for (let i = 0; i < 50; i += 1) await new Promise(resolve => setImmediate(resolve));
    mock.timers.tick(5000);
    assert.deepEqual((await pending).candidates, []);
  } finally { mock.timers.reset(); }
  await host.dispose();
});

test("BB Sidebar projects without a custom icon are ignored even when its route would find one", async () => {
  const host = setup({ peers: { "bb-sidebar": { reply: settings([A, null, null], [B, "", "  "]) } } });
  assert.deepEqual((await host.scan()).candidates, []);
  assert.equal(host.environmentCalls.length, 0);
  await host.dispose();
});

test("peers rank in the documented order and BB Sidebar and Threadspace come last", async () => {
  const host = setup({ peers: {
    "cursor-sidebar": { reply: { icons: [{ projectId: A, icon: url(opaquePng) }] } },
    "bb-sidebar": { reply: settings([A, null, "a.png"], [B, null, "b.png"]) },
    threadspace: { reply: appearance([[A, "😀"], [B, "🎉"]]) },
  } });
  assert.deepEqual(bySource((await host.scan()).candidates), [[A, "cursor-sidebar", "inline"], [B, "bb-sidebar", "http"]]);
  assert.equal(host.calls.some(item => item.pluginId === "threadspace" && item.input.projectIds.length > 0), false,
    "Threadspace is asked only for projects nothing else served");
  await host.dispose();
  const solo = setup({ peers: { threadspace: { reply: appearance([[A, "😀"], [B, "🎉"]]) } } });
  assert.deepEqual(bySource((await solo.scan()).candidates), [[A, "threadspace", "emoji"], [B, "threadspace", "emoji"]]);
  await solo.dispose();
});

test("a failing BB Sidebar blocks Threadspace for its projects, a disabled one does not", async () => {
  const space = { reply: appearance([[A, "😀"]]) };
  for (const bad of [{ reply: new Error("boom") }, { reply: "nope" }, { reply: settings([A, null, "x.png"]), status: "starting" }]) {
    const host = setup({ peers: { "bb-sidebar": bad, threadspace: space } });
    assert.deepEqual((await host.scan()).candidates, [], JSON.stringify(bad.reply));
    assert.equal(host.calls.some(item => item.pluginId === "threadspace"), false);
    await host.dispose();
  }
  const off = setup({ peers: { "bb-sidebar": { reply: settings([A, null, "x.png"]), enabled: false }, threadspace: space } });
  assert.deepEqual(bySource((await off.scan()).candidates), [[A, "threadspace", "emoji"]]);
  await off.dispose();
});

test("an adopted BB Sidebar icon is refreshed only from BB Sidebar and keeps its provenance", async () => {
  const peers = { "bb-sidebar": { reply: settings([A, null, "a.png"]) } };
  const host = setup({ peers });
  const [candidate] = (await host.scan()).candidates;
  const adopted = await host.adopt({ ...candidate, hash: "a".repeat(64) });
  assert.equal(adopted.status, "adopted");
  assert.equal((await host.row(A)).source.pluginId, "bb-sidebar");
  peers.homepage = { reply: { kind: "image" } };
  host.calls.length = 0;
  const [refresh] = (await host.scan()).candidates.filter(item => item.projectId === A);
  assert.deepEqual([refresh.peer, refresh.knownHash], ["bb-sidebar", "a".repeat(64)]);
  assert.equal(host.calls.some(item => item.pluginId === "homepage" && item.input.projectId === A), false);
  await host.dispose();
});

test("Threadspace emoji become emoji candidates carrying a stable hash and no image bytes", async () => {
  const host = setup({ peers: { threadspace: { reply: appearance([[A, "😀", "red"], [B, null, "blue"]]) } } });
  const { candidates } = await host.scan();
  assert.equal(candidates.length, 1);
  const [candidate] = candidates;
  assert.deepEqual([candidate.projectId, candidate.peer, candidate.transport, candidate.emoji, candidate.base64], [A, "threadspace", "emoji", "😀", undefined]);
  assert.match(candidate.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(host.calls[0], { pluginId: "threadspace", method: "appearance_get", input: { projectIds: [A, B] } });
  assert.equal((await host.scan()).candidates[0].hash, candidate.hash);
  await host.dispose();
});

test("the Threadspace default folder and any non-emoji value are never imported", async () => {
  const defaults = ["\u{1F4C1}", "\u{1F4C1}️", null, "", "ab", "😀😀", "x".repeat(40), "‮", "<svg/>", "1", "#", "😀‮", "\u0000", 5, ["😀"], {}];
  for (const emoji of defaults) {
    const host = setup({ peers: { threadspace: { reply: { [A]: { emoji, color: "red" } } } } });
    assert.deepEqual((await host.scan()).candidates, [], JSON.stringify(emoji));
    await host.dispose();
  }
  for (const emoji of ["😀", "1️⃣", "\u{1F1FA}\u{1F1E6}", "👩🏽‍💻", "❤️", "\u{1F4C2}"]) {
    assert.equal(isChosenEmoji(emoji), true, emoji);
    const host = setup({ peers: { threadspace: { reply: { [A]: { emoji, color: "default" } } } } });
    assert.equal((await host.scan()).candidates[0].emoji, emoji);
    await host.dispose();
  }
});

test("a Threadspace icon is adopted once, refreshed on change and kept when the emoji is cleared or reset", async () => {
  const peer = { reply: appearance([[A, "😀"]]) };
  const host = setup({ peers: { threadspace: peer } });
  const first = (await host.scan()).candidates.find(item => item.projectId === A);
  const adopted = await host.adopt(first);
  assert.equal(adopted.status, "adopted");
  const row = await host.row(A);
  assert.deepEqual([row.automatic, row.source.pluginId], [true, "threadspace"]);
  assert.deepEqual((await host.scan()).candidates, [], "unchanged emoji stays quiet");
  peer.reply = appearance([[A, "🎉"]]);
  const [refresh] = (await host.scan()).candidates;
  assert.deepEqual([refresh.emoji, refresh.knownHash, refresh.hash === first.hash], ["🎉", first.hash, false]);
  assert.equal((await host.adopt(refresh)).status, "adopted");
  peer.reply = appearance([[A, null]]);
  assert.deepEqual((await host.scan()).candidates, []);
  peer.reply = appearance([[A, "\u{1F4C1}"]]);
  assert.deepEqual((await host.scan()).candidates, []);
  assert.equal((await host.row(A)).revision !== null, true, "vanished or default values keep the stored icon");
  await host.call("save", { projectId: A, base64: opaquePng.toString("base64") });
  peer.reply = appearance([[A, "🎈"]]);
  assert.deepEqual((await host.scan()).candidates, [], "a manual edit ends refreshing");
  await host.dispose();
});

test("the BB Sidebar image route carries the environment, is browser-session only and rejects SVG, ICO and failures", async () => {
  const signal = new AbortController().signal;
  const requests = [];
  const respond = (body, init) => (target, options) => { requests.push([target, options]); return Promise.resolve(new Response(body, init)); };
  const file = await fetchPeerImage(A, signal, respond(opaquePng), { peer: "bb-sidebar", environmentId: "env_main" });
  assert.deepEqual([file.name, file.type], ["bb-sidebar-icon.png", "image/png"]);
  assert.equal(requests[0][0], `/api/v1/plugins/bb-sidebar/http/project-icon?projectId=${A}&environmentId=env_main`);
  assert.deepEqual([requests[0][1].credentials, requests[0][1].redirect], ["same-origin", "error"]);
  await fetchPeerImage(A, signal, respond(opaquePng), { peer: "bb-sidebar" });
  assert.equal(requests[1][0], `/api/v1/plugins/bb-sidebar/http/project-icon?projectId=${A}`);
  await fetchPeerImage(A, signal, respond(opaquePng), { peer: "bb-sidebar", environmentId: "env&projectId=other" });
  assert.equal(requests[2][0], `/api/v1/plugins/bb-sidebar/http/project-icon?projectId=${A}`, "an unsafe environment id is dropped");
  await assert.rejects(fetchPeerImage(A, signal, respond("<svg xmlns='http://www.w3.org/2000/svg'/>", { headers: { "content-type": "image/svg+xml" } }), { peer: "bb-sidebar" }), /BB Sidebar image is not a PNG, JPEG or WebP/);
  await assert.rejects(fetchPeerImage(A, signal, respond(Buffer.from([0, 0, 1, 0, 1, 0, 16, 16]), { headers: { "content-type": "image/x-icon" } }), { peer: "bb-sidebar" }), /not a PNG, JPEG or WebP/);
  await assert.rejects(fetchPeerImage(A, signal, respond(null, { status: 404 }), { peer: "bb-sidebar" }), /BB Sidebar has no image/);
  await assert.rejects(fetchPeerImage(A, signal, respond(null, { status: 503 }), { peer: "bb-sidebar" }), /BB Sidebar has no image/);
  const before = requests.length;
  for (const peer of ["cursor-sidebar", "nested-sidebar", "chat-sidebar", "threadspace", "project-themes", "../evil"]) {
    await assert.rejects(fetchPeerImage(A, signal, respond(opaquePng), { peer }), /serves no project images/, peer);
  }
  assert.equal(requests.length, before, "only fixed peer routes are ever fetched");
  assert.equal(peerImageRoute("homepage", A), `/api/v1/plugins/homepage/http/project-icon?projectId=${A}`);
  assert.equal(peerImageRoute("bb-sidebar", "a b&c"), "/api/v1/plugins/bb-sidebar/http/project-icon?projectId=a%20b%26c");
});
