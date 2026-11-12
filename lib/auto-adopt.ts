import { contentHash } from "./content-hash.ts";
import type { Candidate } from "./adoption.ts";

const MAX_ROUNDS = 3;
const ITEM_TIMEOUT_MS = 15000;
const FAILURE_BACKOFF_MS = 30 * 60 * 1000;
const RECHECK_MS = 30 * 60 * 1000;
const MAX_MEMO = 256;
const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

export type AdoptClient = {
  scan(input: { skip: string[] }): Promise<{ status: "ok" | "disabled"; candidates: Candidate[] }>;
  adopt(input: { projectId: string; peer: Candidate["peer"]; hash: string; base64: string; ifRevision: number | null }):
    Promise<{ status: "adopted" | "skipped" }>;
  fetchImage(projectId: string, signal: AbortSignal, source?: { peer: Candidate["peer"]; environmentId?: string }): Promise<File>;
  normalise(file: File): Promise<string>;
  renderEmoji(emoji: string): Promise<string>;
};
export type RunSummary = { adopted: number; skipped: number; failed: number };
type RunOptions = { force?: boolean; signal: AbortSignal };

function inlineFile(candidate: Candidate): File {
  if (!candidate.base64 || !candidate.mimeType) throw new Error("Inline candidate has no image");
  const bytes = Uint8Array.from(atob(candidate.base64), char => char.charCodeAt(0));
  return new File([bytes], `peer-icon.${EXTENSIONS[candidate.mimeType]}`, { type: candidate.mimeType });
}

function remember<T>(map: Map<string, T>, key: string, value: T) {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_MEMO) map.delete(map.keys().next().value!);
}

export function createAdopter(client: AdoptClient, options: { minIntervalMs?: number; now?: () => number } = {}) {
  const { minIntervalMs = 30000, now = Date.now } = options;
  let running = false;
  let rerun = false;
  let last = -Infinity;
  const failures = new Map<string, number>();
  const unchanged = new Map<string, { hash: string; until: number }>();

  async function adoptEmoji(candidate: Candidate): Promise<"adopted" | "skipped"> {
    if (!candidate.emoji || !candidate.hash) throw new Error("Emoji candidate has no emoji");
    if (candidate.knownHash === candidate.hash) return "skipped";
    const base64 = await client.renderEmoji(candidate.emoji);
    const result = await client.adopt({
      projectId: candidate.projectId, peer: candidate.peer, hash: candidate.hash, base64, ifRevision: candidate.revision,
    });
    return result.status === "adopted" ? "adopted" : "skipped";
  }

  async function adoptOne(candidate: Candidate, signal: AbortSignal): Promise<"adopted" | "skipped"> {
    if (candidate.transport === "emoji") return adoptEmoji(candidate);
    const file = candidate.transport === "inline"
      ? inlineFile(candidate)
      : await client.fetchImage(candidate.projectId, AbortSignal.any([signal, AbortSignal.timeout(ITEM_TIMEOUT_MS)]), {
        peer: candidate.peer, ...(candidate.environmentId ? { environmentId: candidate.environmentId } : {}),
      });
    const hash = candidate.hash ?? await contentHash(new Uint8Array(await file.arrayBuffer()));
    if (candidate.knownHash === hash) {
      if (candidate.transport === "http") remember(unchanged, candidate.projectId, { hash, until: now() + RECHECK_MS });
      return "skipped";
    }
    const base64 = await client.normalise(file);
    const result = await client.adopt({ projectId: candidate.projectId, peer: candidate.peer, hash, base64, ifRevision: candidate.revision });
    return result.status === "adopted" ? "adopted" : "skipped";
  }

  async function pass(signal: AbortSignal, summary: RunSummary) {
    const skip = new Set<string>();
    for (let round = 0; round < MAX_ROUNDS && !signal.aborted; round += 1) {
      const { status, candidates } = await client.scan({ skip: [...skip].slice(-64) });
      if (status !== "ok" || !candidates.length) return;
      for (const candidate of candidates) {
        if (signal.aborted) return;
        skip.add(candidate.projectId);
        const key = `${candidate.projectId}|${candidate.peer}|${candidate.hash ?? ""}`;
        const known = unchanged.get(candidate.projectId);
        if ((failures.get(key) ?? 0) > now() ||
            (candidate.transport === "http" && known && known.until > now() && known.hash === candidate.knownHash)) {
          summary.skipped += 1;
          continue;
        }
        try { summary[await adoptOne(candidate, signal)] += 1; }
        catch { remember(failures, key, now() + FAILURE_BACKOFF_MS); summary.failed += 1; }
      }
    }
  }

  async function run({ force = false, signal }: RunOptions): Promise<RunSummary | null> {
    if (force) { failures.clear(); unchanged.clear(); }
    if (running) { if (force) rerun = true; return null; }
    if (!force && now() - last < minIntervalMs) return null;
    running = true;
    const summary: RunSummary = { adopted: 0, skipped: 0, failed: 0 };
    try {
      do {
        rerun = false;
        last = now();
        try { await pass(signal, summary); } catch { summary.failed += 1; }
      } while (rerun && !signal.aborted);
    } finally { running = false; }
    return summary;
  }
  return { run };
}
