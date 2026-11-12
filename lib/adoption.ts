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
type Lookup = { found: Map<string, Found>; unresolved: Set<string> };

export const MAX_PEER_RESPONSE_CHARS = 12_000_000;

function withinResponseLimit(reply: unknown): boolean {
  try { return (JSON.stringify(reply)?.length ?? Infinity) <= MAX_PEER_RESPONSE_CHARS; }
  catch { return false; }
}

async function lookup(peer: PeerId, wanted: Target[], call: Call): Promise<Lookup> {
  const found = new Map<string, Found>();
  const unresolved = new Set<string>();
  if (peer === "homepage") {
    for (let index = 0; index < wanted.length; index += HOMEPAGE_CHUNK) {
      const chunk = wanted.slice(index, index + HOMEPAGE_CHUNK);
      try {
        const replies = await Promise.all(chunk.map(target => call("getProjectArtwork", { projectId: target.projectId })));
        replies.forEach((raw, offset) => {
          const reply = peerReply.safeParse(raw);
          if (!reply.success) unresolved.add(chunk[offset].projectId);
          else if (reply.data.kind === "image") found.set(chunk[offset].projectId, { http: true });
        });
      } catch {
        for (const target of wanted.slice(index)) unresolved.add(target.projectId);
        break;
      }
    }
    return { found, unresolved };
  }
  const spec = LIST_PEERS[peer];
  const entries = spec.entries(await call(spec.method, spec.input));
  if (!entries) throw new Error("malformed reply");
  const artwork = await decodeEntries(entries, new Set(wanted.map(target => target.projectId)));
  for (const [id, value] of artwork) found.set(id, { artwork: value });
  return { found, unresolved };
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
    if (!wanted.length) continue;
    const availability = peerAvailability(plugins, peer.id, peer.minVersion);
    if (!("ok" in availability)) {
      if (availability.reason === "not-running") pending = pending.filter(target => !wanted.includes(target));
      continue;
    }
    const call: Call = async (method, input) => {
      const reply = await withTimeout(signal => deps.callPeer(peer.id, method, input, signal), PEER_TIMEOUT_MS, parent);
      if (!withinResponseLimit(reply)) throw new Error("peer response too large");
      return reply;
    };
    let result: Lookup;
    try { result = await lookup(peer.id, wanted, call); }
    catch (error) {
      deps.warn(`Peer artwork unavailable (${peer.id}: ${error instanceof Error ? error.constructor.name : "unknown"})`);
      result = { found: new Map(), unresolved: new Set(wanted.map(target => target.projectId)) };
    }
    const settled = new Set<Target>();
    for (const target of wanted) {
      if (result.unresolved.has(target.projectId)) { settled.add(target); continue; }
      const hit = result.found.get(target.projectId);
      if (!hit) continue;
      settled.add(target);
      if (!("artwork" in hit)) {
        candidates.push({ projectId: target.projectId, peer: peer.id, revision: target.revision, transport: "http", hash: null, knownHash: target.knownHash });
      } else if (hit.artwork.hash !== target.knownHash) {
        candidates.push({
          projectId: target.projectId, peer: peer.id, revision: target.revision, transport: "inline", hash: hit.artwork.hash,
          knownHash: target.knownHash, mimeType: `image/${hit.artwork.format}`, base64: hit.artwork.bytes.toString("base64"),
        });
      }
    }
    pending = pending.filter(target => !settled.has(target));
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
