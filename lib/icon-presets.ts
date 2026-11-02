// Feather v4.29.2 geometry, converted to Canvas paths. See THIRD_PARTY_NOTICES.md.
export const glyphs = [
  { id: "folder", label: "Folder", keywords: "directory files", path: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" },
  { id: "star", label: "Star", keywords: "favorite important", path: "M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2Z" },
  { id: "heart", label: "Heart", keywords: "love health", path: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" },
  { id: "code", label: "Code", keywords: "development programming", path: "M16 18L22 12 16 6M8 6L2 12 8 18" },
  { id: "terminal", label: "Terminal", keywords: "command shell console", path: "M4 17L10 11 4 5M12 19L20 19" },
  { id: "cloud", label: "Cloud", keywords: "server hosting", path: "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" },
  { id: "bookmark", label: "Bookmark", keywords: "reading saved", path: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" },
  { id: "zap", label: "Lightning", keywords: "zap energy fast", path: "M13 2L3 14 12 14 11 22 21 10 12 10 13 2Z" },
] as const;
export const searchGlyphs = (query: string) => {
  const term = query.trim().toLowerCase();
  return glyphs.filter(g => `${g.id} ${g.label} ${g.keywords}`.toLowerCase().includes(term));
};

export const palette = [
  { id: "slate", label: "Slate", background: "#334155" },
  { id: "blue", label: "Blue", background: "#1d4ed8" },
  { id: "teal", label: "Teal", background: "#0f766e" },
  { id: "green", label: "Green", background: "#166534" },
  { id: "amber", label: "Amber", background: "#fbbf24" },
  { id: "orange", label: "Orange", background: "#fb923c" },
  { id: "rose", label: "Rose", background: "#be123c" },
  { id: "purple", label: "Purple", background: "#7e22ce" },
] as const;
export type ColorId = typeof palette[number]["id"];
function luminance(hex: string) {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
export function contrast(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const foreground = (background: string) =>
  contrast(background, "#000000") >= contrast(background, "#ffffff") ? "#000000" : "#ffffff";

const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
const clusters = (text: string) => Array.from(segmenter.segment(text), s => s.segment);
const forbidden = /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const meaningful = (value: string) => /[\p{L}\p{N}\p{S}]/u.test(value);
export function explicitInitials(input: string) {
  if (input.length > 128 || forbidden.test(input)) throw new Error("Use one or two visible characters (up to 128 code units), without controls.");
  const text = input.trim();
  const parts = clusters(text);
  if (!parts.length || parts.length > 2 || parts.some(p => !/[\p{L}\p{N}\p{S}\p{P}]/u.test(p)))
    throw new Error("Use one or two visible characters.");
  return text;
}
export function projectInitials(name: string) {
  // Segment before detecting separators: punctuation can belong to a keycap grapheme.
  const words: string[][] = [];
  let word: string[] = [];
  for (const cluster of clusters(name)) {
    if (/^[\p{White_Space}\p{P}]+$/u.test(cluster)) {
      if (word.length) words.push(word);
      word = [];
    } else if (meaningful(cluster) || cluster.includes("\u20e3")) word.push(cluster);
  }
  if (word.length) words.push(word);
  const parts = words.length > 1 ? [words[0][0], words[1][0]] : words[0]?.slice(0, 2) ?? ["?"];
  const result = parts.join("");
  try { return explicitInitials(result); } catch { return "?"; }
}
