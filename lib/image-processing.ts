export type Crop = { mode: "fit" | "fill"; zoom: number; x: number; y: number };
export const defaultCrop: Crop = { mode: "fit", zoom: 1, x: 0, y: 0 };

function scaledSize(width: number, height: number, crop: Crop) {
  if (![width, height, crop.zoom, crop.x, crop.y].every(Number.isFinite) ||
      width <= 0 || height <= 0 || crop.zoom < 1 || crop.zoom > 4 ||
      !["fit", "fill"].includes(crop.mode)) throw new Error("Invalid image geometry.");
  const scale = (crop.mode === "fit" ? Math.min : Math.max)(64 / width, 64 / height) * crop.zoom;
  const w = width * scale, h = height * scale;
  if (![w, h].every((size) => Number.isFinite(size) && size > 0)) throw new Error("Invalid scaled dimensions.");
  return { width: w, height: h };
}

export function offsetBounds(width: number, height: number, crop: Crop) {
  const size = scaledSize(width, height, crop);
  // Align either source edge with the output edge, including letterboxed Fit images.
  return { x: Math.abs(size.width - 64) / 2, y: Math.abs(size.height - 64) / 2 };
}

export function clampCrop(width: number, height: number, crop: Crop): Crop {
  const bounds = offsetBounds(width, height, crop);
  const clamp = (value: number, limit: number) => limit === 0 ? 0 : Math.max(-limit, Math.min(limit, value));
  return { ...crop, x: clamp(crop.x, bounds.x), y: clamp(crop.y, bounds.y) };
}

export function imageRect(width: number, height: number, crop: Crop) {
  const size = scaledSize(width, height, crop);
  const bounded = clampCrop(width, height, crop);
  return { x: (64 - size.width) / 2 + bounded.x, y: (64 - size.height) / 2 + bounded.y, ...size };
}

export function drawIcon(canvas: HTMLCanvasElement, bitmap: ImageBitmap, crop: Crop) {
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  const rect = imageRect(bitmap.width, bitmap.height, crop);
  ctx.clearRect(0, 0, 64, 64);
  ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
}

export async function decodeImage(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000)
    throw new Error("Choose a PNG, JPEG, or WebP image under 2 MB.");
  return createImageBitmap(file);
}

export async function encodeIcon(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error("Could not create PNG.")), "image/png"));
  if (blob.type !== "image/png" || blob.size > 65536) throw new Error("Processed icon is too large.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
