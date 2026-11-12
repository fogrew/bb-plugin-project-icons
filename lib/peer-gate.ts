import { PEER_TIMEOUT_MS, type PluginRow } from "./artwork-contract.ts";
import { withTimeout } from "./deadline.ts";

export const MAX_PEER_RESPONSE_CHARS = 12_000_000;
const MAX_PLUGIN_ROWS = 2000;
const MAX_CAPABILITY_ENTRIES = 64;
const MAX_KEY_PART = 128;
const CAPABILITY_RECHECK_MS = 30 * 60 * 1000;
const FRESH_RECHECK_MS = 60 * 1000;
const FRESH_WINDOW_MS = 5 * 60 * 1000;

export type PeerInput = null | Record<string, string | string[]>;
export type CallPeer = (pluginId: string, method: string, input: PeerInput, signal: AbortSignal) => Promise<unknown>;
export type PeerCall = (method: string, input: PeerInput) => Promise<unknown>;
export type PeerRef = { id: string; version: string };

export class PeerAbsent extends Error {}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function readPluginRows(raw: unknown): PluginRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: PluginRow[] = [];
  for (const row of raw.slice(0, MAX_PLUGIN_ROWS)) {
    if (!isRecord(row)) continue;
    const { id, version, enabled, status } = row;
    if (typeof id === "string" && typeof version === "string" && typeof enabled === "boolean" && typeof status === "string") {
      rows.push({ id, version, enabled, status });
    }
  }
  return rows;
}

export function withinResponseLimit(reply: unknown): boolean {
  try { return (JSON.stringify(reply)?.length ?? Infinity) <= MAX_PEER_RESPONSE_CHARS; }
  catch { return false; }
}

export const isUnknownMethod = (error: unknown): boolean => isRecord(error) && error.code === "unknown_method";

const part = (value: string) => value.slice(0, MAX_KEY_PART);

export function createCapabilities(now: () => number = Date.now) {
  const missing = new Map<string, { peer: string; until: number }>();
  const seen = new Map<string, { signature: string; changedAt: number }>();
  const keyOf = (peer: PeerRef, method: string) => `${part(peer.id)}@${part(peer.version)}#${part(method)}`;
  const forget = (id: string) => { for (const [key, entry] of missing) if (entry.peer === id) missing.delete(key); };
  return {
    // A change in a plugin's version, enabled flag or status since the last look means it may have restarted: probe it again.
    observe(id: string, row: PluginRow | undefined) {
      const peer = part(id);
      const signature = row ? `${part(row.version)}|${row.enabled}|${part(row.status)}` : "absent";
      const prior = seen.get(peer);
      if (prior?.signature === signature) return;
      seen.set(peer, { signature, changedAt: now() });
      if (prior) forget(peer);
    },
    isMissing(peer: PeerRef, method: string): boolean {
      const key = keyOf(peer, method);
      const entry = missing.get(key);
      if (!entry) return false;
      if (entry.until <= now()) { missing.delete(key); return false; }
      return true;
    },
    markMissing(peer: PeerRef, method: string) {
      const key = keyOf(peer, method);
      const state = seen.get(part(peer.id));
      const fresh = !state || now() - state.changedAt < FRESH_WINDOW_MS;
      missing.delete(key);
      missing.set(key, { peer: part(peer.id), until: now() + (fresh ? FRESH_RECHECK_MS : CAPABILITY_RECHECK_MS) });
      while (missing.size > MAX_CAPABILITY_ENTRIES) missing.delete(missing.keys().next().value!);
    },
  };
}
export type Capabilities = ReturnType<typeof createCapabilities>;

export function guardedCall(callPeer: CallPeer, capabilities: Capabilities, peer: PeerRef, parent?: AbortSignal): PeerCall {
  return async (method, input) => {
    if (capabilities.isMissing(peer, method)) throw new PeerAbsent("method missing");
    let reply: unknown;
    try { reply = await withTimeout(signal => callPeer(peer.id, method, input, signal), PEER_TIMEOUT_MS, parent); }
    catch (error) {
      if (isUnknownMethod(error)) { capabilities.markMissing(peer, method); throw new PeerAbsent("method missing"); }
      throw error;
    }
    if (!withinResponseLimit(reply)) throw new Error("peer response too large");
    return reply;
  };
}
