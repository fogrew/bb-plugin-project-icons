export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_CANDIDATES = 12;
export const MAX_DEPTH = 8;
export const MAX_PATH_LENGTH = 240;
export const SEARCH_QUERIES = ["favicon", "icon", "logo", "apple-touch", "android-chrome", "ic_launcher"] as const;

const ACCEPTED = new Set(["png", "jpg", "jpeg", "webp"]);
const IGNORED_DIRECTORIES = new Set([
  ".git", "node_modules", "dist", "build", "out", "coverage", "vendor", "target", ".next", ".cache", "__pycache__",
  ".claude", "bin", "obj",
]);
const NAME_PATTERN = /(favicon|icon|logo|apple-touch|android-chrome|ic[_-]launcher)/i;
const ICON_DIRECTORY = /^(icons?|logos?|favicons?|app-?icons?|mipmap-[a-z0-9]+|.+\.(appiconset|iconset))$/i;
const SIZED_NAME = /^\d{2,4}(x\d{2,4})?(@\dx)?\.[a-z]+$/i;
const BUILD_ICON = /^build\/(icons?\/|icon\.)/i;

export type Candidate = { path: string; name: string };
export type Rejected = { svg: number; unsupported: number };

export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isSafeRelativePath(path: string): boolean {
  if (!path || path.length > MAX_PATH_LENGTH) return false;
  if (path.startsWith("/") || path.startsWith("~")) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return false;
  const segments = path.split("/");
  if (segments.length > MAX_DEPTH) return false;
  return segments.every(segment => segment !== "" && segment !== "." && segment !== "..");
}

export function isAcceptedExtension(path: string): boolean {
  return ACCEPTED.has(extensionOf(path));
}

export function isDiscoverablePath(path: string): boolean {
  return isSafeRelativePath(path) && !inIgnoredDirectory(path) && matchesIconName(path);
}

function inIgnoredDirectory(path: string): boolean {
  const directories = path.split("/").slice(0, -1);
  if (BUILD_ICON.test(path)) directories.shift();
  return directories.some(segment => IGNORED_DIRECTORIES.has(segment.toLowerCase()));
}

function matchesIconName(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (NAME_PATTERN.test(name)) return true;
  if (!SIZED_NAME.test(name)) return false;
  return path.split("/").slice(0, -1).some(segment => ICON_DIRECTORY.test(segment));
}

const DENSITY_TIERS: Record<string, number> = { xxxhdpi: 0, xxhdpi: 1, xhdpi: 2, hdpi: 3, mdpi: 4, ldpi: 5 };

function sizeTier(path: string, name: string): number {
  const pair = /(\d{2,4})x(\d{2,4})/.exec(name);
  const single = pair ? null : [...name.matchAll(/(?:^|[-_])(\d{2,4})(?=[.@_-]|$)/g)]
    .find(match => !/^(19[9]\d|20\d\d)$/.test(match[1]));
  const multiplier = Number(/@(\d)x/.exec(name)?.[1] ?? 1);
  const width = Number(pair?.[1] ?? single?.[1]) * multiplier;
  if (Number.isFinite(width)) {
    const height = pair ? Number(pair[2]) * multiplier : width;
    const base = Math.min(5, Math.max(0, 9 - Math.log2(Math.min(width, height))));
    return width === height ? base : Math.max(base, 3);
  }
  const density = /(?:^|\/)(?:mipmap|drawable)-(xxxhdpi|xxhdpi|xhdpi|hdpi|mdpi|ldpi)(?:-|\/)/.exec(path.toLowerCase());
  return density ? DENSITY_TIERS[density[1]] : 2;
}

function rank(path: string): number {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const depth = path.split("/").length;
  const nameScore = name.startsWith("favicon") ? 0
    : name.startsWith("logo") || /^(app-?icon|apple-touch|android-chrome|ic[_-]launcher)/.test(name) ? 1
    : name.includes("logo") ? 2 : name.startsWith("icon") ? 3 : 4;
  const variant = /^ic[_-]launcher.*(round|foreground|background|monochrome)/.test(name) ? 1 : 0;
  const location = /(^|\/)(public|static|assets|resources|images|img|icons?|src-tauri)(\/|$)/i.test(path) ? 0 : 1;
  return nameScore * 100 + sizeTier(path, name) * 10 + variant * 25 + location * 20 + depth;
}

export function selectCandidates(paths: readonly string[]): { candidates: Candidate[]; rejected: Rejected; truncated: boolean } {
  const seen = new Set<string>();
  const rejected: Rejected = { svg: 0, unsupported: 0 };
  const accepted: string[] = [];
  for (const raw of paths) {
    if (typeof raw !== "string" || seen.has(raw)) continue;
    seen.add(raw);
    if (!isSafeRelativePath(raw) || inIgnoredDirectory(raw)) continue;
    if (!matchesIconName(raw)) continue;
    const extension = extensionOf(raw);
    if (extension === "svg") { rejected.svg += 1; continue; }
    if (!ACCEPTED.has(extension)) { if (["ico", "gif", "bmp", "avif", "tiff"].includes(extension)) rejected.unsupported += 1; continue; }
    accepted.push(raw);
  }
  accepted.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return {
    candidates: accepted.slice(0, MAX_CANDIDATES).map(path => ({ path, name: path.slice(path.lastIndexOf("/") + 1) })),
    rejected,
    truncated: accepted.length > MAX_CANDIDATES,
  };
}

export function sniffImage(bytes: Uint8Array): "png" | "jpeg" | "webp" | null {
  const startsWith = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (bytes.length >= 8 && startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (bytes.length >= 3 && startsWith(0xff, 0xd8, 0xff)) return "jpeg";
  if (bytes.length >= 12 && startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  return null;
}

export function extensionMatchesFormat(path: string, format: "png" | "jpeg" | "webp"): boolean {
  const extension = extensionOf(path);
  return format === "jpeg" ? extension === "jpg" || extension === "jpeg" : extension === format;
}
