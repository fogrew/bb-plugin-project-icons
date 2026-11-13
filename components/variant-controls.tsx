import { useId, useState, useSyncExternalStore } from "react";
import { PngPreview } from "./icon-preview";
import type { createSettingsState, Project, Target } from "../settings-state";
import { THEMES, type Theme } from "../lib/theme-variants";

const LABELS: Record<Target, string> = { default: "Default (every theme)", light: "Light theme only", dark: "Dark theme only" };

export function TargetPicker({ project, state }: { project: Project; state: ReturnType<typeof createSettingsState> }) {
  const { target, operation } = useSyncExternalStore(state.subscribe, state.getSnapshot);
  const name = useId();
  const label = useId();
  const help = useId();
  const hasDefault = project.revision !== null;
  const [open, setOpen] = useState(false);
  return <details className="bb-project-icons-target" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Light and dark variants (optional)</summary>
    <div role="radiogroup" aria-labelledby={label} className="bb-project-icons-target-options">
      <span id={label}>Apply the next icon to</span>
      {(["default", ...THEMES] as const).map(item => <label key={item}>
        <input type="radio" name={name} aria-describedby={help} checked={target === item} disabled={operation !== null || (item !== "default" && !hasDefault)}
          onChange={() => state.setTarget(item)} />
        {LABELS[item]}
      </label>)}
    </div>
    <small id={help} className="bb-project-icons-help">
      {hasDefault
        ? "A light or dark variant replaces the default icon only while BB uses that theme."
        : "Save a default icon first; light and dark variants are optional additions to it."}
    </small>
  </details>;
}

export function VariantPreviews({ project, iconUrl }: { project: Project; iconUrl: (id: string, revision: number, theme?: Theme) => string }) {
  const present = THEMES.filter(theme => project.variants?.[theme] != null);
  if (project.revision === null || !present.length) return null;
  return <div className="bb-project-icons-variants">
    {present.map(theme => <span key={theme} className={`bb-project-icons-surface bb-project-icons-surface-${theme}`}>
      <PngPreview url={iconUrl(project.id, project.variants![theme]!, theme)} label={`${theme[0].toUpperCase()}${theme.slice(1)} theme icon`} />
      <small>{theme[0].toUpperCase()}{theme.slice(1)} variant</small>
    </span>)}
  </div>;
}
