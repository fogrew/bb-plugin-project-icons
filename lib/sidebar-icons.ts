import { automaticIcon } from "./automatic-icon";
import { HINT_REFRESH_MS, hints } from "./hints-store";
import { readThemeMode, watchThemeMode } from "./theme-mode";
import { THEMES, pickIcon, type Theme, type VariantMap } from "./theme-variants";

const base = "/api/v1/plugins/project-icons/http";
const iconUrl = (id: string, revision: number, theme: Theme | null) =>
  `${base}/icon?projectId=${encodeURIComponent(id)}${theme ? `&theme=${theme}` : ""}&v=${revision}`;
const PROJECT_ID = /^proj_[a-z0-9]{10,32}$/;

export function parseVariantResponse(data: unknown): VariantMap | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const parsed: VariantMap = {};
  for (const [id, entry] of Object.entries(data)) {
    if (!PROJECT_ID.test(id) || !entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const own: VariantMap[string] = {};
    for (const theme of THEMES) {
      const revision = Object.hasOwn(entry, theme) ? (entry as Record<string, unknown>)[theme] : undefined;
      if (typeof revision === "number" && Number.isSafeInteger(revision) && revision > 0) own[theme] = revision;
    }
    if (Object.keys(own).length) parsed[id] = own;
  }
  return parsed;
}

export function mountIcons(signal: AbortSignal): () => void {
  let icons: Record<string, number> = {};
  let variants: VariantMap = {};
  let mode: Theme = readThemeMode();
  let scheduled = false;
  let disposed = false;
  const fallbacks = new Map<string, { name: string; color: string | null; url: string }>();
  const decorate = () => {
    if (signal.aborted || disposed) return;
    const live = new Set<string>();
    document.querySelectorAll<HTMLElement>("[data-sidebar-project-id]").forEach((row) => {
      const id = row.dataset.sidebarProjectId ?? "";
      const title = row.querySelector<HTMLElement>(':scope [data-sidebar="group-label"] > span:first-child > span[title]');
      const existing = row.querySelector<HTMLImageElement>(".bb-project-icons-image");
      const picked = pickIcon(mode, icons[id], variants[id]);
      const revision = picked?.revision;
      if (!title || !/^proj_[a-z0-9]{10,32}$/.test(id)) {
        existing?.remove();
        row.classList.remove("bb-project-icons-row");
        return;
      }
      live.add(id);
      const name = title.textContent ?? "";
      const color = hints.get(id);
      let fallback = fallbacks.get(id);
      if (revision === undefined && (fallback?.name !== name || fallback.color !== color)) {
        fallback = { name, color, url: automaticIcon(id, name, color) };
        fallbacks.set(id, fallback);
      }
      const url = picked ? iconUrl(id, picked.revision, picked.theme) : fallback!.url;
      if (existing && existing.src !== new URL(url, location.href).href) existing.src = url;
      if (!existing) {
        const image = document.createElement("img");
        image.className = "bb-project-icons-image";
        image.alt = "";
        image.setAttribute("aria-hidden", "true");
        image.src = url;
        title.before(image);
      }
      const image = row.querySelector(".bb-project-icons-image");
      if (image && title.previousSibling !== image) title.before(image);
      row.classList.add("bb-project-icons-row");
    });
    for (const id of fallbacks.keys()) if (!live.has(id)) fallbacks.delete(id);
  };
  const schedule = () => {
    if (scheduled || signal.aborted || disposed) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; decorate(); });
  };
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type !== "childList" ||
      [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)].some((node) =>
        !(node instanceof Element && node.classList.contains("bb-project-icons-image"))))) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["title", "data-sidebar-project-id"] });

  let request = 0;
  const refresh = async () => {
    const current = ++request;
    try {
      const [response, variantResponse] = await Promise.all([
        fetch(`${base}/icons`, { credentials: "same-origin", cache: "no-store", signal }),
        fetch(`${base}/icon-variants`, { credentials: "same-origin", cache: "no-store", signal }).catch(() => null),
      ]);
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      const nextVariants = variantResponse?.ok ? parseVariantResponse(await variantResponse.json().catch(() => null)) : null;
      if (disposed || signal.aborted || current !== request) return;
      icons = Object.fromEntries(Object.entries(data).filter(([id, revision]) => PROJECT_ID.test(id) && typeof revision === "number")) as Record<string, number>;
      if (nextVariants) variants = nextVariants;
      schedule();
    } catch (cause) { if (!signal.aborted) console.warn("Project Icons refresh failed", cause); }
  };
  const refreshHints = () => {
    if (document.visibilityState !== "hidden") void hints.refresh();
  };
  const onFocus = () => { void refresh(); refreshHints(); };
  const unsubscribe = hints.subscribe(schedule);
  const stopThemeWatch = watchThemeMode(next => { mode = next; schedule(); });
  const hintTimer = setInterval(refreshHints, HINT_REFRESH_MS);
  window.addEventListener("focus", onFocus);
  window.addEventListener("bb-project-icons-changed", onFocus);
  document.addEventListener("visibilitychange", onFocus);
  schedule();
  void refresh();
  refreshHints();
  return () => {
    disposed = true;
    fallbacks.clear();
    observer.disconnect();
    unsubscribe();
    stopThemeWatch();
    clearInterval(hintTimer);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("bb-project-icons-changed", onFocus);
    document.removeEventListener("visibilitychange", onFocus);
    document.querySelectorAll(".bb-project-icons-image").forEach((node) => node.remove());
    document.querySelectorAll(".bb-project-icons-row").forEach((node) => node.classList.remove("bb-project-icons-row"));
  };
}
