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

const idSchema = z.string().regex(/^proj_[a-z0-9]{10,32}$/);
const imageSchema = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(90000);
const UNDO_MS = 15000;
const DISCOVERY_TIMEOUT_MS = 8000;
const MAX_UNDO_OFFERS = 16;
const undoSchema = z.object({ token: z.string().uuid(), expiresAt: z.number() });
export const rpcContract = defineRpcContract({
  list: { input: z.null(), output: z.object({ projects: z.array(z.object({ id: idSchema, name: z.string(), revision: z.number().nullable() })) }) },
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
    return { projects, index };
  });
  const projectExists = async (id: string): Promise<boolean> => (await bb.sdk.projects.list()).some((project) => project.id === id);
  const remove = (projectId: string, withUndo: boolean) => serialize(async () => {
    const index = await readIndex();
    const base64 = withUndo && projectId in index ? await bb.storage.kv.get<string>(`image:${projectId}`) : null;
    const removed = projectId in index;
    // KV has no multi-key transaction. Fail closed even on a partially failed write.
    offers.delete(projectId);
    prune();
    if (removed) await preserveIndexRevisions(index);
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
  class TimedOut extends Error {}
  const withTimeout = async <T>(work: (signal: AbortSignal) => Promise<T>, ms = DISCOVERY_TIMEOUT_MS, parent?: AbortSignal): Promise<T> => {
    const controller = new AbortController();
    const relay = () => controller.abort();
    if (parent?.aborted) relay(); else parent?.addEventListener("abort", relay, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new TimedOut("Repository search timed out")); }, ms);
    });
    try { return await Promise.race([work(controller.signal), expired]); }
    finally { clearTimeout(timer); parent?.removeEventListener("abort", relay); }
  };
  bb.rpc.register(rpcContract, {
    list: async () => {
      const { projects, index } = await reconcile();
      return { projects: projects.map((project) => ({ id: project.id, name: project.name, revision: index[project.id] ?? null })) };
    },
    save: ({ projectId, base64 }) => serialize(async () => {
      if (!(await projectExists(projectId))) throw new Error("Project not found");
      const bytes = decodePng(base64);
      const index = await readIndex();
      offers.delete(projectId);
      prune();
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
        )));
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
      const file = await withTimeout(signal => bb.sdk.projects.fileContent({ projectId, path, signal })).catch(error => {
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
        return {
          version: ICON_CONTRACT_VERSION, status: "found" as const, projectId, revision, source: "manual" as const, theme: "any" as const,
          mimeType: "image/png" as const, width: 64 as const, height: 64 as const, sizeBytes: Buffer.from(base64, "base64").length,
          base64, urlPath: iconHttpPath(projectId, revision),
        };
      });
    },
    peerArtwork: async ({ projectId }, context) => {
      if (context.experimental_caller.kind !== "client") throw new Error("Peer artwork is not available to other plugins");
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
  bb.http.route("GET", "/icon", async (context) => {
    const projectId = context.req.query("projectId") ?? "";
    if (!idSchema.safeParse(projectId).success) return context.text("Not found", 404);
    const base64 = await bb.storage.kv.get<string>(`image:${projectId}`);
    if (!base64) return context.text("Not found", 404);
    return new Response(Buffer.from(base64, "base64"), { headers: { "Content-Type": "image/png", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" } });
  });
}
