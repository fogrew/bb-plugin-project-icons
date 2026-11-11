import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { resolveIconOutput, type ResolveIconOutput } from "../lib/artwork-contract.ts";

export type ResolvedIcon =
  | { kind: "image"; revision: number; mimeType: "image/png"; base64: string }
  | { kind: "none"; reason: "missing" | "unknown-project" | "unsupported" | "unavailable" };

const TTL_MS = 60_000;

export function createIconResolver(bb: BbPluginApi, consumerId: string, now: () => number = Date.now) {
  const cache = new Map<string, { icon: ResolvedIcon; revision: number | null; checkedAt: number }>();
  const call = (projectId: string, ifRevision: number | undefined, signal?: AbortSignal): Promise<ResolveIconOutput> =>
    bb.sdk.plugins.callRpc({
      pluginId: "project-icons", method: "resolveIcon", signal, outputSchema: resolveIconOutput,
      input: { version: 1, projectId, trail: [consumerId], ...(ifRevision === undefined ? {} : { ifRevision }) },
    });
  return {
    async resolve(projectId: string, signal?: AbortSignal): Promise<ResolvedIcon> {
      const cached = cache.get(projectId);
      if (cached && now() - cached.checkedAt < TTL_MS) return cached.icon;
      let result: ResolveIconOutput;
      try { result = await call(projectId, cached?.revision ?? undefined, signal); }
      catch { return cached?.icon ?? { kind: "none", reason: "unavailable" }; }
      if (result.status === "not-modified" && cached) {
        cache.set(projectId, { ...cached, checkedAt: now() });
        return cached.icon;
      }
      const icon: ResolvedIcon = result.status === "found"
        ? { kind: "image", revision: result.revision, mimeType: result.mimeType, base64: result.base64 }
        : { kind: "none", reason: result.status === "missing" || result.status === "unknown-project" ? result.status : "unsupported" };
      cache.set(projectId, { icon, revision: result.status === "found" ? result.revision : null, checkedAt: now() });
      return icon;
    },
    invalidate(projectId?: string) { if (projectId) cache.delete(projectId); else cache.clear(); },
  };
}
