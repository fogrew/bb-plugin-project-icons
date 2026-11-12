import { z } from "zod";
import { HASH_PATTERN } from "./content-hash.ts";
import { PEERS, PEER_IDS, LIST_PEERS, decodeEntries, type InlineArtwork, type PeerId } from "./peers.ts";
import { PEER_TIMEOUT_MS, peerAvailability, peerReply, type PluginRow } from "./artwork-contract.ts";
import { withTimeout } from "./deadline.ts";

export const MAX_TARGETS = 20;
export const MAX_BATCH = 12;
const MAX_BATCH_CHARS = 1_500_000;
const HOMEPAGE_CHUNK = 4;

export const adoptionRecord = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("manual") }),
  z.object({
    mode: z.literal("peer"), pluginId: z.enum(PEER_IDS), importedAt: z.number(),
    hash: z.string().regex(HASH_PATTERN), revision: z.number(),
  }),
]);
export type AdoptionRecord = z.infer<typeof adoptionRecord>;
export type AdoptionMap = Record<string, AdoptionRecord>;

export function parseAdoption(raw: unknown): AdoptionMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).map(([id, value]) => {
    const parsed = adoptionRecord.safeParse(value);
    return [id, parsed.success ? parsed.data : { mode: "manual" as const }];
  }));
}

export type Target = { projectId: string; revision: number | null; source: PeerId | null; knownHash: string | null };

export function targetFor(projectId: string, revision: number | undefined, record: AdoptionRecord | undefined): Target | null {
  if (record?.mode === "manual") return null;
  if (record?.mode === "peer") {
    return record.revision === revision ? { projectId, revision, source: record.pluginId, knownHash: record.hash } : null;
  }
  return revision === undefined ? { projectId, revision: null, source: null, knownHash: null } : null;
}

export type Candidate = {
  projectId: string; peer: PeerId; revision: number | null; transport: "inline" | "http";
  hash: string | null; knownHash: string | null; mimeType?: "image/png" | "image/jpeg" | "image/webp"; base64?: string;
};

export type ScanDeps = {
  listPlugins(signal: AbortSignal): Promise<PluginRow[]>;
  callPeer(pluginId: string, method: string, input: null | Record<string, string>, signal: AbortSignal): Promise<unknown>;
  warn(message: string): void;
};
type Found = { artwork: InlineArtwork } | { http: true };
type Call = (method: string, input: null | Record<string, string>) => Promise<unknown>;

async function lookup(peer: PeerId, wanted: Target[], call: Call): Promise<Map<string, Found>> {
  const found = new Map<string, Found>();
  if (peer === "homepage") {
    try {
      for (let index = 0; index < wanted.length; index += HOMEPAGE_CHUNK) {
        const chunk = wanted.slice(index, index + HOMEPAGE_CHUNK);
        const replies = await Promise.all(chunk.map(target => call("getProjectArtwork", { projectId: target.projectId })));
        replies.forEach((raw, offset) => {
          const reply = peerReply.safeParse(raw);
          if (reply.success && reply.data.kind === "image") found.set(chunk[offset].projectId, { http: true });
        });
      }
    } catch { /* keep what earlier chunks found */ }
    return found;
  }
  const spec = LIST_PEERS[peer];
  const entries = spec.entries(await call(spec.method, spec.input));
  if (!entries) throw new Error("malformed reply");
  const artwork = await decodeEntries(entries, new Set(wanted.map(target => target.projectId)));
  for (const [id, value] of artwork) found.set(id, { artwork: value });
  return found;
}

export async function findCandidates(deps: ScanDeps, requested: Target[], parent?: AbortSignal): Promise<Candidate[]> {
  const targets = requested.slice(0, MAX_TARGETS);
  if (!targets.length) return [];
  let plugins: PluginRow[];
  try { plugins = await withTimeout(signal => deps.listPlugins(signal), PEER_TIMEOUT_MS, parent); }
  catch { deps.warn("Peer discovery unavailable"); return []; }
  const candidates: Candidate[] = [];
  let pending = targets;
  for (const peer of PEERS) {
    const wanted = pending.filter(target => target.source === null || target.source === peer.id);
    if (!wanted.length || !("ok" in peerAvailability(plugins, peer.id, peer.minVersion))) continue;
    const call: Call = (method, input) =>
      withTimeout(signal => deps.callPeer(peer.id, method, input, signal), PEER_TIMEOUT_MS, parent);
    let found: Map<string, Found>;
    try { found = await lookup(peer.id, wanted, call); }
    catch (error) {
      deps.warn(`Peer artwork unavailable (${peer.id}: ${error instanceof Error ? error.constructor.name : "unknown"})`);
      continue;
    }
    const resolved = new Set<Target>();
    for (const target of wanted) {
      const hit = found.get(target.projectId);
      if (!hit) continue;
      resolved.add(target);
      if (!("artwork" in hit)) {
        candidates.push({ projectId: target.projectId, peer: peer.id, revision: target.revision, transport: "http", hash: null, knownHash: target.knownHash });
      } else if (hit.artwork.hash !== target.knownHash) {
        candidates.push({
          projectId: target.projectId, peer: peer.id, revision: target.revision, transport: "inline", hash: hit.artwork.hash,
          knownHash: target.knownHash, mimeType: `image/${hit.artwork.format}`, base64: hit.artwork.bytes.toString("base64"),
        });
      }
    }
    pending = pending.filter(target => !resolved.has(target));
  }
  return trimBatch(candidates);
}

function trimBatch(candidates: Candidate[]): Candidate[] {
  const kept: Candidate[] = [];
  let chars = 0;
  for (const candidate of candidates) {
    chars += candidate.base64?.length ?? 0;
    if (kept.length >= MAX_BATCH || chars > MAX_BATCH_CHARS) break;
    kept.push(candidate);
  }
  return kept;
}
