import { palette, projectInitials, type ColorId } from "./icon-presets";
import { drawPreset } from "./preset-rendering";

export function automaticColor(id: string): ColorId {
  let hash = 2166136261;
  for (const unit of id) hash = Math.imul(hash ^ unit.codePointAt(0)!, 16777619);
  return palette[(hash >>> 0) % palette.length].id;
}

export function automaticIcon(id: string, name: string): string {
  const canvas = document.createElement("canvas");
  drawPreset(canvas, { initials: projectInitials(name) }, automaticColor(id));
  return canvas.toDataURL("image/png");
}
