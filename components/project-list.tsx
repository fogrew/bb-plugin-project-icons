import { useId, useRef } from "react";
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

export function ProjectList({ projects, selected, query, onQuery, onSelect, iconUrl }: Props) {
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const rows = filterProjects(projects, query);
  const names = new Map<string, number>();
  projects.forEach((row) => names.set(row.name, (names.get(row.name) ?? 0) + 1));
  const buttons = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
  const navigate = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const items = buttons();
    const current = items.indexOf(event.target as HTMLButtonElement);
    if (current < 0) return;
    const next = event.key === "ArrowDown" ? Math.min(current + 1, items.length - 1)
      : event.key === "ArrowUp" ? Math.max(current - 1, 0)
      : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1;
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
    <p id={`${id}-help`} className="bb-project-icons-help">Use arrow keys to move between projects; Enter or Space selects.</p>
    <p role="status" className="bb-project-icons-help">{rows.length} of {projects.length} projects</p>
    <ul id={`${id}-list`} ref={list} className="bb-project-icons-list" aria-label="Projects" onKeyDown={navigate}>
      {rows.map((row) => <li key={row.id}>
        <button type="button" className="bb-project-icons-project" aria-pressed={selected === row.id}
          onClick={() => onSelect(row.id)}>
          <span className="bb-project-icons-thumbnail" aria-hidden="true">
            {row.revision !== null ? <img src={iconUrl(row.id, row.revision)} alt="" loading="lazy" /> : <span>—</span>}
          </span>
          <span className="bb-project-icons-identity">
            <span className="bb-project-icons-name">{row.name}</span>
            {(names.get(row.name) ?? 0) > 1 && <small>{row.id}</small>}
          </span>
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
