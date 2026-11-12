import { contentHash } from "./content-hash.ts";
import type { Candidate } from "./adoption.ts";

const MAX_ROUNDS = 3;
const ITEM_TIMEOUT_MS = 15000;
const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

export type AdoptClient = {
  scan(input: { skip: string[] }): Promise<{ status: "ok" | "disabled"; candidates: Candidate[] }>;
  adopt(input: { projectId: string; peer: Candidate["peer"]; hash: string; base64: string; ifRevision: number | null }):
    Promise<{ status: "adopted" | "skipped" }>;
  fetchImage(projectId: string, signal: AbortSignal): Promise<File>;
  normalise(file: File): Promise<string>;
};
export type RunSummary = { adopted: number; skipped: number; failed: number };
type RunOptions = { force?: boolean; signal: AbortSignal };

function inlineFile(candidate: Candidate): File {
  if (!candidate.base64 || !candidate.mimeType) throw new Error("Inline candidate has no image");
  const bytes = Uint8Array.from(atob(candidate.base64), char => char.charCodeAt(0));
  return new File([bytes], `peer-icon.${EXTENSIONS[candidate.mimeType]}`, { type: candidate.mimeType });
}

export function createAdopter(client: AdoptClient, options: { minIntervalMs?: number; now?: () => number } = {}) {
  const { minIntervalMs = 30000, now = Date.now } = options;
  let running = false;
  let rerun = false;
  let last = -Infinity;

  async function adoptOne(candidate: Candidate, signal: AbortSignal): Promise<"adopted" | "skipped"> {
    const file = candidate.transport === "inline"
      ? inlineFile(candidate)
      : await client.fetchImage(candidate.projectId, AbortSignal.any([signal, AbortSignal.timeout(ITEM_TIMEOUT_MS)]));
    const hash = candidate.hash ?? await contentHash(new Uint8Array(await file.arrayBuffer()));
    if (candidate.knownHash === hash) return "skipped";
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
        try { summary[await adoptOne(candidate, signal)] += 1; }
        catch { summary.failed += 1; }
      }
    }
  }

  async function run({ force = false, signal }: RunOptions): Promise<RunSummary | null> {
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
