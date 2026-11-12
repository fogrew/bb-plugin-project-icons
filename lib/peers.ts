import { z } from "zod";
import { sniffImage } from "./icon-discovery.ts";
import { imageDimensions, withinPeerBounds } from "./image-bounds.ts";
import { contentHash } from "./content-hash.ts";

export const PEER_IDS = ["homepage", "cursor-sidebar", "nested-sidebar", "chat-sidebar", "bb-sidebar", "threadspace"] as const;
export type PeerId = typeof PEER_IDS[number];
export type InlinePeerId = "cursor-sidebar" | "nested-sidebar" | "chat-sidebar";
export type PeerDescriptor = { id: PeerId; name: string; minVersion: readonly [number, number, number] };

// Priority order: the first peer with usable artwork wins for a new project.
export const PEERS: readonly PeerDescriptor[] = [
  { id: "homepage", name: "Homepage", minVersion: [0, 2, 7] },
  { id: "cursor-sidebar", name: "Cursor Sidebar", minVersion: [0, 3, 5] },
  { id: "nested-sidebar", name: "Nest", minVersion: [0, 5, 0] },
  { id: "chat-sidebar", name: "Chat Sidebar", minVersion: [0, 2, 8] },
  { id: "bb-sidebar", name: "BB Sidebar", minVersion: [0, 3, 9] },
  { id: "threadspace", name: "Threadspace", minVersion: [0, 2, 2] },
];
export const peerName = (id: string) => PEERS.find(peer => peer.id === id)?.name ?? id;

export const MAX_INLINE_BYTES = 256 * 1024;
const MAX_DATA_URL_CHARS = 350_000;
const MAX_ROWS = 5000;
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export type ImageFormat = "png" | "jpeg" | "webp";
export type InlineArtwork = { format: ImageFormat; bytes: Buffer; hash: string };

export async function readInlineImage(value: unknown): Promise<InlineArtwork | null> {
  if (typeof value !== "string" || value.length > MAX_DATA_URL_CHARS) return null;
  const match = DATA_URL.exec(value);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_INLINE_BYTES) return null;
  const format = sniffImage(bytes);
  if (!format || format !== match[1] || !withinPeerBounds(imageDimensions(bytes, format))) return null;
  return { format, bytes, hash: await contentHash(bytes) };
}

type Entries = [string, unknown][];
type ListPeer = { method: string; input: null | Record<string, never>; entries(raw: unknown): Entries | null };

const rows = z.object({ icons: z.array(z.unknown()).max(MAX_ROWS) });
const cursorRow = z.object({ projectId: z.string(), icon: z.string() });
const nestRow = z.object({ projectId: z.string(), icon: z.object({ src: z.string() }).nullable() });
const chatImages = z.record(z.string(), z.unknown());

function fromRows(raw: unknown, pick: (row: unknown) => [string, unknown] | null): Entries | null {
  const parsed = rows.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data.icons.flatMap(row => { const entry = pick(row); return entry ? [entry] : []; });
}

export const LIST_PEERS: Record<InlinePeerId, ListPeer> = {
  "cursor-sidebar": {
    method: "listProjectIcons", input: {},
    entries: raw => fromRows(raw, row => { const parsed = cursorRow.safeParse(row); return parsed.success ? [parsed.data.projectId, parsed.data.icon] : null; }),
  },
  "nested-sidebar": {
    method: "listProjectIcons", input: {},
    entries: raw => fromRows(raw, row => { const parsed = nestRow.safeParse(row); return parsed.success && parsed.data.icon ? [parsed.data.projectId, parsed.data.icon.src] : null; }),
  },
  "chat-sidebar": {
    method: "images_get", input: null,
    entries: raw => {
      const parsed = chatImages.safeParse(raw);
      if (!parsed.success) return null;
      return Object.entries(parsed.data).slice(0, MAX_ROWS).flatMap(([key, value]): Entries =>
        key.startsWith("project:") ? [[key.slice(8), value]] : []);
    },
  },
};

export async function decodeEntries(entries: Entries, wanted: ReadonlySet<string>): Promise<Map<string, InlineArtwork>> {
  const found = new Map<string, InlineArtwork>();
  for (const [projectId, value] of entries) {
    if (!wanted.has(projectId) || found.has(projectId)) continue;
    const image = await readInlineImage(value);
    if (image) found.set(projectId, image);
  }
  return found;
}

const hasText = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0 && value.length <= 1024;
const bbRows = z.object({ projects: z.array(z.unknown()).max(MAX_ROWS) });
const bbRow = z.object({ id: z.string(), customPath: z.string().nullable().optional(), customUploadName: z.string().nullable().optional() });
export type BbSidebarIcon = "upload" | "path";

export function bbSidebarIcons(raw: unknown, wanted: ReadonlySet<string>): Map<string, BbSidebarIcon> | null {
  const parsed = bbRows.safeParse(raw);
  if (!parsed.success) return null;
  const found = new Map<string, BbSidebarIcon>();
  for (const item of parsed.data.projects) {
    const row = bbRow.safeParse(item);
    if (!row.success || !wanted.has(row.data.id) || found.has(row.data.id)) continue;
    if (hasText(row.data.customUploadName)) found.set(row.data.id, "upload");
    else if (hasText(row.data.customPath)) found.set(row.data.id, "path");
  }
  return found;
}

export const THREADSPACE_DEFAULT_EMOJI = "\u{1F4C1}";
export const THREADSPACE_COLORS: ReadonlyMap<string, string> = new Map([
  ["gray", "#787774"], ["brown", "#9f6b53"], ["orange", "#d9730d"], ["yellow", "#b68b20"], ["green", "#448361"],
  ["blue", "#337ea9"], ["purple", "#9065b0"], ["pink", "#c14c8a"], ["red", "#d44c47"],
]);
const graphemes = new Intl.Segmenter("und", { granularity: "grapheme" });
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]️?⃣/u;

export function isChosenEmoji(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 32) return false;
  if (Array.from(graphemes.segment(value)).length !== 1 || !EMOJI.test(value)) return false;
  return value.replaceAll("️", "") !== THREADSPACE_DEFAULT_EMOJI;
}

export type ThreadspaceAppearance = { emoji: string | null; color: string | null };

export function threadspaceAppearance(raw: unknown, wanted: Iterable<string>): Map<string, ThreadspaceAppearance> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const found = new Map<string, ThreadspaceAppearance>();
  for (const id of wanted) {
    if (!Object.hasOwn(raw, id)) continue;
    const entry = (raw as Record<string, unknown>)[id];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const { emoji, color } = entry as Record<string, unknown>;
    found.set(id, {
      emoji: isChosenEmoji(emoji) ? emoji : null,
      color: typeof color === "string" ? THREADSPACE_COLORS.get(color) ?? null : null,
    });
  }
  return found;
}

export const emojiHash = (emoji: string) => contentHash(new TextEncoder().encode(`emoji:${emoji}`));
