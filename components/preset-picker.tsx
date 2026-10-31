import { useEffect, useId, useMemo, useRef, useState } from "react";
import { experimental_usePluginId } from "@get-bb/plugin-sdk/app";
import type { EditorProps } from "./image-editor";
import { explicitInitials, foreground, palette, projectInitials, searchGlyphs, type ColorId } from "../lib/icon-presets";
import { createColorRecents } from "../lib/color-recents";
import { drawPreset } from "../lib/preset-rendering";
import { usePngDraft } from "./use-png-draft";
import { DraftOutput } from "./draft-output";

function Choices({ label, children }: { label: string; children: React.ReactNode }) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.forEach((button, index) => { button.tabIndex = index === Math.min(active, buttons.length - 1) ? 0 : -1; });
  }, [children, active]);
  return <div ref={ref} role="group" aria-label={label} className="bb-project-icons-presets" onFocus={event => {
    const buttons = Array.from(event.currentTarget.querySelectorAll("button"));
    const index = event.target instanceof HTMLButtonElement ? buttons.indexOf(event.target) : -1;
    if (index >= 0) setActive(index);
  }} onKeyDown={event => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1
      : event.key === "ArrowDown" ? index + 4 : event.key === "ArrowUp" ? index - 4 : null;
    if (next === null) return;
    event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
  }}>{children}</div>;
}

export function PresetPicker(props: EditorProps & { source: "glyph" | "initials" }) {
  const { project, busy, source } = props;
  const id = useId();
  const pluginId = experimental_usePluginId();
  const history = useMemo(() => createColorRecents(pluginId, palette.map(p => p.id)), [pluginId]);
  const [recentIds, setRecentIds] = useState(() => history.read());
  const [query, setQuery] = useState("");
  const [glyph, setGlyph] = useState("");
  const [text, setText] = useState(() => projectInitials(project.name));
  const [color, setColor] = useState<ColorId>("slate");
  const input = useRef<HTMLInputElement>(null);
  const focus = () => input.current?.focus();
  const draft = usePngDraft(props, () => { setGlyph(""); setText(projectInitials(project.name)); },
    () => { setRecentIds(history.add(color)); focus(); });
  const render = (nextText: string, nextGlyph: string, nextColor: ColorId) =>
    draft.render(async canvas => {
      if (source === "initials") {
        const initials = explicitInitials(nextText);
        await document.fonts.ready;
        drawPreset(canvas, { initials }, nextColor);
      } else drawPreset(canvas, { glyph: nextGlyph }, nextColor);
    }, source === "initials" ? "Use one or two visible characters (up to 128 code units), without controls. Check font support in the preview."
      : "Could not render this glyph. Choose another glyph.");
  useEffect(() => {
    if (source === "initials") void render(text, glyph, color);
    // Start a predictable project-name draft once when this source mounts.
  }, []);
  useEffect(() => {
    const refresh = () => setRecentIds(history.read());
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [history]);
  const chooseColor = (next: ColorId) => {
    setColor(next);
    if (source === "initials" || glyph) void render(text, glyph, next);
  };
  const colors = (ids: readonly string[], recent: boolean) => <Choices label={recent ? "Recent colors" : "Icon colors"}>
    {ids.flatMap(colorId => palette.filter(p => p.id === colorId)).map(p => <button key={p.id} type="button"
      disabled={busy} aria-pressed={p.id === color} aria-label={`${recent ? "Recent " : ""}${p.label}`}
      style={{ backgroundColor: p.background, color: foreground(p.background) }} onClick={() => chooseColor(p.id)}>
      {p.label}{p.id === color ? " ✓" : ""}
    </button>)}
  </Choices>;
  const results = searchGlyphs(query);
  return <div className="bb-project-icons-crop" onKeyDown={event => {
    if (event.key === "Escape" && !busy) { event.preventDefault(); draft.cancel(); focus(); }
  }}>
    <label htmlFor={id}>{source === "glyph" ? "Search glyphs" : "Initials"}</label>
    <input ref={input} id={id} type={source === "glyph" ? "search" : "text"} disabled={busy}
      maxLength={source === "initials" ? 128 : undefined} value={source === "glyph" ? query : text}
      aria-describedby={`${id}-help`} onChange={event => {
        if (source === "glyph") setQuery(event.target.value);
        else { setText(event.target.value); void render(event.target.value, glyph, color); }
      }} />
    <p id={`${id}-help`} className="bb-project-icons-help">{source === "glyph"
      ? "Eight locally bundled Feather glyphs. Search English names or keywords. Use arrows to browse and Enter or Space to choose."
      : "One or two grapheme clusters; up to 128 code units. Default: first clusters of two words, or first two clusters of one word, preserving case. Fonts and complex-script shaping depend on your device. Missing glyphs or color emoji may ignore the chosen foreground; check the actual PNG preview."}</p>
    {source === "glyph" && <>
      <p role="status" className="bb-project-icons-help">{results.length ? `${results.length} glyph results` : "No matching glyphs."}</p>
      <Choices label="Glyph results">{results.map(g => <button key={g.id} type="button" disabled={busy}
        aria-label={g.label} aria-pressed={g.id === glyph} title={g.label}
        onClick={() => { setGlyph(g.id); void render(text, g.id, color); }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={g.path} /></svg>
        <span>{g.label}</span>
      </button>)}</Choices>
    </>}
    <span>Background color</span>
    {colors(palette.map(p => p.id), false)}
    {recentIds.length > 0 && <section className="bb-project-icons-crop" aria-label="Recent color choices">
      <div className="bb-project-icons-actions"><span>Recent colors</span>
        <button type="button" disabled={busy} onClick={() => { setRecentIds(history.clear()); focus(); }}>Clear recent colors</button>
      </div>
      {colors(recentIds, true)}
    </section>}
    <DraftOutput draft={draft} name={project.name} busy={busy} focus={focus} />
  </div>;
}
