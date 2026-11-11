import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { resolveIconOutput, type ResolveIconOutput } from "../lib/artwork-contract.ts";

export type ResolvedIcon =
  | { kind: "image"; revision: number; mimeType: "image/png"; base64: string }
  | { kind: "none"; reason: "missing" | "unknown-project" | "unsupported" | "unavailable" };

const TTL_MS = 60_000;

export function createIconResolver(bb: BbPluginApi, consumerId: string, now: () => number = Date.now) {
  const cache = new Map<string, { icon: ResolvedIcon; revision: number | null; checkedAt: number }>();
  const invalidated = new Map<string, number>();
  let invalidatedAll = 0;
  const stamp = (projectId: string) => `${invalidatedAll}:${invalidated.get(projectId) ?? 0}`;
  const call = (projectId: string, ifRevision: number | undefined, signal?: AbortSignal): Promise<ResolveIconOutput> =>
    bb.sdk.plugins.callRpc({
      pluginId: "project-icons", method: "resolveIcon", signal, outputSchema: resolveIconOutput,
      input: { version: 1, projectId, trail: [consumerId], ...(ifRevision === undefined ? {} : { ifRevision }) },
    });
  async function resolve(projectId: string, signal?: AbortSignal): Promise<ResolvedIcon> {
    const cached = cache.get(projectId);
    if (cached && now() - cached.checkedAt < TTL_MS) return cached.icon;
    const started = stamp(projectId);
    let result: ResolveIconOutput;
    try { result = await call(projectId, cached?.revision ?? undefined, signal); }
    catch (error) {
      if (signal?.aborted) throw error;
      if (cached && stamp(projectId) === started) cache.set(projectId, { ...cached, checkedAt: now() });
      return cached?.icon ?? { kind: "none", reason: "unavailable" };
    }
    if (stamp(projectId) !== started) return resolve(projectId, signal);
    if (result.status === "not-modified" && cached) {
      cache.set(projectId, { ...cached, checkedAt: now() });
      return cached.icon;
    }
    const icon: ResolvedIcon = result.status === "found"
      ? { kind: "image", revision: result.revision, mimeType: result.mimeType, base64: result.base64 }
      : { kind: "none", reason: result.status === "missing" || result.status === "unknown-project" ? result.status : "unsupported" };
    cache.set(projectId, { icon, revision: result.status === "found" ? result.revision : null, checkedAt: now() });
    return icon;
  }
  function invalidate(projectId?: string) {
    if (projectId) { invalidated.set(projectId, (invalidated.get(projectId) ?? 0) + 1); cache.delete(projectId); }
    else { invalidatedAll += 1; cache.clear(); }
  }
  return { resolve, invalidate };
}
