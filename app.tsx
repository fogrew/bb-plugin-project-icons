import { mountIcons } from "./lib/sidebar-icons";
import { AutomaticIcon } from "./components/automatic-icon";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { ProjectList } from "./components/project-list";
import { createSettingsState } from "./settings-state";
import { IconPicker } from "./components/icon-picker";
import { PngPreview } from "./components/icon-preview";
import { RemovalControls } from "./components/removal-controls";
import "./app.css";

const base = "/api/v1/plugins/project-icons/http";
const iconUrl = (id: string, revision: number) => `${base}/icon?projectId=${encodeURIComponent(id)}&v=${revision}`;

function Settings() {
  const rpc = useRpc<typeof rpcContract>();
  const state = useMemo(() => createSettingsState({
    list: () => rpc.call("list"),
    save: (input) => rpc.call("save", input),
    remove: (input) => rpc.call("removeWithUndo", input),
    restore: (input) => rpc.call("restore", input),
  }, () => window.dispatchEvent(new Event("bb-project-icons-changed"))), [rpc]);
  const { projects, selected, loading, refreshing, loadError, operation } =
    useSyncExternalStore(state.subscribe, state.getSnapshot);
  const [query, setQuery] = useState("");
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
      query={query} onQuery={setQuery} onSelect={state.select} iconUrl={iconUrl}>
    {project && <fieldset className="bb-project-icons-editor">
      <legend>Icon for {project.name}</legend>
      <div className="bb-project-icons-preview">
        {project.revision !== null ? <PngPreview url={iconUrl(project.id, project.revision)} label="Current project icon" /> : <><AutomaticIcon id={project.id} name={project.name} /><span>Automatic initials</span></>}
        {projects.some((row) => row.id !== project.id && row.name === project.name) &&
          <small className="bb-project-icons-id">{project.id}</small>}
      </div>
      <IconPicker key={project.id} project={project} state={state} busy={busy} />
      <RemovalControls project={project} state={state} />
    </fieldset>}
    </ProjectList>}
  </div>;
}

function SidebarUpdates() {
  useRealtime("changed", () => window.dispatchEvent(new Event("bb-project-icons-changed")));
  return null;
}


export default definePluginApp((app) => {
  app.slots.settingsSection({ id: "icons", title: "Project icons", description: "Choose an image for each project in the native sidebar.", component: Settings });
  app.slots.experimental_appOverlay({ id: "sidebar-updates", component: SidebarUpdates });
  app.contentScripts.register({ id: "sidebar-icons", mount: ({ signal }) => mountIcons(signal) });
});
