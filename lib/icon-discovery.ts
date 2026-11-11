export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_CANDIDATES = 12;
export const MAX_DEPTH = 8;
export const MAX_PATH_LENGTH = 240;
export const SEARCH_QUERIES = ["favicon", "icon", "logo"] as const;

const ACCEPTED = new Set(["png", "jpg", "jpeg", "webp"]);
const IGNORED_DIRECTORIES = new Set([
  ".git", "node_modules", "dist", "build", "out", "coverage", "vendor", "target", ".next", ".cache", "__pycache__",
]);
const NAME_PATTERN = /(favicon|icon|logo)/i;

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
  return isSafeRelativePath(path) && !inIgnoredDirectory(path) && NAME_PATTERN.test(path.slice(path.lastIndexOf("/") + 1));
}

function inIgnoredDirectory(path: string): boolean {
  return path.split("/").slice(0, -1).some(segment => IGNORED_DIRECTORIES.has(segment.toLowerCase()));
}

function rank(path: string): number {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const depth = path.split("/").length;
  const nameScore = name.startsWith("favicon") ? 0 : name.startsWith("logo") ? 1 : name.includes("logo") ? 2
    : name.startsWith("icon") ? 3 : 4;
  const location = /(^|\/)(public|static|assets|resources|images|img)(\/|$)/i.test(path) ? 0 : 1;
  return nameScore * 100 + location * 20 + depth;
}

export function selectCandidates(paths: readonly string[]): { candidates: Candidate[]; rejected: Rejected; truncated: boolean } {
  const seen = new Set<string>();
  const rejected: Rejected = { svg: 0, unsupported: 0 };
  const accepted: string[] = [];
  for (const raw of paths) {
    if (typeof raw !== "string" || seen.has(raw)) continue;
    seen.add(raw);
    if (!isSafeRelativePath(raw) || inIgnoredDirectory(raw)) continue;
    const name = raw.slice(raw.lastIndexOf("/") + 1);
    if (!NAME_PATTERN.test(name)) continue;
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
