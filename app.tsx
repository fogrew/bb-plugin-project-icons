import { useEffect, useState } from "react";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import "./app.css";

type Project = { id: string; name: string; revision: number | null };
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const refresh = () => { void rpc.call("list").then(({ projects: rows }) => {
    setProjects(rows);
    setSelected((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? "");
  }, (cause) => setError(String(cause))); };
  useEffect(refresh, [rpc]);
  useRealtime("changed", refresh);
  const project = projects.find((row) => row.id === selected);
  const changed = () => { refresh(); window.dispatchEvent(new Event("bb-project-icons-changed")); };
  const upload = async (file?: File) => {
    if (!file || !selected || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await rpc.call("save", { projectId: selected, base64: await normalize(file) });
      changed(); setMessage("Icon saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selected || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await rpc.call("remove", { projectId: selected });
      changed(); setMessage("Icon removed.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <div className="bb-project-icons-settings">
    <label htmlFor="bb-project-icons-project">Project</label>
    <select id="bb-project-icons-project" value={selected} onChange={(event) => setSelected(event.target.value)}>
      {projects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select>
    <div className="bb-project-icons-preview">
      {project?.revision ? <img src={iconUrl(project.id, project.revision)} alt="" /> : <span aria-hidden="true">No icon</span>}
      <span>{project?.name ?? "Select a project"}</span>
    </div>
    <label htmlFor="bb-project-icons-file">Upload icon (PNG, JPEG, or WebP; up to 2 MB)</label>
    <input id="bb-project-icons-file" type="file" accept="image/png,image/jpeg,image/webp" disabled={!selected || busy} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
    <button type="button" disabled={!project?.revision || busy} onClick={() => void remove()}>Remove icon</button>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
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
