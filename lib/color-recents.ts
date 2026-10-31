type RecentStorage = Pick<Storage, "getItem" | "setItem">;

// Separate from emoji history; store palette IDs only, shared by Glyph and Initials.
export function createColorRecents(pluginId: string, knownIds: readonly string[], storage: () => RecentStorage = () => window.localStorage) {
  const key = `${pluginId}:color-recents:v1`;
  const known = new Set(knownIds);
  let fallback: string[] = [];
  const read = () => {
    try {
      const raw = storage().getItem(key);
      const value: unknown = raw && raw.length <= 4096 ? JSON.parse(raw) : [];
      fallback = Array.isArray(value) ? [...new Set(value.filter((id): id is string =>
        typeof id === "string" && known.has(id)))].slice(0, 6) : [];
    } catch { /* Browser storage may be blocked; retain the in-memory preference. */ }
    return [...fallback];
  };
  const write = (ids: string[]) => {
    fallback = ids;
    try { storage().setItem(key, JSON.stringify(ids)); }
    catch { /* Preference storage must never fail an icon Save. */ }
    return [...fallback];
  };
  return { read, add: (id: string) => known.has(id) ? write([id, ...read().filter(x => x !== id)].slice(0, 6)) : read(), clear: () => write([]) };
}
