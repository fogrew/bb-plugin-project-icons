import { useId, useSyncExternalStore } from "react";
import type { createSettingsState, Project } from "../settings-state";

export function RemovalControls({ project, state }: { project: Project; state: ReturnType<typeof createSettingsState> }) {
  const { selected, operation, notice, undo } = useSyncExternalStore(state.subscribe, state.getSnapshot);
  const deadlineId = useId();
  return <div className="bb-project-icons-removal">
    <button type="button" disabled={project.revision === null || operation !== null}
      onClick={() => void state.mutate("remove", undefined, project.id)}>Remove icon</button>
    {undo?.projectId === selected && <div>
      <p id={deadlineId} role="status">Undo available until <time dateTime={new Date(undo.expiresAt).toISOString()}>
        {new Date(undo.expiresAt).toLocaleTimeString()}</time>. A newer icon change or server reload cancels Undo.</p>
      <button type="button" disabled={operation !== null} aria-describedby={deadlineId}
        onClick={() => void state.undo()}>Undo removal</button>
    </div>}
    {operation?.projectId === selected && <p role="status">
      {operation.kind === "save" ? "Uploading icon…" : operation.kind === "restore" ? "Restoring icon…" : "Removing icon…"}
    </p>}
    {operation && operation.projectId !== selected &&
      <p role="status">Finishing an icon change for another project…</p>}
    {notice && <p role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}
  </div>;
}
