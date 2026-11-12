import test from "node:test";
import assert from "node:assert/strict";
import { createAdopter } from "./lib/auto-adopt.ts";
import { contentHash } from "./lib/content-hash.ts";
import { opaquePng, transparentPng } from "./test-fixtures/png.mjs";

const inline = (projectId, extra = {}) => ({
  projectId, peer: "cursor-sidebar", revision: null, transport: "inline", hash: "a".repeat(64), knownHash: null,
  mimeType: "image/png", base64: opaquePng.toString("base64"), ...extra,
});
const http = (projectId, extra = {}) => ({
  projectId, peer: "homepage", revision: null, transport: "http", hash: null, knownHash: null, ...extra,
});

function fake(rounds, { failNormalise = () => false } = {}) {
  const log = { scans: [], adopts: [], fetches: [], normalised: [] };
  const queue = [...rounds];
  const client = {
    scan: async input => { log.scans.push(input); return queue.length ? queue.shift() : { status: "ok", candidates: [] }; },
    adopt: async input => { log.adopts.push(input); return { status: "adopted" }; },
    fetchImage: async (projectId, signal) => {
      log.fetches.push({ projectId, signal });
      return new File([transparentPng], "homepage-icon.png", { type: "image/png" });
    },
    normalise: async file => {
      log.normalised.push(file);
      if (failNormalise(file)) throw new Error("decode failed");
      return "BASE64";
    },
  };
  return { client, log };
}
const ok = (...candidates) => ({ status: "ok", candidates });
const run = (adopter, extra = {}) => adopter.run({ signal: new AbortController().signal, ...extra });

test("adopts inline candidates through the shared normaliser with the server hash and revision", async () => {
  const { client, log } = fake([ok(inline("proj_aaaaaaaaaa", { revision: 7, knownHash: "b".repeat(64) }))]);
  const summary = await run(createAdopter(client));
  assert.deepEqual(summary, { adopted: 1, skipped: 0, failed: 0 });
  assert.deepEqual([log.normalised[0].name, log.normalised[0].type, log.normalised[0].size], ["peer-icon.png", "image/png", opaquePng.length]);
  assert.deepEqual(log.adopts, [{ projectId: "proj_aaaaaaaaaa", peer: "cursor-sidebar", hash: "a".repeat(64), base64: "BASE64", ifRevision: 7 }]);
  assert.equal(log.fetches.length, 0);
  assert.deepEqual(log.scans[1], { skip: ["proj_aaaaaaaaaa"] });
});

test("http candidates are fetched with a bounded signal, hashed and skipped when unchanged", async () => {
  const known = await contentHash(transparentPng);
  const { client, log } = fake([ok(http("proj_aaaaaaaaaa"), http("proj_bbbbbbbbbb", { revision: 3, knownHash: known }))]);
  const summary = await run(createAdopter(client));
  assert.deepEqual(summary, { adopted: 1, skipped: 1, failed: 0 });
  assert.deepEqual(log.fetches.map(item => item.projectId), ["proj_aaaaaaaaaa", "proj_bbbbbbbbbb"]);
  assert.equal(log.fetches[0].signal.aborted, false);
  assert.deepEqual([log.adopts.length, log.adopts[0].hash], [1, known]);
});

test("one failing candidate does not stop the others and failures are counted", async () => {
  const { client, log } = fake([ok(inline("proj_aaaaaaaaaa"), inline("proj_bbbbbbbbbb"))], { failNormalise: () => log.normalised.length === 1 });
  assert.deepEqual(await run(createAdopter(client)), { adopted: 1, skipped: 0, failed: 1 });
  assert.deepEqual(log.adopts.map(item => item.projectId), ["proj_bbbbbbbbbb"]);
  const broken = { ...fake([ok(inline("proj_aaaaaaaaaa", { base64: undefined }), http("proj_bbbbbbbbbb"))]) };
  broken.client.fetchImage = async () => { throw new Error("offline"); };
  assert.deepEqual(await run(createAdopter(broken.client)), { adopted: 0, skipped: 0, failed: 2 });
  const down = fake([]);
  down.client.scan = async () => { throw new Error("rpc down"); };
  assert.deepEqual(await run(createAdopter(down.client)), { adopted: 0, skipped: 0, failed: 1 });
});

test("runs are single-flight and rate limited, a forced request reruns once", async () => {
  let clock = 0;
  const gate = Promise.withResolvers();
  const { client, log } = fake([ok(inline("proj_aaaaaaaaaa"))]);
  const adopt = client.adopt;
  client.adopt = async input => { await gate.promise; return adopt(input); };
  const adopter = createAdopter(client, { minIntervalMs: 30000, now: () => clock });
  const first = run(adopter);
  for (let i = 0; i < 50 && !log.normalised.length; i += 1) await new Promise(resolve => setImmediate(resolve));
  assert.equal(await run(adopter), null, "second request while running is dropped");
  assert.equal(await run(adopter, { force: true }), null, "forced request is queued");
  gate.resolve();
  assert.deepEqual(await first, { adopted: 1, skipped: 0, failed: 0 });
  assert.equal(log.scans.length, 3, "one round plus its empty follow-up, then the queued rerun");
  clock = 10000;
  assert.equal(await run(adopter), null, "inside the interval");
  clock = 40000;
  assert.notEqual(await run(adopter), null);
  assert.notEqual(await run(adopter, { force: true }), null, "force ignores the interval");
});

