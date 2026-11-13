import { mountIcons } from "./lib/sidebar-icons";
import { AutomaticIcon } from "./components/automatic-icon";
import { useEffect, useMemo, useRef, useId, useState, useSyncExternalStore } from "react";
import { definePluginApp, experimental_saveFile, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { ProjectList } from "./components/project-list";
import { createSettingsState } from "./settings-state";
import { IconPicker } from "./components/icon-picker";
import { PngPreview } from "./components/icon-preview";
import { RemovalControls } from "./components/removal-controls";
import { AdoptionStatus, AutomaticToggle } from "./components/adoption-controls";
import { AutoAdopt, SCAN_EVENT } from "./components/auto-adopt";
import { FILE_NAME, IconTransfer, downloadFile, type TransferApi } from "./components/icon-transfer";
import { fetchPeerImage } from "./lib/peer-image";
import "./app.css";
import { version } from "./package.json";

const base = "/api/v1/plugins/project-icons/http";
const iconUrl = (id: string, revision: number) => `${base}/icon?projectId=${encodeURIComponent(id)}&v=${revision}`;

function Settings({ projectId }: { projectId?: string } = {}) {
  const rpc = useRpc<typeof rpcContract>();
  const state = useMemo(() => createSettingsState({
    list: async () => {
      const result = await rpc.call("list");
      return projectId ? { ...result, projects: result.projects.filter(row => row.id === projectId) } : result;
    },
    save: (input) => rpc.call("save", input),
    remove: (input) => rpc.call("removeWithUndo", input),
    restore: (input) => rpc.call("restore", input),
  }, () => window.dispatchEvent(new Event("bb-project-icons-changed"))), [rpc, projectId]);
  const { projects, selected, loading, refreshing, loadError, operation, automaticAdoption } =
    useSyncExternalStore(state.subscribe, state.getSnapshot);
  const [query, setQuery] = useState("");
  const [adoptionBusy, setAdoptionBusy] = useState(false);
  const [adoptionError, setAdoptionError] = useState("");
  const changeAdoption = async (work: () => Promise<unknown>, failure: string) => {
    setAdoptionBusy(true);
    setAdoptionError("");
    try { await work(); window.dispatchEvent(new Event(SCAN_EVENT)); }
    catch { setAdoptionError(failure); }
    finally { setAdoptionBusy(false); void state.refresh(); }
  };
  useEffect(() => {
    void state.refresh();
    return state.cancel;
  }, [state]);
  useRealtime("changed", () => { void state.refresh(); });
  const project = projects.find((row) => row.id === selected);
  const busy = operation !== null;
  const repository = useMemo(() => ({
    discover: (id: string) => rpc.call("discover", { projectId: id }),
    read: (id: string, path: string) => rpc.call("readCandidate", { projectId: id, path }),
  }), [rpc]);
  const peerArtwork = useMemo(() => ({
    probe: (id: string) => rpc.call("peerArtwork", { projectId: id, peer: "homepage" }),
    fetchImage: fetchPeerImage,
  }), [rpc]);
  const transfer = useMemo<TransferApi>(() => ({
    save: async text => {
      try { return (await experimental_saveFile({ fileName: FILE_NAME, blob: new Blob([text], { type: "application/json" }) })) === "started"; }
      catch { downloadFile(text); return true; }
    },
    exportIcons: () => rpc.call("exportIcons"),
    preview: payload => rpc.call("importPreview", { payload }),
    apply: (payload, decisions) => rpc.call("importApply", { payload, decisions }),
  }), [rpc]);
  const editor = project && <fieldset className="bb-project-icons-editor">
      <legend>Icon for {project.name}</legend>
      <div className="bb-project-icons-preview">
        {project.revision !== null ? <PngPreview url={iconUrl(project.id, project.revision)} label="Current project icon" /> : <><AutomaticIcon id={project.id} name={project.name} /><span>Automatic initials</span></>}
        {projects.some((row) => row.id !== project.id && row.name === project.name) &&
          <small className="bb-project-icons-id">{project.id}</small>}
      </div>
      <AdoptionStatus project={project} automaticAdoption={automaticAdoption} busy={busy || adoptionBusy}
        onEnable={() => void changeAdoption(() => rpc.call("enableAutomatic", { projectId: project.id }), "Could not re-enable automatic icons. Try again.")} />
      {adoptionError && <p role="alert">{adoptionError}</p>}
      <IconPicker key={project.id} project={project} state={state} busy={busy} repository={repository} peerArtwork={peerArtwork} />
      <RemovalControls project={project} state={state} />
    </fieldset>;
  return <div className="bb-project-icons-settings">
    <p className="bb-project-icons-help">Version {version}</p>
    {!projectId && !loading && !loadError && <AutomaticToggle enabled={automaticAdoption} busy={adoptionBusy}
      onChange={enabled => void changeAdoption(() => rpc.call("setAutomaticAdoption", { enabled }), "Could not change automatic icons. Try again.")} />}
    {loading && <p role="status">Loading projects…</p>}
    {loadError && <div className="bb-project-icons-error">
      <p role="alert">{loadError}</p>
      <button type="button" disabled={refreshing} onClick={() => void state.refresh()}>Retry</button>
    </div>}
    {!loading && refreshing && <p role="status" className="bb-project-icons-help">Updating projects…</p>}
    {!loading && !loadError && !projectId && projects.length === 0 &&
      <p role="status">No projects yet. Create a project in BB to assign an icon.</p>}
    {projectId && !loading && !loadError && !project && <p role="alert">Project is no longer available.</p>}
    {projectId ? editor : projects.length > 0 && <ProjectList projects={projects} selected={selected}
      query={query} onQuery={setQuery} onSelect={state.select} iconUrl={iconUrl}>{editor}</ProjectList>}
    {!projectId && !loading && !loadError && projects.length > 0 && <IconTransfer api={transfer} iconUrl={iconUrl}
      onImported={() => { void state.refresh(); window.dispatchEvent(new Event("bb-project-icons-changed")); }} />}

  </div>;
}


let openEditor: ((projectId: string) => void) | undefined;

function ContextualEditor() {
  const [request, setRequest] = useState<{ projectId: string; key: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const contextOrigin = useRef<HTMLElement | null>(null);
  const opening = useRef(false);
  const pressedOnDialog = useRef(false);
  const title = useId();
  const closeEditor = () => {
    opening.current = false;
    setRequest(null);
    dialog.current?.close();
    if (origin.current?.isConnected) origin.current.focus();
  };
  useEffect(() => {
    const element = dialog.current;
    const rememberContextOrigin = (event: MouseEvent) => {
      if (element?.open) return;
      contextOrigin.current = event.composedPath().find(
        (node): node is HTMLElement => node instanceof HTMLElement && node.tabIndex >= 0,
      ) ?? null;
    };
    const clearContextOrigin = (event: FocusEvent) => {
      if (element?.open) return;
      const inMenu = event.composedPath().some(node => node instanceof HTMLElement &&
        ["menu", "menuitem", "menuitemcheckbox", "menuitemradio"].includes(node.getAttribute("role") ?? ""));
      if (!inMenu && event.target !== document.body) contextOrigin.current = null;
    };
    document.addEventListener("contextmenu", rememberContextOrigin, true);
    document.addEventListener("focusin", clearContextOrigin, true);
    const open = (projectId: string) => {
      if (!projectId) return;
      opening.current = true;
      origin.current = contextOrigin.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      contextOrigin.current = null;
      setRequest(previous => ({ projectId, key: (previous?.key ?? 0) + 1 }));
    };
    openEditor = open;
    return () => {
      if (openEditor === open) openEditor = undefined;
      document.removeEventListener("contextmenu", rememberContextOrigin, true);
      document.removeEventListener("focusin", clearContextOrigin, true);
      element?.close();
      if (origin.current?.isConnected) origin.current.focus();
    };
  }, []);
  useEffect(() => {
    if (!request) return;
    // Let the host menu unmount and restore its trigger before taking focus.
    const frame = requestAnimationFrame(() => {
      if (dialog.current?.open) return;
      if (!origin.current?.isConnected && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        origin.current = document.activeElement;
      }
      dialog.current?.showModal();
    });
    return () => cancelAnimationFrame(frame);
  }, [request]);
  return <dialog ref={dialog} className="bb-project-icons-contextual" aria-labelledby={title}
    onCancel={event => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault(); closeEditor();
    }}
    onClose={event => {
      if (event.target !== event.currentTarget) return;
      if (!opening.current && origin.current?.isConnected) origin.current.focus();
    }}
    onPointerDown={event => { pressedOnDialog.current = event.target === event.currentTarget; }}
    onClick={event => {
      if (event.target !== event.currentTarget || !pressedOnDialog.current) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeEditor();
    }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape" && (event.target as HTMLElement).closest("dialog") === event.currentTarget) {
        event.preventDefault(); closeEditor();
      }
    }}>
    <div className="bb-project-icons-contextual-header">
      <h2 id={title}>Edit project icon</h2>
      <button type="button" autoFocus onClick={closeEditor}>Close editor</button>
    </div>
    {request && <Settings key={request.key} projectId={request.projectId} />}
  </dialog>;
}

