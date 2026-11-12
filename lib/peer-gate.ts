import { PEER_TIMEOUT_MS, type PluginRow } from "./artwork-contract.ts";
import { withTimeout } from "./deadline.ts";

export const MAX_PEER_RESPONSE_CHARS = 12_000_000;
const MAX_PLUGIN_ROWS = 2000;
const MAX_CAPABILITY_ENTRIES = 64;
const CAPABILITY_RECHECK_MS = 30 * 60 * 1000;

export type PeerInput = null | Record<string, string | string[]>;
export type CallPeer = (pluginId: string, method: string, input: PeerInput, signal: AbortSignal) => Promise<unknown>;
export type PeerCall = (method: string, input: PeerInput) => Promise<unknown>;

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

export function createCapabilities(now: () => number = Date.now) {
  const missing = new Map<string, number>();
  return {
    isMissing(key: string): boolean {
      const until = missing.get(key);
      if (until === undefined) return false;
      if (until <= now()) { missing.delete(key); return false; }
      return true;
    },
    markMissing(key: string) {
      missing.delete(key);
      missing.set(key, now() + CAPABILITY_RECHECK_MS);
      while (missing.size > MAX_CAPABILITY_ENTRIES) missing.delete(missing.keys().next().value!);
    },
  };
}
export type Capabilities = ReturnType<typeof createCapabilities>;

export function guardedCall(
  callPeer: CallPeer, capabilities: Capabilities, peer: { id: string; version: string }, parent?: AbortSignal,
): PeerCall {
  return async (method, input) => {
    const key = `${peer.id}@${peer.version}#${method}`;
    if (capabilities.isMissing(key)) throw new PeerAbsent("method missing");
    let reply: unknown;
    try { reply = await withTimeout(signal => callPeer(peer.id, method, input, signal), PEER_TIMEOUT_MS, parent); }
    catch (error) {
      if (isUnknownMethod(error)) { capabilities.markMissing(key); throw new PeerAbsent("method missing"); }
      throw error;
    }
    if (!withinResponseLimit(reply)) throw new Error("peer response too large");
    return reply;
  };
}
