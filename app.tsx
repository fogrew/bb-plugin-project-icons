import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { ProjectList } from "./components/project-list";
import { createSettingsState } from "./settings-state";
import "./app.css";

const base = "/api/v1/plugins/project-icons/http";
const iconUrl = (id: string, revision: number) => `${base}/icon?projectId=${encodeURIComponent(id)}&v=${revision}`;

async function normalize(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000) throw new Error("Choose a PNG, JPEG, or WebP image under 2 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable.");
    const scale = Math.min(64 / bitmap.width, 64 / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    ctx.drawImage(bitmap, (64 - width) / 2, (64 - height) / 2, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not create PNG")), "image/png"));
    if (blob.size > 65536) throw new Error("Processed icon is too large.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  } finally {
    bitmap.close();
  }
}

function Settings() {
  const rpc = useRpc<typeof rpcContract>();
  const state = useMemo(() => createSettingsState({
    list: () => rpc.call("list"),
    save: (input) => rpc.call("save", input),
    remove: (input) => rpc.call("remove", input),
  }, () => window.dispatchEvent(new Event("bb-project-icons-changed"))), [rpc]);
  const { projects, selected, loading, refreshing, loadError, operation, notice } =
    useSyncExternalStore(state.subscribe, state.getSnapshot);
  const [query, setQuery] = useState("");
  const fileId = useId();
  useEffect(() => {
    void state.refresh();
    return state.cancel;
  }, [state]);
  useRealtime("changed", () => { void state.refresh(); });
  const project = projects.find((row) => row.id === selected);
  const busy = operation !== null;
  return <div className="bb-project-icons-settings">
    {loading && <p role="status">Loading projects…</p>}
    {loadError && <div className="bb-project-icons-error">
      <p role="alert">{loadError}</p>
      <button type="button" disabled={refreshing} onClick={() => void state.refresh()}>Retry</button>
    </div>}
    {!loading && refreshing && <p role="status" className="bb-project-icons-help">Updating projects…</p>}
    {!loading && !loadError && projects.length === 0 &&
      <p role="status">No projects yet. Create a project in BB to assign an icon.</p>}
    {projects.length > 0 && <ProjectList projects={projects} selected={selected}
      query={query} onQuery={setQuery} onSelect={state.select} iconUrl={iconUrl} />}
    {project && <fieldset className="bb-project-icons-editor">
      <legend>Icon for {project.name}</legend>
      <div className="bb-project-icons-preview">
        {project.revision !== null ? <img src={iconUrl(project.id, project.revision)} alt="Current project icon" /> : <span>No icon assigned</span>}
        {projects.some((row) => row.id !== project.id && row.name === project.name) &&
          <small className="bb-project-icons-id">{project.id}</small>}
      </div>
      <label htmlFor={fileId}>Upload icon</label>
      <p id={`${fileId}-help`} className="bb-project-icons-help">PNG, JPEG, or WebP; up to 2 MB. Images are fitted to 64 × 64 pixels.</p>
      <input id={fileId} type="file" accept="image/png,image/jpeg,image/webp"
        aria-describedby={`${fileId}-help`} disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void state.mutate("save", () => normalize(file));
          event.target.value = "";
        }} />
      <button type="button" disabled={project.revision === null || busy}
        onClick={() => void state.mutate("remove")}>Remove icon</button>
      {operation?.projectId === selected && <p role="status">
        {operation.kind === "save" ? "Uploading icon…" : "Removing icon…"}
      </p>}
      {operation && operation.projectId !== selected &&
        <p role="status">Finishing an icon change for another project…</p>}
      {notice && <p role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}
    </fieldset>}
  </div>;
}

function SidebarUpdates() {
  useRealtime("changed", () => window.dispatchEvent(new Event("bb-project-icons-changed")));
  return null;
}

function mountIcons(signal: AbortSignal): () => void {
  let icons: Record<string, number> = {};
  let scheduled = false;
  const decorate = () => {
    if (signal.aborted) return;
    document.querySelectorAll<HTMLElement>("[data-sidebar-project-id]").forEach((row) => {
      const id = row.dataset.sidebarProjectId ?? "";
      const title = row.querySelector<HTMLElement>(':scope [data-sidebar="group-label"] > span:first-child > span[title]');
      const existing = row.querySelector<HTMLImageElement>(".bb-project-icons-image");
      const revision = icons[id];
      if (!title || !revision) {
        existing?.remove();
        row.classList.remove("bb-project-icons-row");
        return;
      }
      const url = iconUrl(id, revision);
      if (existing && existing.src !== new URL(url, location.href).href) existing.src = url;
      if (!existing) {
        const image = document.createElement("img");
        image.className = "bb-project-icons-image";
        image.alt = "";
        image.setAttribute("aria-hidden", "true");
        image.src = url;
        title.before(image);
      }
      row.classList.add("bb-project-icons-row");
    });
  };
  const schedule = () => {
    if (scheduled || signal.aborted) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; decorate(); });
  };
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)].some((node) => node instanceof Element && !node.classList.contains("bb-project-icons-image")))) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const refresh = async () => {
    try {
      const response = await fetch(`${base}/icons`, { credentials: "same-origin", cache: "no-store", signal });
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      icons = Object.fromEntries(Object.entries(data).filter(([id, revision]) => /^proj_[a-z0-9]{10,32}$/.test(id) && typeof revision === "number")) as Record<string, number>;
      schedule();
    } catch (cause) { if (!signal.aborted) console.warn("Project Icons refresh failed", cause); }
  };
  const onFocus = () => { void refresh(); };
  window.addEventListener("focus", onFocus);
  window.addEventListener("bb-project-icons-changed", onFocus);
  document.addEventListener("visibilitychange", onFocus);
  void refresh();
  return () => {
    observer.disconnect();
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("bb-project-icons-changed", onFocus);
    document.removeEventListener("visibilitychange", onFocus);
    document.querySelectorAll(".bb-project-icons-image").forEach((node) => node.remove());
    document.querySelectorAll(".bb-project-icons-row").forEach((node) => node.classList.remove("bb-project-icons-row"));
  };
}

export default definePluginApp((app) => {
  app.slots.settingsSection({ id: "icons", title: "Project icons", description: "Choose an image for each project in the native sidebar.", component: Settings });
  app.slots.experimental_appOverlay({ id: "sidebar-updates", component: SidebarUpdates });
  app.contentScripts.register({ id: "sidebar-icons", mount: ({ signal }) => mountIcons(signal) });
});
