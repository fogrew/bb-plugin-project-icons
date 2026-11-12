export const emojiFont = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const MIN_INK_PIXELS = 24;
const INK_ALPHA = 32;

export function hasVisibleInk(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let ink = 0;
  for (let offset = 3; offset < data.length; offset += 4) if (data[offset] >= INK_ALPHA) ink += 1;
  return ink >= MIN_INK_PIXELS;
}

export function drawEmoji(canvas: HTMLCanvasElement, value: string) {
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.clearRect(0, 0, 64, 64);
  ctx.font = `48px ${emojiFont}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const measure = ctx.measureText(value);
  const left = measure.actualBoundingBoxLeft;
  const right = measure.actualBoundingBoxRight;
  const ascent = measure.actualBoundingBoxAscent;
  const descent = measure.actualBoundingBoxDescent;
  const scale = Math.min(1, 56 / Math.max(measure.width, left + right, 1), 56 / Math.max(ascent + descent, 1));
  ctx.font = `${48 * scale}px ${emojiFont}`;
  ctx.fillStyle = "#000";
  // Shape the entire sequence; unsupported fonts may still show separate glyphs.
  ctx.fillText(value, 32 + (left - right) * scale / 2, 32 + (ascent - descent) * scale / 2);
}
