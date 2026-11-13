import { PEER_TIMEOUT_MS, peerAvailability } from "./artwork-contract.ts";
import { withTimeout } from "./deadline.ts";
import { parseHexColor } from "./hint-color.ts";
import { PeerAbsent, guardedCall, isRecord, readPluginRows, type PeerCall } from "./peer-gate.ts";
import { threadspaceAppearance } from "./peers.ts";
import type { ScanDeps } from "./adoption.ts";

export const MAX_HINT_PROJECTS = 500;
const THREADSPACE_CHUNK = 200;
const HINT_TTL_MS = 20_000;
const STALE_MS = 30 * 60 * 1000;

export class HintsUnavailable extends Error {}

type Colors = Map<string, string>;
type HintPeer = {
  id: "project-themes" | "threadspace"; minVersion: readonly [number, number, number];
  read(call: PeerCall, wanted: string[]): Promise<Colors>;
};

async function projectThemes(call: PeerCall, wanted: string[]): Promise<Colors> {
  const reply = await call("list", null);
  if (!isRecord(reply) || !isRecord(reply.themes)) throw new Error("malformed reply");
  const colors: Colors = new Map();
  for (const id of wanted) {
    if (!Object.hasOwn(reply.themes, id)) continue;
    const theme = reply.themes[id];
    if (!isRecord(theme)) continue;
    const color = parseHexColor(theme.color);
    if (!color || (theme.threads === false && theme.browser === false && theme.background === false)) continue;
    colors.set(id, color);
  }
  return colors;
}

async function threadspaceColors(call: PeerCall, wanted: string[]): Promise<Colors> {
  const colors: Colors = new Map();
  for (let index = 0; index < wanted.length; index += THREADSPACE_CHUNK) {
    const chunk = wanted.slice(index, index + THREADSPACE_CHUNK);
    const appearance = threadspaceAppearance(await call("appearance_get", { projectIds: chunk }), chunk);
    if (!appearance) throw new Error("malformed reply");
    for (const [id, { color }] of appearance) if (color) colors.set(id, color);
  }
  return colors;
}

// Priority order: the first source with a colour for a project wins, and a failing source holds back the ones after it.
export const HINT_PEERS: readonly HintPeer[] = [
  { id: "project-themes", minVersion: [0, 1, 0], read: projectThemes },
  { id: "threadspace", minVersion: [0, 2, 2], read: threadspaceColors },
];

export type HintDeps = Pick<ScanDeps, "listPlugins" | "callPeer" | "capabilities" | "warn">;

export function createHintSource(deps: HintDeps, options: { now?: () => number; ttlMs?: number } = {}) {
  const { now = Date.now, ttlMs = HINT_TTL_MS } = options;
  const lastGood = new Map<string, { at: number; colors: Colors; ids: Set<string> }>();
  let cached: { key: string; at: number; colors: Record<string, string> } | null = null;
  let pending: { key: string; work: Promise<Record<string, string>> } | null = null;

  async function collect(wanted: string[], parent?: AbortSignal): Promise<Record<string, string>> {
    let listed: unknown;
    try { listed = await withTimeout(signal => deps.listPlugins(signal), PEER_TIMEOUT_MS, parent); }
    catch { throw new HintsUnavailable("plugin list unavailable"); }
    if (!Array.isArray(listed)) throw new HintsUnavailable("plugin list unavailable");
    const plugins = readPluginRows(listed);
    const sources: Colors[] = [];
    for (const peer of HINT_PEERS) {
      deps.capabilities.observe(peer.id, plugins.find(plugin => plugin.id === peer.id));
      const availability = peerAvailability(plugins, peer.id, peer.minVersion);
      if ("ok" in availability) {
        const call = guardedCall(deps.callPeer, deps.capabilities, { id: peer.id, version: availability.version }, parent);
        try {
          const colors = await peer.read(call, wanted);
          lastGood.set(peer.id, { at: now(), colors, ids: new Set(wanted) });
          sources.push(colors);
          continue;
        } catch (error) {
          if (error instanceof PeerAbsent) { lastGood.delete(peer.id); continue; }
          deps.warn(`Peer appearance unavailable (${peer.id}: ${error instanceof Error ? error.constructor.name : "unknown"})`);
        }
      } else if (availability.reason !== "not-running") { lastGood.delete(peer.id); continue; }
      const previous = lastGood.get(peer.id);
      if (previous && now() - previous.at <= STALE_MS && wanted.every(id => previous.ids.has(id))) sources.push(previous.colors);
      else if (peer !== HINT_PEERS[HINT_PEERS.length - 1]) throw new HintsUnavailable(`${peer.id} unavailable`);
    }
    const result: Record<string, string> = {};
    for (const id of wanted) {
      const color = sources.map(colors => colors.get(id)).find(value => value !== undefined);
      if (color) result[id] = color;
    }
    return result;
  }

  return {
    read(projectIds: string[], parent?: AbortSignal): Promise<Record<string, string>> {
      const wanted = [...new Set(projectIds)].slice(0, MAX_HINT_PROJECTS);
      const key = wanted.join(",");
      if (cached && cached.key === key && now() - cached.at < ttlMs) return Promise.resolve(cached.colors);
      if (pending?.key === key) return pending.work;
      const work = collect(wanted, parent).then(colors => { cached = { key, at: now(), colors }; return colors; })
        .finally(() => { if (pending?.work === work) pending = null; });
      pending = { key, work };
      return work;
    },
  };
}
