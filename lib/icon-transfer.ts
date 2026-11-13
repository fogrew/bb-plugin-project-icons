export const EXPORT_FORMAT = "bb-project-icons";
export const EXPORT_VERSION = 1;
export const MAX_ICONS = 500;
export const MAX_PAYLOAD_CHARS = 12 * 1024 * 1024;
export const MAX_NAME_CHARS = 200;
const MAX_IMAGE_CHARS = 87384;
const PROJECT_ID = /^proj_[a-z0-9]{10,32}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const UNSAFE_NAME = /[\p{Cc}‎‏‪-‮⁦-⁩\ud800-\udfff]/u;
const UNSAFE_NAME_ALL = new RegExp(UNSAFE_NAME.source, "gu");

export const IMPORT_ERROR_CODES = [
  "too-large", "not-json", "wrong-format", "unsupported-version", "malformed", "too-many", "duplicate", "bad-image",
  "bad-selection", "stale",
] as const;
export type ImportErrorCode = typeof IMPORT_ERROR_CODES[number];

export class ImportError extends Error {
  code: ImportErrorCode;
  constructor(code: ImportErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type ExportEntry = { projectId: string; projectName: string; image: string };
export type ParsedEntry = { sourceId: string; name: string; image: string; bytes: Buffer };
export type Decision = { sourceId: string; targetId: string; expectedRevision: number | null };
export type TargetState = { revision: number | null; image: string | null };

export function exportName(name: string): string {
  let result = "";
  for (const character of name.replace(UNSAFE_NAME_ALL, " ")) {
    if (result.length + character.length > MAX_NAME_CHARS) break;
    result += character;
  }
  return result;
}

export function buildExport(icons: ExportEntry[]): string {
  if (icons.length > MAX_ICONS) throw new ImportError("too-many", `Only ${MAX_ICONS} icons fit in one export file.`);
  const text = JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, icons });
  if (text.length > MAX_PAYLOAD_CHARS) throw new ImportError("too-large", "The icons are too large to export in one file.");
  return text;
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const hasExactly = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const malformed = () => new ImportError("malformed", "The file is not a valid Project Icons export.");

export function parseExport(text: unknown, decode: (base64: string) => Buffer): ParsedEntry[] {
  if (typeof text !== "string") throw malformed();
  if (text.length > MAX_PAYLOAD_CHARS) throw new ImportError("too-large", "The file is larger than 12 MB.");
  let raw: unknown;
  try { raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); }
  catch { throw new ImportError("not-json", "The file is not valid JSON."); }
  if (!isPlain(raw) || !Object.hasOwn(raw, "format") || raw.format !== EXPORT_FORMAT) {
    throw new ImportError("wrong-format", "The file is not a Project Icons export.");
  }
  if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 1) throw malformed();
  if (raw.version > EXPORT_VERSION) {
    throw new ImportError("unsupported-version", "The file was made by a newer version of Project Icons.");
  }
  if (!hasExactly(raw, ["format", "version", "icons"]) || !Array.isArray(raw.icons)) throw malformed();
  if (raw.icons.length > MAX_ICONS) throw new ImportError("too-many", `The file holds more than ${MAX_ICONS} icons.`);
  const seen = new Set<string>();
  const entries: ParsedEntry[] = [];
  for (const [position, item] of raw.icons.entries()) {
    if (!isPlain(item) || !hasExactly(item, ["projectId", "projectName", "image"])) throw malformed();
    const { projectId, projectName, image } = item;
    if (typeof projectId !== "string" || !PROJECT_ID.test(projectId)) throw malformed();
    if (typeof projectName !== "string" || projectName.length > MAX_NAME_CHARS || UNSAFE_NAME.test(projectName)) throw malformed();
    if (seen.has(projectId)) throw new ImportError("duplicate", "The file lists the same project more than once.");
    seen.add(projectId);
    if (typeof image !== "string" || image.length > MAX_IMAGE_CHARS || !BASE64.test(image)) {
      throw new ImportError("bad-image", `Icon ${position + 1} is not a valid 64 × 64 PNG.`);
    }
    let bytes: Buffer;
    try { bytes = decode(image); }
    catch { throw new ImportError("bad-image", `Icon ${position + 1} is not a valid 64 × 64 PNG.`); }
    entries.push({ sourceId: projectId, name: projectName, image, bytes });
  }
  return entries;
}

export function planApply(entries: ParsedEntry[], decisions: Decision[], targets: Map<string, TargetState>) {
  if (decisions.length > entries.length) throw new ImportError("bad-selection", "The selection does not match the file.");
  const byId = new Map(entries.map(entry => [entry.sourceId, entry]));
  const sources = new Set<string>();
  const used = new Set<string>();
  const writes: { targetId: string; image: string }[] = [];
  let unchanged = 0;
  for (const { sourceId, targetId, expectedRevision } of decisions) {
    const entry = byId.get(sourceId);
    if (!entry || sources.has(sourceId) || used.has(targetId)) {
      throw new ImportError("bad-selection", "The selection does not match the file.");
    }
    sources.add(sourceId);
    used.add(targetId);
    const target = targets.get(targetId);
    if (!target || target.revision !== expectedRevision) {
      throw new ImportError("stale", "A project or its icon changed since the preview. Review the import again.");
    }
    if (target.image === entry.image) unchanged += 1;
    else writes.push({ targetId, image: entry.image });
  }
  return { writes, unchanged };
}
