export const THEMES = ["light", "dark"] as const;
export type Theme = typeof THEMES[number];
export type Variants = Partial<Record<Theme, number>>;
export type VariantMap = Record<string, Variants>;

const PROJECT_ID = /^proj_[a-z0-9]{10,32}$/;
const isRevision = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark";
export const variantKey = (projectId: string, theme: Theme) => `image:${projectId}:${theme}`;

export function parseVariants(raw: unknown): VariantMap {
  if (!isRecord(raw)) return {};
  const parsed: VariantMap = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!PROJECT_ID.test(id) || !isRecord(entry)) continue;
    const variants: Variants = {};
    for (const theme of THEMES) {
      const revision = Object.hasOwn(entry, theme) ? entry[theme] : undefined;
      if (isRevision(revision)) variants[theme] = revision;
    }
    if (Object.keys(variants).length) parsed[id] = variants;
  }
  return parsed;
}

export function revisionsOf(variants: VariantMap): number[] {
  return Object.values(variants).flatMap(entry => THEMES.flatMap(theme => entry[theme] ?? []));
}

export function withVariant(variants: VariantMap, projectId: string, theme: Theme, revision: number): VariantMap {
  return { ...variants, [projectId]: { ...variants[projectId], [theme]: revision } };
}

export function withoutVariant(variants: VariantMap, projectId: string, theme?: Theme): VariantMap {
  const { [projectId]: own, ...rest } = variants;
  if (!theme || !own) return rest;
  const { [theme]: _dropped, ...remaining } = own;
  return Object.keys(remaining).length ? { ...rest, [projectId]: remaining } : rest;
}

export function pickIcon(
  theme: Theme, defaultRevision: number | undefined, variants: Variants | undefined,
): { revision: number; theme: Theme | null } | null {
  if (defaultRevision === undefined) return null;
  const variant = variants?.[theme];
  return variant === undefined ? { revision: defaultRevision, theme: null } : { revision: variant, theme };
}
