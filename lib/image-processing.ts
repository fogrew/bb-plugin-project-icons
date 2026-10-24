export type Crop = { mode: "fit" | "fill"; zoom: number; x: number; y: number };
export const defaultCrop: Crop = { mode: "fit", zoom: 1, x: 0, y: 0 };

export function imageRect(width: number, height: number, crop: Crop) {
  if (![width, height, crop.zoom, crop.x, crop.y].every(Number.isFinite) ||
      width <= 0 || height <= 0 || crop.zoom < 1 || crop.zoom > 4 ||
      Math.abs(crop.x) > 64 || Math.abs(crop.y) > 64) throw new Error("Invalid image geometry.");
  const scale = (crop.mode === "fit" ? Math.min : Math.max)(64 / width, 64 / height) * crop.zoom;
  const w = width * scale, h = height * scale;
  return { x: (64 - w) / 2 + crop.x, y: (64 - h) / 2 + crop.y, width: w, height: h };
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
