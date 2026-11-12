import { z } from "zod";
import { sniffImage } from "./icon-discovery.ts";
import { imageDimensions, withinPeerBounds } from "./image-bounds.ts";
import { contentHash } from "./content-hash.ts";

export const PEER_IDS = ["homepage", "cursor-sidebar", "nested-sidebar", "chat-sidebar"] as const;
export type PeerId = typeof PEER_IDS[number];
export type PeerDescriptor = { id: PeerId; name: string; minVersion: readonly [number, number, number] };

// Priority order: the first peer with usable artwork wins for a new project.
export const PEERS: readonly PeerDescriptor[] = [
  { id: "homepage", name: "Homepage", minVersion: [0, 2, 7] },
  { id: "cursor-sidebar", name: "Cursor Sidebar", minVersion: [0, 3, 5] },
  { id: "nested-sidebar", name: "Nest", minVersion: [0, 5, 0] },
  { id: "chat-sidebar", name: "Chat Sidebar", minVersion: [0, 2, 8] },
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

// Method names and shapes were read from each plugin's source; they are not published contracts.
export const LIST_PEERS: Record<Exclude<PeerId, "homepage">, ListPeer> = {
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
