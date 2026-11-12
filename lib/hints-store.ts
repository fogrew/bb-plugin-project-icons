import { PROJECT_ID, parseHexColor } from "./hint-color.ts";

const MAX_COLORS = 500;
const MIN_INTERVAL_MS = 10_000;
export const HINT_REFRESH_MS = 60_000;

export function parseHints(data: unknown): Map<string, string> | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const colors = (data as { colors?: unknown }).colors;
  if (typeof colors !== "object" || colors === null || Array.isArray(colors)) return null;
  const parsed = new Map<string, string>();
  for (const [id, value] of Object.entries(colors).slice(0, MAX_COLORS)) {
    const color = parseHexColor(value);
    if (PROJECT_ID.test(id) && color) parsed.set(id, color);
  }
  return parsed;
}

export function createHintsStore(load: (signal: AbortSignal) => Promise<unknown>, now: () => number = Date.now) {
  let colors: ReadonlyMap<string, string> = new Map();
  let last = -Infinity;
  let inflight: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const unchanged = (next: Map<string, string>) =>
    next.size === colors.size && [...next].every(([id, color]) => colors.get(id) === color);

  function refresh({ force = false, signal }: { force?: boolean; signal?: AbortSignal } = {}): Promise<void> {
    if (inflight) return inflight;
    if (!force && now() - last < MIN_INTERVAL_MS) return Promise.resolve();
    last = now();
    const run = (async () => {
      try {
        const next = parseHints(await load(signal ?? new AbortController().signal));
        if (!next || unchanged(next)) return;
        colors = next;
        for (const listener of [...listeners]) listener();
      } catch { /* keep the last known colours */ }
    })().finally(() => { if (inflight === run) inflight = null; });
    inflight = run;
    return run;
  }

  return {
    get: (id: string): string | null => colors.get(id) ?? null,
    getSnapshot: () => colors,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    refresh,
  };
}

export async function loadHints(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<unknown> {
  const response = await fetcher("/api/v1/plugins/project-icons/http/hints", { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new Error("Appearance hints unavailable");
  return response.json();
}

export const hints = createHintsStore(signal => loadHints(signal));
