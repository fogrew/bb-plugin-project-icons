import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { decodePng } from "./lib/png-validation";
import {
  MAX_IMAGE_BYTES, SEARCH_QUERIES, extensionMatchesFormat, isAcceptedExtension, isDiscoverablePath, selectCandidates, sniffImage,
} from "./lib/icon-discovery";
import {
  ICON_CONTRACT_VERSION, PEER_PLUGIN_ID, PEER_TIMEOUT_MS, PLUGIN_ID, iconHttpPath, peerArtworkInput, peerArtworkOutput,
  peerAvailability, peerReply, resolveIconInput, resolveIconOutput,
} from "./lib/artwork-contract";
import { MAX_TARGETS, findCandidates, parseAdoption, targetFor, type AdoptionMap, type ScanDeps } from "./lib/adoption";
import { HASH_PATTERN } from "./lib/content-hash";
import { PEER_IDS } from "./lib/peers";
import { TimedOut, withTimeout } from "./lib/deadline";
import { createCapabilities } from "./lib/peer-gate";
import { ENVIRONMENT_ID, pickEnvironment } from "./lib/environment-pick";
import { createHintSource } from "./lib/hints";

const idSchema = z.string().regex(/^proj_[a-z0-9]{10,32}$/);
const imageSchema = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(90000);
const UNDO_MS = 15000;
const DISCOVERY_TIMEOUT_MS = 8000;
const MAX_UNDO_OFFERS = 16;
const SCAN_TIMEOUT_MS = 30000;
const HINT_TIMEOUT_MS = 15000;
const undoSchema = z.object({ token: z.string().uuid(), expiresAt: z.number() });
const hashSchema = z.string().regex(HASH_PATTERN);
const peerSchema = z.enum(PEER_IDS);
const candidateSchema = z.object({
  projectId: idSchema, peer: peerSchema, revision: z.number().nullable(), transport: z.enum(["inline", "http", "emoji"]),
  hash: hashSchema.nullable(), knownHash: hashSchema.nullable(),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(), base64: z.string().max(350000).optional(),
  environmentId: z.string().regex(ENVIRONMENT_ID).optional(), emoji: z.string().min(1).max(32).optional(),
});
export const rpcContract = defineRpcContract({
  list: {
    input: z.null(),
    output: z.object({
      automaticAdoption: z.boolean(),
      projects: z.array(z.object({
        id: idSchema, name: z.string(), revision: z.number().nullable(), automatic: z.boolean(),
        source: z.object({ pluginId: peerSchema, importedAt: z.number() }).nullable(),
      })),
    }),
  },
  save: { input: z.object({ projectId: idSchema, base64: imageSchema }).strict(), output: z.object({ revision: z.number() }) },
  remove: { input: z.object({ projectId: idSchema }).strict(), output: z.object({ removed: z.boolean() }) },
  removeWithUndo: { input: z.object({ projectId: idSchema }).strict(), output: z.object({ removed: z.boolean(), undo: undoSchema.nullable() }) },
  discover: {
    input: z.object({ projectId: idSchema }).strict(),
    output: z.object({
      status: z.enum(["ok", "unavailable"]),
      candidates: z.array(z.object({ path: z.string(), name: z.string() })),
      rejected: z.object({ svg: z.number(), unsupported: z.number() }),
      truncated: z.boolean(),
    }),
  },
  readCandidate: {
    input: z.object({ projectId: idSchema, path: z.string().max(240) }).strict(),
    output: z.object({ base64: z.string(), mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]), sizeBytes: z.number() }),
  },
  resolveIcon: { input: resolveIconInput, output: resolveIconOutput },
  peerArtwork: { input: peerArtworkInput, output: peerArtworkOutput },
  adoptionScan: {
    input: z.object({ skip: z.array(idSchema).max(64).optional() }).strict(),
    output: z.object({ status: z.enum(["ok", "disabled"]), candidates: z.array(candidateSchema).max(12) }),
  },
  adoptPeer: {
    input: z.object({ projectId: idSchema, peer: peerSchema, hash: hashSchema, base64: imageSchema, ifRevision: z.number().nullable() }).strict(),
    output: z.object({
      status: z.enum(["adopted", "skipped"]), revision: z.number().optional(),
      reason: z.enum(["disabled", "unknown-project", "manual", "stale", "unchanged"]).optional(),
    }),
  },
  setAutomaticAdoption: { input: z.object({ enabled: z.boolean() }).strict(), output: z.object({ enabled: z.boolean() }) },
  enableAutomatic: { input: z.object({ projectId: idSchema }).strict(), output: z.object({ status: z.enum(["enabled", "has-icon"]) }) },
  restore: { input: z.object({ projectId: idSchema, token: z.string().uuid() }).strict(), output: z.object({ status: z.enum(["restored", "expired", "conflict"]), revision: z.number().optional() }) },
});

