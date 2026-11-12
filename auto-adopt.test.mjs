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
