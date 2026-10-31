import { automaticIcon } from "./automatic-icon";

const base = "/api/v1/plugins/project-icons/http";
const iconUrl = (id: string, revision: number) => `${base}/icon?projectId=${encodeURIComponent(id)}&v=${revision}`;

export function mountIcons(signal: AbortSignal): () => void {
  let icons: Record<string, number> = {};
  let scheduled = false;
  let disposed = false;
  const fallbacks = new Map<string, { name: string; url: string }>();
  const decorate = () => {
    if (signal.aborted || disposed) return;
    const live = new Set<string>();
    document.querySelectorAll<HTMLElement>("[data-sidebar-project-id]").forEach((row) => {
      const id = row.dataset.sidebarProjectId ?? "";
      const title = row.querySelector<HTMLElement>(':scope [data-sidebar="group-label"] > span:first-child > span[title]');
      const existing = row.querySelector<HTMLImageElement>(".bb-project-icons-image");
      const revision = icons[id];
      if (!title || !/^proj_[a-z0-9]{10,32}$/.test(id)) {
        existing?.remove();
        row.classList.remove("bb-project-icons-row");
        return;
      }
      live.add(id);
      const name = title.textContent ?? "";
      let fallback = fallbacks.get(id);
      if (revision === undefined && fallback?.name !== name) {
        fallback = { name, url: automaticIcon(id, name) };
        fallbacks.set(id, fallback);
      }
      const url = revision !== undefined ? iconUrl(id, revision) : fallback!.url;
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
      const response = await fetch(`${base}/icons`, { credentials: "same-origin", cache: "no-store", signal });
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      if (disposed || signal.aborted || current !== request) return;
      icons = Object.fromEntries(Object.entries(data).filter(([id, revision]) => /^proj_[a-z0-9]{10,32}$/.test(id) && typeof revision === "number")) as Record<string, number>;
      schedule();
    } catch (cause) { if (!signal.aborted) console.warn("Project Icons refresh failed", cause); }
  };
  const onFocus = () => { void refresh(); };
  window.addEventListener("focus", onFocus);
  window.addEventListener("bb-project-icons-changed", onFocus);
  document.addEventListener("visibilitychange", onFocus);
  schedule();
  void refresh();
  return () => {
    disposed = true;
    fallbacks.clear();
    observer.disconnect();
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("bb-project-icons-changed", onFocus);
    document.removeEventListener("visibilitychange", onFocus);
    document.querySelectorAll(".bb-project-icons-image").forEach((node) => node.remove());
    document.querySelectorAll(".bb-project-icons-row").forEach((node) => node.classList.remove("bb-project-icons-row"));
  };
}
