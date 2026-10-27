import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { filterProjects, type Project } from "../settings-state";

type Props = {
  projects: Project[];
  selected: string;
  query: string;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
  iconUrl: (id: string, revision: number) => string;
};

function IconPreview({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="bb-project-icons-placeholder">Preview unavailable</span>
    : <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export function ProjectList({ projects, selected, query, onQuery, onSelect, iconUrl }: Props) {
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const rows = filterProjects(projects, query);
  const names = new Map<string, number>();
  projects.forEach((row) => names.set(row.name, (names.get(row.name) ?? 0) + 1));
  const buttons = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
  const navigate = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const items = buttons();
    const current = items.indexOf(event.target as HTMLButtonElement);
    if (current < 0) return;
    let next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      // Measure rendered rows so navigation follows the responsive grid, including a partial last row.
      const rects = items.map((item) => item.getBoundingClientRect());
      const origin = rects[current];
      const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
      const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
      const candidates = rects.map((rect, index) => ({ rect, index })).filter(({ rect }) => horizontal
        ? Math.abs(rect.top - origin.top) < 1 && (forward ? rect.left > origin.left : rect.left < origin.left)
        : forward ? rect.top > origin.top : rect.top < origin.top);
      candidates.sort((a, b) => horizontal
        ? Math.abs(a.rect.left - origin.left) - Math.abs(b.rect.left - origin.left)
        : Math.abs(a.rect.top - origin.top) - Math.abs(b.rect.top - origin.top) ||
          Math.abs(a.rect.left - origin.left) - Math.abs(b.rect.left - origin.left));
      next = candidates[0]?.index ?? current;
    }
    if (next < 0) return;
    event.preventDefault();
    items[next]?.focus();
  };
  return <div className="bb-project-icons-picker">
    <label htmlFor={id}>Search projects</label>
    <input id={id} type="search" value={query} placeholder="Search by name or project ID"
      aria-controls={`${id}-list`} aria-describedby={`${id}-help`}
      onChange={(event) => onQuery(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" && !event.nativeEvent.isComposing && rows.length) {
          event.preventDefault();
          buttons()[0]?.focus();
        }
      }} />
    <p id={`${id}-help`} className="bb-project-icons-help">Tab or arrow keys move between cards; Home/End reach the first/last. Enter or Space selects the editor below.</p>
    <p role="status" className="bb-project-icons-help">{rows.length} of {projects.length} projects</p>
    <ul id={`${id}-list`} ref={list} className="bb-project-icons-list" aria-label="Projects" onKeyDown={navigate}>
      {rows.map((row) => <li key={row.id}>
        <button type="button" className="bb-project-icons-project" aria-pressed={selected === row.id}
          onClick={() => onSelect(row.id)}>
          <span className="bb-project-icons-thumbnail">
            {row.revision !== null ? <IconPreview key={iconUrl(row.id, row.revision)} src={iconUrl(row.id, row.revision)} />
              : <span className="bb-project-icons-placeholder" aria-hidden="true">No image</span>}
          </span>
          <span className="bb-project-icons-identity">
            <span className="bb-project-icons-name">{row.name}</span>
            {(names.get(row.name) ?? 0) > 1 && <small>{row.id}</small>}
          </span>
          <span className="bb-project-icons-assignment">{row.revision !== null ? "Icon assigned" : "No icon yet"}</span>
          <span className="bb-project-icons-action">{selected === row.id ? "Selected" : "Edit icon"}</span>
        </button>
      </li>)}
    </ul>
    {projects.length > 0 && rows.length === 0 && <div className="bb-project-icons-empty">
      <p role="status">No projects match your search.</p>
      <button type="button" onClick={() => onQuery("")}>Clear search</button>
    </div>}
    {selected && !rows.some((row) => row.id === selected) &&
      <p className="bb-project-icons-help">The selected project is outside these search results.</p>}
  </div>;
}
