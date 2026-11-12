export const HASH_PATTERN = /^(?:[0-9a-f]{32}|[0-9a-f]{64})$/;

export async function contentHash(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", bytes as BufferSource);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }
  return [0x811c9dc5, 0x01000193, 0x9e3779b1, 0x85ebca6b].map(seed => {
    let hash = seed >>> 0;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    return hash.toString(16).padStart(8, "0");
  }).join("");
}
