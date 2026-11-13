import { useId } from "react";
import { PEERS, peerName } from "../lib/peers";
import type { Project } from "../settings-state";

export function AutomaticToggle({ enabled, busy, onChange }: { enabled: boolean; busy: boolean; onChange(enabled: boolean): void }) {
  const help = useId();
  return <div className="bb-project-icons-adoption">
    <label><input type="checkbox" checked={enabled} disabled={busy} aria-describedby={help}
      onChange={event => onChange(event.target.checked)} /> Use artwork from installed plugins automatically</label>
    <p id={help} className="bb-project-icons-help">
      Projects without an icon take artwork from {PEERS.map(peer => peer.name).join(", ")} when that plugin is installed. Saving or removing an icon turns this off for that project; icons already imported are kept when you disable this.
    </p>
  </div>;
}

export function AdoptionStatus({ project, automaticAdoption, busy, onEnable }: {
  project: Project; automaticAdoption: boolean; busy: boolean; onEnable(): void;
}) {
  const { source } = project;
  if (project.revision !== null) {
    return <p role="status" className="bb-project-icons-help bb-project-icons-source">
      {source
        ? `From ${peerName(source.pluginId)}, imported ${new Date(source.importedAt).toLocaleDateString()}. It follows that plugin's artwork until you save or remove this icon.`
        : "Set manually. Automatic icons never replace it."}
    </p>;
  }
  if (project.automatic === false) {
    return <div className="bb-project-icons-source">
      <p role="status" className="bb-project-icons-help">Automatic icons are off for this project because its icon was removed.</p>
      <button type="button" disabled={busy} onClick={onEnable}>Re-enable automatic icons</button>
    </div>;
  }
  return <p role="status" className="bb-project-icons-help bb-project-icons-source">
    {automaticAdoption
      ? "Automatic initials. Artwork from an installed supported plugin is used automatically when it exists."
      : "Automatic adoption is turned off in Project icons settings."}
  </p>;
}