test("rounds are bounded, disabled scans stop and aborts end the run", async () => {
  const endless = fake([ok(inline("proj_aaaaaaaaaa")), ok(inline("proj_bbbbbbbbbb")), ok(inline("proj_cccccccccc")), ok(inline("proj_dddddddddd"))]);
  await run(createAdopter(endless.client));
  assert.equal(endless.log.scans.length, 3);
  assert.deepEqual(endless.log.scans[2].skip, ["proj_aaaaaaaaaa", "proj_bbbbbbbbbb"]);
  const off = fake([{ status: "disabled", candidates: [inline("proj_aaaaaaaaaa")] }]);
  assert.deepEqual(await run(createAdopter(off.client)), { adopted: 0, skipped: 0, failed: 0 });
  assert.equal(off.log.adopts.length, 0);
  const controller = new AbortController();
  const aborted = fake([ok(inline("proj_aaaaaaaaaa"), inline("proj_bbbbbbbbbb"))]);
  const normalise = aborted.client.normalise;
  aborted.client.normalise = async file => { controller.abort(); return normalise(file); };
  await createAdopter(aborted.client).run({ signal: controller.signal });
  assert.equal(aborted.log.adopts.length, 1);
});

function persistent(candidates) {
  const state = fake([]);
  state.client.scan = async ({ skip }) => ({ status: "ok", candidates: candidates().filter(item => !skip.includes(item.projectId)) });
  return state;
}
const MINUTE = 60000;

test("a failing image is not retried until the backoff ends, the peer value changes or the user forces a run", async () => {
  let clock = 0;
  let current = inline("proj_aaaaaaaaaa");
  const { client, log } = persistent(() => [current]);
  client.normalise = async file => { log.normalised.push(file); throw new Error("decode failed"); };
  const adopter = createAdopter(client, { now: () => clock });
  assert.deepEqual(await run(adopter), { adopted: 0, skipped: 0, failed: 1 });
  clock += 40000;
  assert.deepEqual(await run(adopter), { adopted: 0, skipped: 1, failed: 0 });
  assert.equal(log.normalised.length, 1, "backed off");
  clock += 31 * MINUTE;
  assert.equal((await run(adopter)).failed, 1);
  assert.equal(log.normalised.length, 2, "retried after the backoff");
  clock += 40000;
  current = inline("proj_aaaaaaaaaa", { hash: "e".repeat(64) });
  assert.equal((await run(adopter)).failed, 1);
  assert.equal(log.normalised.length, 3, "a changed peer value is a new item");
  clock += 40000;
  assert.equal((await run(adopter)).skipped, 1);
  assert.equal((await run(adopter, { force: true })).failed, 1);
  assert.equal(log.normalised.length, 4, "force clears the backoff");
  const offline = persistent(() => [http("proj_bbbbbbbbbb")]);
  offline.client.fetchImage = async projectId => { offline.log.fetches.push({ projectId }); throw new Error("offline"); };
  const second = createAdopter(offline.client, { now: () => clock });
  await run(second);
  clock += 40000;
  assert.equal((await run(second)).skipped, 1);
  assert.equal(offline.log.fetches.length, 1, "a failed Homepage fetch is not repeated within the backoff");
});

test("unchanged Homepage images are not fetched again within the recheck window", async () => {
  let clock = 0;
  const known = await contentHash(transparentPng);
  const { client, log } = persistent(() => [http("proj_aaaaaaaaaa", { revision: 3, knownHash: known })]);
  const adopter = createAdopter(client, { now: () => clock });
  assert.deepEqual(await run(adopter), { adopted: 0, skipped: 1, failed: 0 });
  assert.equal(log.fetches.length, 1);
  clock += 40000;
  assert.deepEqual(await run(adopter), { adopted: 0, skipped: 1, failed: 0 });
  assert.equal(log.fetches.length, 1, "served from the known-hash memo");
  clock += 31 * MINUTE;
  await run(adopter);
  assert.equal(log.fetches.length, 2, "rechecked after the window");
  clock += 40000;
  await run(adopter, { force: true });
  assert.equal(log.fetches.length, 3, "force bypasses the memo");
  const changed = persistent(() => [http("proj_bbbbbbbbbb", { revision: 3, knownHash: "f".repeat(64) })]);
  const next = createAdopter(changed.client, { now: () => clock });
  assert.equal((await run(next)).adopted, 1, "a different hash is adopted");
  assert.equal(changed.log.adopts.length, 1);
});
