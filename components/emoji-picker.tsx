import { useEffect, useId, useMemo, useRef, useState } from "react";
import { experimental_usePluginId } from "@get-bb/plugin-sdk/app";
import type { EditorProps } from "./image-editor";
import { emojiCatalog, searchEmoji, type Emoji } from "../lib/emoji-catalog";
import { createRecents } from "../lib/emoji-recents";
import { drawEmoji } from "../lib/emoji-rendering";
import { snapshotIcon } from "../lib/image-processing";
import { IconPreview } from "./icon-preview";

function Choices({ items, selected, busy, label, choose }: {
  items: Emoji[]; selected: string; busy: boolean; label: string; choose: (entry: Emoji) => void;
}) {
  const [active, setActive] = useState("");
  const focusId = items.some(item => item.id === active) ? active : items[0]?.id;
  return <div role="group" aria-label={label} className="bb-project-icons-emojis" onKeyDown={event => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1
      : event.key === "ArrowDown" ? index + 6 : event.key === "ArrowUp" ? index - 6 : null;
    if (next === null) return;
    event.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
  }}>
    {items.map(entry => <button key={entry.id} type="button" disabled={busy}
      aria-label={entry.label} title={entry.label} aria-pressed={entry.id === selected}
      tabIndex={entry.id === focusId ? 0 : -1} onFocus={() => setActive(entry.id)} onClick={() => choose(entry)}>
      <span aria-hidden="true">{entry.value}</span>
    </button>)}
  </div>;
}

export function EmojiPicker({ project, state, busy, registerCancel }: EditorProps) {
  const id = useId();
  const pluginId = experimental_usePluginId();
  const history = useMemo(() => createRecents(pluginId, emojiCatalog.map(entry => entry.id)), [pluginId]);
  const [recentIds, setRecentIds] = useState(() => history.read());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [snapshot, setSnapshot] = useState<ReturnType<typeof snapshotIcon> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const search = useRef<HTMLInputElement>(null);
  const cancel = () => {
    generation.current += 1;
    setSnapshot(null); setSelected(""); setLoading(false); setError("");
  };
  useEffect(() => {
    const unregisterCancel = registerCancel?.(cancel);
    const unsubscribe = state.subscribe(() => {
      if (state.getSnapshot().selected !== project.id) cancel();
    });
    const refreshRecents = () => setRecentIds(history.read());
    window.addEventListener("storage", refreshRecents);
    return () => {
      unregisterCancel?.();
      generation.current += 1;
      unsubscribe();
      window.removeEventListener("storage", refreshRecents);
    };
  }, [state, project.id, history, registerCancel]);
  const choose = async (entry: Emoji) => {
    if (busy) return;
    const version = ++generation.current;
    setSelected(entry.id); setSnapshot(null); setLoading(true); setError("");
    try {
      await document.fonts.ready;
      if (version !== generation.current || state.getSnapshot().selected !== project.id) return;
      const canvas = document.createElement("canvas");
      drawEmoji(canvas, entry.value);
      setSnapshot(snapshotIcon(canvas));
    } catch {
      if (version === generation.current) setError("Could not render this emoji. Choose another emoji or an image.");
    } finally {
      if (version === generation.current) setLoading(false);
    }
  };
  const save = async () => {
    if (!snapshot || loading || busy || state.getSnapshot().selected !== project.id) return;
    const version = generation.current;
    const result = await state.mutate("save", async () => {
      if (version !== generation.current || state.getSnapshot().selected !== project.id) throw new Error("Draft cancelled.");
      return snapshot.base64;
    }, project.id);
    if (result === "success" && version === generation.current && state.getSnapshot().selected === project.id) {
      setRecentIds(history.add(selected));
      cancel();
      search.current?.focus();
    }
  };
  const results = searchEmoji(query);
  const recents = recentIds.flatMap(recentId => emojiCatalog.filter(entry => entry.id === recentId));
  return <div className="bb-project-icons-crop" onKeyDown={event => {
    if (event.key === "Escape" && !busy) { event.preventDefault(); cancel(); search.current?.focus(); }
  }}>
    <label htmlFor={id}>Search emoji</label>
    <input ref={search} id={id} type="search" value={query} disabled={busy}
      aria-describedby={`${id}-help`} onChange={event => setQuery(event.target.value)} placeholder="Search English names or emoji" />
    <p id={`${id}-help`} className="bb-project-icons-help">A small local selection, including skin tone variants. Use arrows to browse, Enter or Space to choose. Appearance depends on your device before saving; unsupported sequences may show separate symbols. Check the PNG preview. Saved appearance is shared across clients.</p>
    {recents.length > 0 && <section aria-label="Recent emoji" className="bb-project-icons-crop">
      <div className="bb-project-icons-actions"><span>Recent emoji</span>
        <button type="button" disabled={busy} onClick={() => { setRecentIds(history.clear()); search.current?.focus(); }}>Clear recents</button>
      </div>
      <Choices items={recents} label="Recent emoji choices" selected={selected} busy={busy} choose={entry => void choose(entry)} />
    </section>}
    <p role="status" className="bb-project-icons-help">{results.length ? `${results.length} emoji results` : "No matching emoji."}</p>
    <Choices items={results} label="Emoji results" selected={selected} busy={busy} choose={entry => void choose(entry)} />
    {loading && <p role="status">Rendering emoji…</p>}
    {error && <p role="alert">{error}</p>}
    {snapshot && <IconPreview url={snapshot.url} name={project.name} />}
    {(snapshot || loading || error) && <div className="bb-project-icons-actions">
      <button type="button" disabled={busy || loading || !snapshot} onClick={() => void save()}>Save</button>
      <button type="button" disabled={busy} onClick={() => { cancel(); search.current?.focus(); }}>Cancel</button>
    </div>}
  </div>;
}
