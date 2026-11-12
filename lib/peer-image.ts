import { MAX_IMAGE_BYTES, sniffImage } from "./icon-discovery.ts";
import { peerImagePath } from "./artwork-contract.ts";
import { imageDimensions, withinPeerBounds } from "./image-bounds.ts";

const EXTENSIONS = { png: "png", jpeg: "jpg", webp: "webp" } as const;

async function readBounded(response: Response, limit: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error("Image is larger than 2 MB");
  if (!response.body) throw new Error("Image could not be read");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { void reader.cancel(); throw new Error("Image is larger than 2 MB"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function fetchPeerImage(
  projectId: string, signal: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<File> {
  const response = await fetcher(peerImagePath(projectId), { signal, credentials: "same-origin", redirect: "error" });
  if (!response.ok) throw new Error("Homepage has no image for this project");
  const bytes = await readBounded(response, MAX_IMAGE_BYTES);
  const format = sniffImage(bytes);
  if (!format) throw new Error("Homepage image is not a PNG, JPEG or WebP file");
  if (!withinPeerBounds(imageDimensions(bytes, format))) throw new Error("Homepage image dimensions are not supported");
  return new File([bytes as BlobPart], `homepage-icon.${EXTENSIONS[format]}`, { type: `image/${format}` });
}