function HomepageIconAction({ projectId }: { projectId: string | null }) {
  return projectId ? <button type="button" onClick={() => openEditor?.(projectId)}>Edit icon</button> : null;
}

function SidebarUpdates() {
  useRealtime("changed", () => window.dispatchEvent(new Event("bb-project-icons-changed")));
  return null;
}


export default definePluginApp((app) => {
  app.slots.settingsSection({ id: "icons", title: "Project icons", description: "Choose an image for each project in the native sidebar.", component: Settings });
  app.slots.experimental_appOverlay({ id: "sidebar-updates", component: SidebarUpdates });
  app.slots.homepageSection({ id: "edit-icon", title: "Project icon", component: HomepageIconAction });
  app.slots.experimental_appOverlay({ id: "icon-editor", component: ContextualEditor });
  app.slots.experimental_appOverlay({ id: "auto-adopt", component: AutoAdopt });
  for (const placement of ["menu", "header"] as const) {
    app.slots.experimental_threadAction({
      id: `edit-project-icon-${placement}`, title: "Edit project icon", icon: "Image", group: "project-icons", placement,
      item: ({ thread }) => ({ label: "Edit project icon", icon: "Image", run: () => openEditor?.(thread.projectId) }),
    });
  }
  app.contentScripts.register({ id: "sidebar-icons", mount: ({ signal }) => mountIcons(signal) });
});
