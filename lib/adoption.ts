import { z } from "zod";
import { HASH_PATTERN } from "./content-hash.ts";
import {
  PEERS, PEER_IDS, LIST_PEERS, bbSidebarIcons, decodeEntries, emojiHash, threadspaceAppearance, type InlineArtwork, type PeerId,
} from "./peers.ts";
import { PEER_TIMEOUT_MS, peerAvailability, peerReply } from "./artwork-contract.ts";
import { withTimeout } from "./deadline.ts";
import {
  MAX_PEER_RESPONSE_CHARS, PeerAbsent, guardedCall, readPluginRows, type Capabilities, type CallPeer, type PeerCall,
} from "./peer-gate.ts";
import type { EnvironmentChoice } from "./environment-pick.ts";

export { MAX_PEER_RESPONSE_CHARS };

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
  projectId: string; peer: PeerId; revision: number | null; transport: "inline" | "http" | "emoji";
  hash: string | null; knownHash: string | null; mimeType?: "image/png" | "image/jpeg" | "image/webp"; base64?: string;
  environmentId?: string; emoji?: string;
};

export type ScanDeps = {
  listPlugins(signal: AbortSignal): Promise<unknown>;
  callPeer: CallPeer;
  resolveEnvironment(projectId: string, signal: AbortSignal): Promise<EnvironmentChoice | null>;
  capabilities: Capabilities;
  warn(message: string): void;
};
type Found = { artwork: InlineArtwork } | { http: true; environmentId?: string } | { emoji: string; hash: string };
type Lookup = { found: Map<string, Found>; unresolved: Set<string> };
type Context = { call: PeerCall; environment(projectId: string): Promise<EnvironmentChoice | null> };

async function lookupBbSidebar(wanted: Target[], { call, environment }: Context): Promise<Lookup> {
  const found = new Map<string, Found>();
  const unresolved = new Set<string>();
  const icons = bbSidebarIcons(await call("listProjectIconSettings", {}), new Set(wanted.map(target => target.projectId)));
  if (!icons) throw new Error("malformed reply");
  await Promise.all(wanted.map(async ({ projectId }) => {
    const kind = icons.get(projectId);
    if (!kind) return;
    if (kind === "upload") { found.set(projectId, { http: true }); return; }
    let choice: EnvironmentChoice | null = null;
    try { choice = await environment(projectId); } catch { choice = null; }
    if (!choice) unresolved.add(projectId);
    else found.set(projectId, choice.environmentId ? { http: true, environmentId: choice.environmentId } : { http: true });
  }));
  return { found, unresolved };
}

async function lookupThreadspace(wanted: Target[], { call }: Context): Promise<Lookup> {
  const found = new Map<string, Found>();
  const ids = wanted.map(target => target.projectId);
  const appearance = threadspaceAppearance(await call("appearance_get", { projectIds: ids }), ids);
  if (!appearance) throw new Error("malformed reply");
  for (const [projectId, { emoji }] of appearance) {
    if (emoji) found.set(projectId, { emoji, hash: await emojiHash(emoji) });
  }
  return { found, unresolved: new Set() };
}

async function lookup(peer: PeerId, wanted: Target[], context: Context): Promise<Lookup> {
  const { call } = context;
  const found = new Map<string, Found>();
  const unresolved = new Set<string>();
  if (peer === "bb-sidebar") return lookupBbSidebar(wanted, context);
  if (peer === "threadspace") return lookupThreadspace(wanted, context);
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
      } catch (error) {
        if (error instanceof PeerAbsent) throw error;
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
  let plugins: ReturnType<typeof readPluginRows>;
  try { plugins = readPluginRows(await withTimeout(signal => deps.listPlugins(signal), PEER_TIMEOUT_MS, parent)); }
  catch { deps.warn("Peer discovery unavailable"); return []; }
  const candidates: Candidate[] = [];
  let pending = targets;
  for (const peer of PEERS) {
    deps.capabilities.observe(peer.id, plugins.find(plugin => plugin.id === peer.id));
    const wanted = pending.filter(target => target.source === null || target.source === peer.id);
    if (!wanted.length) continue;
    const availability = peerAvailability(plugins, peer.id, peer.minVersion);
    if (!("ok" in availability)) {
      if (availability.reason === "not-running") pending = pending.filter(target => !wanted.includes(target));
      continue;
    }
    const context: Context = {
      call: guardedCall(deps.callPeer, deps.capabilities, { id: peer.id, version: availability.version }, parent),
      environment: projectId => withTimeout(signal => deps.resolveEnvironment(projectId, signal), PEER_TIMEOUT_MS, parent),
    };
    let result: Lookup;
    try { result = await lookup(peer.id, wanted, context); }
    catch (error) {
      if (error instanceof PeerAbsent) result = { found: new Map(), unresolved: new Set() };
      else {
        deps.warn(`Peer artwork unavailable (${peer.id}: ${error instanceof Error ? error.constructor.name : "unknown"})`);
        result = { found: new Map(), unresolved: new Set(wanted.map(target => target.projectId)) };
      }
    }
    const settled = new Set<Target>();
    for (const target of wanted) {
      if (result.unresolved.has(target.projectId)) { settled.add(target); continue; }
      const hit = result.found.get(target.projectId);
      if (!hit) continue;
      settled.add(target);
      if ("emoji" in hit) {
        if (hit.hash !== target.knownHash) {
          candidates.push({
            projectId: target.projectId, peer: peer.id, revision: target.revision, transport: "emoji",
            hash: hit.hash, knownHash: target.knownHash, emoji: hit.emoji,
          });
        }
      } else if ("http" in hit) {
        candidates.push({
          projectId: target.projectId, peer: peer.id, revision: target.revision, transport: "http", hash: null, knownHash: target.knownHash,
          ...(hit.environmentId ? { environmentId: hit.environmentId } : {}),
        });
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
