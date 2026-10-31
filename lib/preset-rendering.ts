import { explicitInitials, foreground, glyphs, palette, type ColorId } from "./icon-presets";

export function drawPreset(canvas: HTMLCanvasElement, source: { glyph: string } | { initials: string }, colorId: ColorId) {
  const color = palette.find(p => p.id === colorId);
  if (!color) throw new Error("Unknown palette color.");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = color.background;
  ctx.beginPath(); ctx.roundRect(0, 0, 64, 64, 12); ctx.fill();
  const ink = foreground(color.background);
  if ("glyph" in source) {
    const glyph = glyphs.find(g => g.id === source.glyph);
    if (!glyph) throw new Error("Unknown built-in glyph.");
    ctx.save(); ctx.translate(8, 8); ctx.scale(2, 2);
    ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.stroke(new Path2D(glyph.path)); ctx.restore();
  } else {
    const text = explicitInitials(source.initials);
    ctx.fillStyle = ink;
    ctx.font = '600 36px system-ui, "Segoe UI", sans-serif';
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    const m = ctx.measureText(text);
    const scale = Math.min(1, 48 / Math.max(m.width, m.actualBoundingBoxLeft + m.actualBoundingBoxRight, 1),
      46 / Math.max(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, 1));
    ctx.font = `600 ${36 * scale}px system-ui, "Segoe UI", sans-serif`;
    ctx.fillText(text, 32 + (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) * scale / 2,
      32 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) * scale / 2);
  }
}
