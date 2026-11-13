import { z } from "zod";

export const ICON_CONTRACT_VERSION = 1 as const;
export const PLUGIN_ID = "project-icons";
export const PEER_PLUGIN_ID = "homepage";
export const PEER_MIN_VERSION = [0, 2, 7] as const;
export const PEER_TIMEOUT_MS = 5000;
export const MAX_TRAIL = 8;

export const iconHttpPath = (projectId: string, revision: number) =>
  `/api/v1/plugins/${PLUGIN_ID}/http/icon?projectId=${encodeURIComponent(projectId)}&v=${revision}`;
export const peerImagePath = (projectId: string) =>
  `/api/v1/plugins/${PEER_PLUGIN_ID}/http/project-icon?projectId=${encodeURIComponent(projectId)}`;

const ENVIRONMENT_PARAM = /^[A-Za-z0-9_-]{1,64}$/;
export function peerImageRoute(peer: string, projectId: string, environmentId?: string): string | null {
  if (peer === PEER_PLUGIN_ID) return peerImagePath(projectId);
  if (peer !== "bb-sidebar") return null;
  const environment = environmentId && ENVIRONMENT_PARAM.test(environmentId) ? `&environmentId=${environmentId}` : "";
  return `/api/v1/plugins/bb-sidebar/http/project-icon?projectId=${encodeURIComponent(projectId)}${environment}`;
}

const version = z.literal(ICON_CONTRACT_VERSION);
const projectId = z.string().min(1).max(64);

export const resolveIconInput = z.object({
  version: z.number().int().min(1).max(1000),
  projectId,
  theme: z.enum(["light", "dark"]).optional(),
  ifRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  trail: z.array(z.string().max(64)).max(MAX_TRAIL).optional(),
}).strict();

export const resolveIconOutput = z.discriminatedUnion("status", [
  z.object({
    version, status: z.literal("found"), projectId, revision: z.number(), source: z.literal("manual"),
    theme: z.literal("any"), mimeType: z.literal("image/png"), width: z.literal(64), height: z.literal(64),
    sizeBytes: z.number(), base64: z.string(), urlPath: z.string(), adoptedFrom: z.string().optional(),
  }),
  z.object({ version, status: z.literal("not-modified"), projectId, revision: z.number() }),
  z.object({ version, status: z.literal("missing"), projectId }),
  z.object({ version, status: z.literal("unknown-project"), projectId }),
  z.object({ version, status: z.literal("recursive"), projectId }),
  z.object({ version, status: z.literal("unsupported-version"), supportedVersions: z.array(z.number()) }),
]);
export type ResolveIconOutput = z.infer<typeof resolveIconOutput>;

export const PEER_UNAVAILABLE_REASONS = ["not-installed", "disabled", "incompatible", "not-running", "timeout", "error", "malformed"] as const;
export type PeerUnavailableReason = typeof PEER_UNAVAILABLE_REASONS[number];

export const peerArtworkInput = z.object({ projectId, peer: z.literal(PEER_PLUGIN_ID) }).strict();
export const peerArtworkOutput = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unavailable"), reason: z.enum(PEER_UNAVAILABLE_REASONS) }),
  z.object({ status: z.literal("none") }),
  z.object({ status: z.literal("glyph") }),
  z.object({ status: z.literal("image"), pluginVersion: z.string() }),
]);

export const peerReply = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("glyph") }),
  z.object({ kind: z.literal("image") }),
  z.object({ kind: z.literal("missing") }),
]);

export type PluginRow = { id: string; version: string; enabled: boolean; status: string };

export function versionAtLeast(value: string, minimum: readonly number[]): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    if (parts[index] !== minimum[index]) return parts[index] > minimum[index];
  }
  return true;
}

export function peerAvailability(
  plugins: readonly PluginRow[], id: string = PEER_PLUGIN_ID, minimum: readonly number[] = PEER_MIN_VERSION,
): { reason: Exclude<PeerUnavailableReason, "timeout" | "error" | "malformed"> } | { ok: true; version: string } {
  const peer = plugins.find(plugin => plugin.id === id);
  if (!peer) return { reason: "not-installed" };
  if (!peer.enabled || peer.status === "disabled") return { reason: "disabled" };
  if (peer.status === "incompatible" || !versionAtLeast(peer.version, minimum)) return { reason: "incompatible" };
  if (peer.status !== "running" && peer.status !== "degraded") return { reason: "not-running" };
  return { ok: true, version: peer.version };
}
