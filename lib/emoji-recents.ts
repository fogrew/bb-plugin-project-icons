type RecentStorage = Pick<Storage, "getItem" | "setItem">;

// Client-local preference only: no project, search, image or account data.
export function createRecents(pluginId: string, knownIds: readonly string[], storage: () => RecentStorage = () => window.localStorage) {
  const key = `${pluginId}:emoji-recents:v1`;
  const known = new Set(knownIds);
  let fallback: string[] = [];
  const sanitize = (value: unknown): string[] => Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === "string" && known.has(id)))].slice(0, 12) : [];
  const read = () => {
    try {
      const raw = storage().getItem(key);
      fallback = raw && raw.length <= 4096 ? sanitize(JSON.parse(raw)) : [];
    } catch { /* Keep the in-memory preference when browser storage is blocked. */ }
    return [...fallback];
  };
  const write = (ids: string[]) => {
    fallback = ids;
    try { storage().setItem(key, JSON.stringify(ids)); }
    catch { /* Saving an icon must not depend on browser storage availability. */ }
    return [...fallback];
  };
  return {
    read,
    add: (id: string) => known.has(id) ? write([id, ...read().filter(item => item !== id)].slice(0, 12)) : read(),
    clear: () => write([]),
  };
}
