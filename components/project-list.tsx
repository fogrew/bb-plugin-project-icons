import { useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { filterProjects, type Project } from "../settings-state";

type Props = {
  projects: Project[];
  selected: string;
  query: string;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
  iconUrl: (id: string, revision: number) => string;
  children: ReactNode;
};

function IconPreview({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="bb-project-icons-placeholder">Preview unavailable</span>
    : <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export function ProjectList({ projects, selected, query, onQuery, onSelect, iconUrl, children }: Props) {
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const rows = filterProjects(projects, query);
  const [opened, setOpened] = useState(false);
  const [activation, setActivation] = useState(0);
  const panel = useRef<HTMLLIElement>(null);
  const outside = opened && !rows.some((row) => row.id === selected)
    ? projects.find((row) => row.id === selected) : undefined;
  const visible = outside ? [...rows, outside] : rows;
  useLayoutEffect(() => {
    if (!activation || !panel.current) return;
    const element = panel.current;
    let parent = element.parentElement;
    while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
    const bounds = parent?.getBoundingClientRect();
    const top = Math.max(0, bounds?.top ?? 0);
    const bottom = Math.min(innerHeight, bounds?.bottom ?? innerHeight);
    const rect = element.getBoundingClientRect();
    const input = element.querySelector<HTMLInputElement>('input[type="file"]');
    const revealBottom = Math.min(rect.bottom, (input?.getBoundingClientRect().bottom ?? rect.top) + 8);
    const delta = rect.top < top ? rect.top - top : Math.max(0, Math.min(revealBottom, rect.top + bottom - top) - bottom);
    if (delta) (parent ?? window).scrollBy({ top: delta,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [activation]);
  const names = new Map<string, number>();
  projects.forEach((row) => names.set(row.name, (names.get(row.name) ?? 0) + 1));
  const buttons = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>(":scope > li > button.bb-project-icons-project") ?? []);
  const detail = <li key="editor" id={`${id}-editor`} ref={panel}
    className="bb-project-icons-panel" hidden={!opened}>{children}</li>;
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
    <p id={`${id}-help`} className="bb-project-icons-help bb-project-icons-keyboard-help">Tab or arrow keys move between project headers; Home/End reach the first/last. Enter or Space opens the editor after that header.</p>
    <p role="status" className="bb-project-icons-help">{rows.length} of {projects.length} projects</p>
    <ul id={`${id}-list`} ref={list} className="bb-project-icons-list" aria-label="Projects" onKeyDown={navigate}>
      {[...visible.flatMap((row) => [<li key={row.id}>
        {outside?.id === row.id && <p className="bb-project-icons-help">Selected project outside search results. Its editor stays open.</p>}
        <button type="button" className="bb-project-icons-project" aria-pressed={selected === row.id}
          aria-expanded={opened && selected === row.id} aria-controls={`${id}-editor`}
          onClick={() => { onSelect(row.id); setOpened(true); setActivation((value) => value + 1); }}>
          <span className="bb-project-icons-thumbnail">
            {row.revision !== null ? <IconPreview key={iconUrl(row.id, row.revision)} src={iconUrl(row.id, row.revision)} />
              : <span className="bb-project-icons-placeholder" aria-hidden="true">No image</span>}
          </span>
          <span className="bb-project-icons-identity">
            <span className="bb-project-icons-name">{row.name}</span>
            {(names.get(row.name) ?? 0) > 1 && <small>{row.id}</small>}
          </span>
          <span className="bb-project-icons-assignment">{row.revision !== null ? "Icon assigned" : "No icon yet"}</span>
          <span className="bb-project-icons-action">{opened && selected === row.id ? "Editing" : "Edit icon"}</span>
          <svg className="bb-project-icons-chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </li>, ...(selected === row.id ? [detail] : [])]),
      ...(!visible.some((row) => row.id === selected) ? [detail] : [])]}
    </ul>
    {projects.length > 0 && rows.length === 0 && <div className="bb-project-icons-empty">
      <p role="status">No projects match your search.</p>
      <button type="button" onClick={() => onQuery("")}>Clear search</button>
    </div>}
  </div>;
}