type Index = Record<string, number>;

export default function plugin(bb: BbPluginApi) {
  type Offer = { token: string; expiresAt: number; deadline: number; base64: string };
  const offers = new Map<string, Offer>();
  let cleanup: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const prune = () => {
    if (cleanup) clearTimeout(cleanup);
    cleanup = undefined;
    for (const [id, offer] of offers) {
      if (performance.now() >= offer.deadline || Date.now() >= offer.expiresAt) offers.delete(id);
    }
    if (offers.size && !disposed) {
      const delay = Math.min(...Array.from(offers.values(), offer => offer.deadline - performance.now()));
      cleanup = setTimeout(prune, Math.max(1, delay));
      cleanup.unref();
    }
  };
  bb.onDispose(() => { disposed = true; if (cleanup) clearTimeout(cleanup); offers.clear(); });
  const readIndex = async (): Promise<Index> => (await bb.storage.kv.get<Index>("index")) ?? {};
  const preserveIndexRevisions = async (index: Index) => {
    const persisted = (await bb.storage.kv.get<number>("revisionHighwater")) ?? 0;
    let maximum = persisted;
    for (const value of Object.values(index)) maximum = Math.max(maximum, value);
    if (!Number.isSafeInteger(maximum)) throw new Error("Icon revision exhausted");
    // Legacy indexes can predate the watermark. Persist their maximum before discarding any revision.
    if (maximum > persisted) await bb.storage.kv.set("revisionHighwater", maximum);
  };
  const nextRevision = async (index: Index) => {
    let revision = Math.max(Date.now(), (await bb.storage.kv.get<number>("revisionHighwater")) ?? 0);
    for (const value of Object.values(index)) revision = Math.max(revision, value);
    revision += 1;
    if (!Number.isSafeInteger(revision)) throw new Error("Icon revision exhausted");
    return revision;
  };
  const readRecords = async (): Promise<AdoptionMap> => parseAdoption(await bb.storage.kv.get("adoption"));
  const writeRecords = (records: AdoptionMap) => bb.storage.kv.set("adoption", records);
  const markManual = async (projectId: string) => writeRecords({ ...await readRecords(), [projectId]: { mode: "manual" } });
  const automaticEnabled = async () => (await bb.storage.kv.get<boolean>("automaticAdoption")) !== false;
  const clientOnly = (context: { experimental_caller: { kind: string } }) => {
    if (context.experimental_caller.kind !== "client") throw new Error("Not available to other plugins");
  };
  let pending: Promise<void> = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const result = pending.then(work);
    pending = result.then(() => undefined, () => undefined);
    return result;
  };
  const reconcile = () => serialize(async () => {
    const projects = await bb.sdk.projects.list();
    const projectIds = new Set(projects.map((project) => project.id));
    for (const id of offers.keys()) if (!projectIds.has(id)) offers.delete(id);
    prune();
    const index = await readIndex();
    const orphanIds = Object.keys(index).filter(id => !projectIds.has(id));
    if (orphanIds.length) await preserveIndexRevisions(index);
    for (const id of orphanIds) {
      delete index[id];
      await bb.storage.kv.delete(`image:${id}`);
    }
    if (orphanIds.length) await bb.storage.kv.set("index", index);
    const records = await readRecords();
    const orphanRecords = Object.keys(records).filter(id => !projectIds.has(id));
    if (orphanRecords.length) {
      for (const id of orphanRecords) delete records[id];
      await writeRecords(records);
    }
    return { projects, index, records };
  });
  const projectExists = async (id: string): Promise<boolean> => (await bb.sdk.projects.list()).some((project) => project.id === id);
  const remove = (projectId: string, withUndo: boolean) => serialize(async () => {
    const index = await readIndex();
    const base64 = withUndo && projectId in index ? await bb.storage.kv.get<string>(`image:${projectId}`) : null;
    const removed = projectId in index;
    // KV has no multi-key transaction. Fail closed even on a partially failed write.
    offers.delete(projectId);
    prune();
    if (removed) { await markManual(projectId); await preserveIndexRevisions(index); }
    delete index[projectId];
    await bb.storage.kv.delete(`image:${projectId}`);
    await bb.storage.kv.set("index", index);
    let undo = null;
    if (base64 && base64.length <= 90000 && !disposed) {
      const offer = { token: randomUUID(), expiresAt: Date.now() + UNDO_MS, deadline: performance.now() + UNDO_MS, base64 };
      while (offers.size >= MAX_UNDO_OFFERS) offers.delete(offers.keys().next().value!);
      offers.set(projectId, offer);
      prune();
      undo = { token: offer.token, expiresAt: offer.expiresAt };
    }
    bb.realtime.publish("changed", { projectId });
    return { removed, undo };
  });
  const peerDeps: ScanDeps = {
    listPlugins: async signal => (await bb.sdk.plugins.list({ signal })).plugins,
    callPeer: (pluginId, method, input, signal) =>
      bb.sdk.plugins.callRpc({ pluginId, method, input, outputSchema: z.unknown(), signal }),
    resolveEnvironment: async (projectId, signal) => {
      const [project, environments] = await Promise.all([
        bb.sdk.projects.get({ projectId, signal }),
        (async () => bb.sdk.environments.list({ projectId, status: "ready", limit: 100, signal }))().catch(() => null),
      ]);
      return pickEnvironment(project, environments, projectId);
    },
    capabilities: createCapabilities(),
    warn: message => bb.log.warn(message),
  };
  const hintSource = createHintSource(peerDeps);
  let scanning: Promise<unknown> = Promise.resolve();
  let scanOffset = 0;
  const queueScan = <T>(work: () => Promise<T>): Promise<T> => {
    const result = scanning.then(work);
    scanning = result.then(() => undefined, () => undefined);
    return result;
  };
  bb.rpc.register(rpcContract, {
    list: async () => {
      const { projects, index, records } = await reconcile();
      return {
        automaticAdoption: await automaticEnabled(),
        projects: projects.map(project => {
          const record = records[project.id];
          const peer = record?.mode === "peer" && record.revision === index[project.id] ? record : null;
          return {
            id: project.id, name: project.name, revision: index[project.id] ?? null,
            automatic: targetFor(project.id, index[project.id], record) !== null,
            source: peer ? { pluginId: peer.pluginId, importedAt: peer.importedAt } : null,
          };
        }),
      };
    },
    save: ({ projectId, base64 }) => serialize(async () => {
      if (!(await projectExists(projectId))) throw new Error("Project not found");
      const bytes = decodePng(base64);
      const index = await readIndex();
      offers.delete(projectId);
      prune();
      await markManual(projectId);
      const revision = await nextRevision(index);
      // Reserve before image writes: failed mutations may leave gaps, never reused cache keys.
      await bb.storage.kv.set("revisionHighwater", revision);
      await bb.storage.kv.set(`image:${projectId}`, bytes.toString("base64"));
      await bb.storage.kv.set("index", { ...index, [projectId]: revision });
      bb.realtime.publish("changed", { projectId });
      return { revision };
    }),
    discover: async ({ projectId }) => {
      if (!(await projectExists(projectId))) throw new Error("Project not found");
      const empty = { candidates: [], rejected: { svg: 0, unsupported: 0 }, truncated: false };
      try {
        const results = await withTimeout(signal => Promise.all(SEARCH_QUERIES.map(
          query => bb.sdk.projects.files({ projectId, query, limit: "300", signal }),
        )), DISCOVERY_TIMEOUT_MS);
        const paths = results.flatMap(result => result.files.map(file => file.path));
        const selection = selectCandidates(paths);
        return { status: "ok" as const, ...selection, truncated: selection.truncated || results.some(result => result.truncated) };
      } catch (error) {
        bb.log.warn(`Repository icon discovery unavailable: ${error instanceof Error ? error.message : String(error)}`);
        return { status: "unavailable" as const, ...empty };
      }
    },
    readCandidate: async ({ projectId, path }) => {
      if (!isDiscoverablePath(path) || !isAcceptedExtension(path)) throw new Error("Unsupported image path");
      if (!(await projectExists(projectId))) throw new Error("Project not found");
      const file = await withTimeout(signal => bb.sdk.projects.fileContent({ projectId, path, signal }), DISCOVERY_TIMEOUT_MS).catch(error => {
        bb.log.warn(`Repository image read failed: ${error instanceof Error ? error.message : String(error)}`);
        throw new Error("Image could not be read");
      });
      if (file.sizeBytes > MAX_IMAGE_BYTES) throw new Error("Image is larger than 2 MB");
      if (file.contentEncoding !== "base64") throw new Error("Not an image file");
      const bytes = Buffer.from(file.content, "base64");
      if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Image is larger than 2 MB");
      const format = sniffImage(bytes);
      if (!format || !extensionMatchesFormat(path, format)) throw new Error("File content is not a supported image");
      return { base64: bytes.toString("base64"), mimeType: `image/${format}` as const, sizeBytes: bytes.length };
    },
    remove: async ({ projectId }) => ({ removed: (await remove(projectId, false)).removed }),
    removeWithUndo: ({ projectId }) => remove(projectId, true),
    resolveIcon: async ({ version, projectId, ifRevision, trail }) => {
      if (version !== ICON_CONTRACT_VERSION) return { version: ICON_CONTRACT_VERSION, status: "unsupported-version" as const, supportedVersions: [ICON_CONTRACT_VERSION] };
      if (trail?.includes(PLUGIN_ID)) return { version: ICON_CONTRACT_VERSION, status: "recursive" as const, projectId };
      const unknown = { version: ICON_CONTRACT_VERSION, status: "unknown-project" as const, projectId };
      if (!idSchema.safeParse(projectId).success) return unknown;
      if (!(await projectExists(projectId))) return unknown;
      return serialize(async () => {
        const revision = (await readIndex())[projectId];
        const base64 = revision === undefined ? null : await bb.storage.kv.get<string>(`image:${projectId}`);
        if (revision === undefined || !base64) return { version: ICON_CONTRACT_VERSION, status: "missing" as const, projectId };
        if (ifRevision === revision) return { version: ICON_CONTRACT_VERSION, status: "not-modified" as const, projectId, revision };
        const record = (await readRecords())[projectId];
        return {
          version: ICON_CONTRACT_VERSION, status: "found" as const, projectId, revision, source: "manual" as const, theme: "any" as const,
          mimeType: "image/png" as const, width: 64 as const, height: 64 as const, sizeBytes: Buffer.from(base64, "base64").length,
          base64, urlPath: iconHttpPath(projectId, revision),
          ...(record?.mode === "peer" && record.revision === revision ? { adoptedFrom: record.pluginId } : {}),
        };
      });
    },
    peerArtwork: async ({ projectId }, context) => {
      clientOnly(context);
      if (!(await projectExists(projectId))) throw new Error("Project not found");
      const unavailable = (reason: "timeout" | "error" | "malformed") => ({ status: "unavailable" as const, reason });
      try {
        return await withTimeout(async signal => {
          const availability = peerAvailability((await bb.sdk.plugins.list({ signal })).plugins);
          if (!("ok" in availability)) return { status: "unavailable" as const, reason: availability.reason };
          const raw = await bb.sdk.plugins.callRpc({
            pluginId: PEER_PLUGIN_ID, method: "getProjectArtwork", input: { projectId }, outputSchema: z.unknown(), signal,
          });
          const reply = peerReply.safeParse(raw);
          if (!reply.success) return unavailable("malformed");
          if (reply.data.kind === "missing") return { status: "none" as const };
          if (reply.data.kind === "glyph") return { status: "glyph" as const };
          return { status: "image" as const, pluginVersion: availability.version };
        }, PEER_TIMEOUT_MS, context.experimental_signal);
      } catch (error) {
        bb.log.warn(`Peer artwork unavailable (${error instanceof Error ? error.constructor.name : "unknown"})`);
        return unavailable(error instanceof TimedOut ? "timeout" : "error");
      }
    },
    adoptionScan: async ({ skip }, context) => {
      clientOnly(context);
      if (!(await automaticEnabled())) return { status: "disabled" as const, candidates: [] };
      const skipped = new Set(skip);
      const { projects, index, records } = await reconcile();
      const eligible = projects.flatMap(project => {
        const target = skipped.has(project.id) ? null : targetFor(project.id, index[project.id], records[project.id]);
        return target ? [target] : [];
      });
      const start = eligible.length ? scanOffset % eligible.length : 0;
      scanOffset += MAX_TARGETS;
      const window = [...eligible.slice(start), ...eligible.slice(0, start)];
      try {
        const candidates = await queueScan(() => withTimeout(
          signal => findCandidates(peerDeps, window, signal), SCAN_TIMEOUT_MS, context.experimental_signal));
        return { status: "ok" as const, candidates };
      } catch (error) {
        bb.log.warn(`Peer artwork scan failed (${error instanceof TimedOut ? "timeout" : "error"})`);
        return { status: "ok" as const, candidates: [] };
      }
    },
    adoptPeer: ({ projectId, peer, hash, base64, ifRevision }, context) => {
      clientOnly(context);
      return serialize(async () => {
        const skipped = (reason: "disabled" | "unknown-project" | "manual" | "stale" | "unchanged") => ({ status: "skipped" as const, reason });
        if (!(await automaticEnabled())) return skipped("disabled");
        if (!(await projectExists(projectId))) return skipped("unknown-project");
        const index = await readIndex();
        const records = await readRecords();
        const target = targetFor(projectId, index[projectId], records[projectId]);
        if (!target) return skipped("manual");
        if ((index[projectId] ?? null) !== ifRevision || (target.source !== null && target.source !== peer)) return skipped("stale");
        if (target.knownHash === hash) return skipped("unchanged");
        const bytes = decodePng(base64);
        const revision = await nextRevision(index);
        await bb.storage.kv.set("revisionHighwater", revision);
        await bb.storage.kv.set(`image:${projectId}`, bytes.toString("base64"));
        await bb.storage.kv.set("index", { ...index, [projectId]: revision });
        await writeRecords({ ...records, [projectId]: { mode: "peer", pluginId: peer, importedAt: Date.now(), hash, revision } });
        offers.delete(projectId);
        prune();
        bb.realtime.publish("changed", { projectId });
        bb.log.info(`Adopted artwork from ${peer}`);
        return { status: "adopted" as const, revision };
      });
    },
    setAutomaticAdoption: async ({ enabled }, context) => {
      clientOnly(context);
      await bb.storage.kv.set("automaticAdoption", enabled);
      bb.realtime.publish("changed", { adoption: true });
      return { enabled };
    },
    enableAutomatic: ({ projectId }, context) => {
      clientOnly(context);
      return serialize(async () => {
        if (!(await projectExists(projectId))) throw new Error("Project not found");
        const records = await readRecords();
        if (records[projectId]?.mode === "peer") return { status: "enabled" as const };
        if (projectId in await readIndex()) return { status: "has-icon" as const };
        delete records[projectId];
        await writeRecords(records);
        bb.realtime.publish("changed", { projectId });
        return { status: "enabled" as const };
      });
    },
    restore: ({ projectId, token }) => serialize(async () => {
      const exists = await projectExists(projectId);
      const index = await readIndex();
      const currentImage = await bb.storage.kv.get<string>(`image:${projectId}`);
      const revision = await nextRevision(index);
      const offer = offers.get(projectId);
      if (disposed || !offer || offer.token !== token) return { status: "conflict" as const };
      if (Date.now() >= offer.expiresAt || performance.now() >= offer.deadline) {
        offers.delete(projectId); prune();
        return { status: "expired" as const };
      }
      // Authority is checked and consumed in the mutation queue, after every awaited lookup.
      offers.delete(projectId); prune();
      if (!exists || projectId in index || currentImage) return { status: "conflict" as const };
      await bb.storage.kv.set("revisionHighwater", revision);
      await bb.storage.kv.set(`image:${projectId}`, offer.base64);
      await bb.storage.kv.set("index", { ...index, [projectId]: revision });
      bb.realtime.publish("changed", { projectId });
      return { status: "restored" as const, revision };
    }),
  });
  bb.http.route("GET", "/icons", async (context) => {
    const { index } = await reconcile();
    return context.json(index, 200, { "Cache-Control": "no-store" });
  });
  bb.http.route("GET", "/hints", async (context) => {
    const headers = { "Cache-Control": "no-store" };
    if (!(await automaticEnabled())) return context.json({ colors: {} }, 200, headers);
    try {
      const ids = (await bb.sdk.projects.list()).map(project => project.id).filter(id => idSchema.safeParse(id).success);
      const colors = await withTimeout(signal => hintSource.read(ids, signal), HINT_TIMEOUT_MS);
      return context.json({ colors }, 200, headers);
    } catch (error) {
      bb.log.warn(`Appearance hints unavailable (${error instanceof TimedOut ? "timeout" : "error"})`);
      return context.json({ colors: {} }, 200, headers);
    }
  });
  bb.http.route("GET", "/icon", async (context) => {
    const projectId = context.req.query("projectId") ?? "";
    if (!idSchema.safeParse(projectId).success) return context.text("Not found", 404);
    const base64 = await bb.storage.kv.get<string>(`image:${projectId}`);
    if (!base64) return context.text("Not found", 404);
    return new Response(Buffer.from(base64, "base64"), { headers: { "Content-Type": "image/png", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" } });
  });
}
