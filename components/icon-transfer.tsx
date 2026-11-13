import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { MAX_PAYLOAD_CHARS } from "../lib/icon-transfer";

export type PreviewEntry = { sourceId: string; name: string; image: string; hash: string; target: string | null };
export type PreviewProject = { id: string; name: string; revision: number | null; hash: string | null; automatic: boolean; variants: number };
type Rejected = { status: "rejected"; code: string; message: string };
type Decision = { sourceId: string; targetId: string; expectedRevision: number | null };
export type TransferApi = {
  save(text: string): Promise<boolean>;
  exportIcons(): Promise<{ status: "ok"; json: string; count: number; skipped: number; omittedVariants: number } | Rejected>;
  preview(payload: string): Promise<{ status: "ok"; entries: PreviewEntry[]; projects: PreviewProject[] } | Rejected>;
  apply(payload: string, decisions: Decision[]): Promise<
    { status: "imported"; imported: number; pinned: number; unchanged: number } | { status: "failed"; rolledBack: boolean } | Rejected>;
};
type Notice = { kind: "error" | "success"; text: string };
type Review = { payload: string; entries: PreviewEntry[]; projects: PreviewProject[]; choices: Record<string, string> };
type Outcome = "skip" | "add" | "replace" | "pin" | "same";

export const FILE_NAME = "project-icons.json";
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function downloadFile(text: string, name = FILE_NAME) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function label(project: PreviewProject, projects: PreviewProject[]) {
  return projects.filter(other => other.name === project.name).length > 1 ? `${project.name} (${project.id})` : project.name;
}

export function IconTransfer({ api, iconUrl, onImported }: {
  api: TransferApi; iconUrl: (id: string, revision: number) => string; onImported(): void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [refocus, setRefocus] = useState(0);
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const help = useId();
  useEffect(() => () => { generation.current += 1; }, []);
  const wantFocus = useRef(false);
  const requestFocus = () => { wantFocus.current = true; setRefocus(count => count + 1); };
  useEffect(() => {
    if (wantFocus.current && busy === null) { wantFocus.current = false; fileInput.current?.focus(); }
  }, [refocus, busy]);

  const exportAll = async () => {
    const version = ++generation.current;
    setBusy("Exporting icons…");
    setNotice(null);
    try {
      const result = await api.exportIcons();
      if (version !== generation.current) return;
      if (result.status !== "ok") setNotice({ kind: "error", text: result.message });
      else if (result.count === 0) setNotice({ kind: "error", text: "No project has an icon to export yet." });
      else if (!(await api.save(result.json))) setNotice({ kind: "error", text: "The file could not be saved." });
      else {
        setNotice({ kind: "success", text: `Exported ${plural(result.count, "icon")} to ${FILE_NAME}.${result.skipped ? ` ${plural(result.skipped, "unreadable icon")} left out.` : ""}${result.omittedVariants ? ` ${plural(result.omittedVariants, "light or dark variant")} not included.` : ""}` });
      }
    } catch { if (version === generation.current) setNotice({ kind: "error", text: "Could not export icons. Try again." }); }
    finally { if (version === generation.current) setBusy(null); }
  };

  const showPreview = async (payload: string, version: number, keep?: Record<string, string>) => {
    try {
      const result = await api.preview(payload);
      if (version !== generation.current) return;
      setConfirmed(false);
      if (result.status !== "ok") { setReview(null); setNotice({ kind: "error", text: result.message }); requestFocus(); }
      else if (result.entries.length === 0) { setReview(null); setNotice({ kind: "error", text: "The file contains no icons." }); requestFocus(); }
      else {
        const ids = new Set(result.projects.map(project => project.id));
        const choice = (entry: PreviewEntry) => {
          const kept = keep && Object.hasOwn(keep, entry.sourceId) ? keep[entry.sourceId] : undefined;
          return kept !== undefined && (kept === "" || ids.has(kept)) ? kept : entry.target ?? "";
        };
        setReview({ payload, entries: result.entries, projects: result.projects,
          choices: Object.fromEntries(result.entries.map(entry => [entry.sourceId, choice(entry)])) });
      }
    } catch { if (version === generation.current) { setReview(null); setNotice({ kind: "error", text: "Could not check the file. Try again." }); requestFocus(); } }
  };

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const version = ++generation.current;
    setNotice(null);
    setReview(null);
    if (file.size > MAX_PAYLOAD_CHARS) { setNotice({ kind: "error", text: "That file is larger than 12 MiB." }); requestFocus(); return; }
    setBusy("Checking file…");
    try {
      const payload = await file.text();
      if (version === generation.current) await showPreview(payload, version);
    } catch { if (version === generation.current) { setNotice({ kind: "error", text: "Could not read the file." }); requestFocus(); } }
    finally { if (version === generation.current) setBusy(null); }
  };

  const cancel = () => {
    generation.current += 1;
    setReview(null);
    setConfirmed(false);
    setNotice(null);
    requestFocus();
  };

  const byId = new Map((review?.projects ?? []).map(project => [project.id, project]));
  const rows = (review?.entries ?? []).map(entry => {
    const target = byId.get(review!.choices[entry.sourceId] ?? "");
    const outcome: Outcome = !target ? "skip"
      : target.hash === entry.hash ? (target.automatic ? "pin" : "same")
      : target.revision === null ? "add" : "replace";
    return { entry, target, outcome };
  });
  const count = (outcome: Outcome) => rows.filter(row => row.outcome === outcome).length;
  const chosen = rows.flatMap(row => row.target ? [row.target.id] : []);
  const clash = new Set(chosen).size !== chosen.length;
  const imports = count("add") + count("replace") + count("pin");
  const needsConfirm = count("replace") > 0 || count("pin") > 0;
  const confirmText = [
    count("replace") ? `Replace ${plural(count("replace"), "existing icon")}` : "",
    count("pin") ? `${count("replace") ? "keep" : "Keep"} ${plural(count("pin"), "icon")} as manual` : "",
  ].filter(Boolean).join(" and ");
  const canImport = !busy && !clash && imports > 0 && (!needsConfirm || confirmed);

  const apply = async () => {
    if (!review || !canImport) return;
    const version = ++generation.current;
    const { payload, choices } = review;
    const decisions = rows.flatMap(({ entry, target, outcome }) =>
      target && outcome !== "same" ? [{ sourceId: entry.sourceId, targetId: target.id, expectedRevision: target.revision }] : []);
    setBusy("Importing icons…");
    setNotice(null);
    try {
      const result = await api.apply(payload, decisions);
      if (version !== generation.current) return;
      if (result.status === "imported") {
        setReview(null);
        const extra = [
          result.pinned ? `${plural(result.pinned, "icon")} kept as manual` : "",
          result.unchanged ? `${plural(result.unchanged, "icon")} already matched` : "",
        ].filter(Boolean);
        setNotice({ kind: "success", text: `Imported ${plural(result.imported, "icon")}${extra.length ? `; ${extra.join("; ")}` : ""}.` });
        requestFocus();
        onImported();
      } else if (result.status === "failed") {
        setReview(null);
        setNotice({ kind: "error", text: result.rolledBack ? "The import failed and nothing was changed." : "The import failed and may be incomplete. Check your project icons." });
        requestFocus();
        onImported();
      } else if (result.code === "stale") {
        setNotice({ kind: "error", text: `${result.message} The preview was refreshed.` });
        await showPreview(payload, version, choices);
      } else {
        setReview(null);
        setNotice({ kind: "error", text: result.message });
        requestFocus();
      }
    } catch {
      if (version !== generation.current) return;
      setReview(null);
      setNotice({ kind: "error", text: "The import did not finish. Check your project icons before trying again." });
      requestFocus();
      onImported();
    } finally { if (version === generation.current) setBusy(null); }
  };

  return <fieldset className="bb-project-icons-transfer" aria-busy={busy !== null}>
    <legend>Export and import</legend>
    <p id={help} className="bb-project-icons-help">
      Export saves every project icon to a JSON file with only the project id and name. Import shows what would change before anything is written, and never matches projects by name on its own.
    </p>
    <div className="bb-project-icons-transfer-actions">
      <button type="button" disabled={busy !== null || review !== null} aria-describedby={help} onClick={() => void exportAll()}>Export icons</button>
      <label>Import icons from a file
        <input ref={fileInput} type="file" accept=".json,application/json" disabled={busy !== null} aria-describedby={help} onChange={event => void choose(event)} />
      </label>
    </div>
    {busy && <p role="status">{busy}</p>}
    {notice && <p role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}
    {review && <section aria-label="Import preview" className="bb-project-icons-review">
      <ul>
        {rows.map(({ entry, target, outcome }) => {
          const suggestions = review.projects.filter(project => project.name === entry.name);
          const others = review.projects.filter(project => project.name !== entry.name);
          return <li key={entry.sourceId}>
            <img src={`data:image/png;base64,${entry.image}`} alt="" width={40} height={40} />
            <div className="bb-project-icons-review-body">
              <strong>{entry.name || "(unnamed project)"}</strong>
              <label>Import into
                <select aria-label={`Import ${entry.name || "unnamed project"} into`} value={review.choices[entry.sourceId] ?? ""} disabled={busy !== null}
                  onChange={event => {
                    setConfirmed(false);
                    setReview({ ...review, choices: { ...review.choices, [entry.sourceId]: event.target.value } });
                  }}>
                  <option value="">Do not import</option>
                  {suggestions.map(project => <option key={project.id} value={project.id}>{label(project, review.projects)} (same name)</option>)}
                  {others.map(project => <option key={project.id} value={project.id}>{label(project, review.projects)}</option>)}
                </select>
              </label>
              <p role="status" className="bb-project-icons-help">
                {outcome === "skip" && (entry.target === null ? "No project here has this id. Choose a project to import into, or leave it out." : "Left out.")}
                {outcome === "add" && `Adds an icon to ${label(target!, review.projects)}.`}
                {outcome === "same" && `${label(target!, review.projects)} already has this exact icon. Nothing to change.`}
                {outcome === "pin" && `${label(target!, review.projects)} already has this exact icon from another plugin. Importing keeps it as a manual icon, so that plugin stops updating it.`}
                {outcome === "replace" && `Replaces the current icon of ${label(target!, review.projects)}.${target!.variants ? ` Its ${plural(target!.variants, "light or dark variant")} stay${target!.variants === 1 ? "s" : ""}.` : ""}`}
                {target && entry.target === target.id && target.name !== entry.name ? ` The file calls this project "${entry.name}".` : ""}
              </p>
            </div>
            {outcome === "replace" && <img className="bb-project-icons-current" src={iconUrl(target!.id, target!.revision!)} alt={`Current icon of ${label(target!, review.projects)}`} width={40} height={40} />}
          </li>;
        })}
      </ul>
      <p role="status">
        {plural(count("add"), "icon")} to add, {plural(count("replace"), "icon")} to replace, {count("pin")} to keep as manual, {count("same")} unchanged, {count("skip")} left out.
      </p>
      {clash && <p role="alert">Two icons are set to go into the same project. Change one of them.</p>}
      {needsConfirm && <label className="bb-project-icons-confirm">
        <input type="checkbox" checked={confirmed} disabled={busy !== null} onChange={event => setConfirmed(event.target.checked)} />
        {confirmText}
      </label>}
      <div className="bb-project-icons-transfer-actions">
        <button type="button" disabled={!canImport} onClick={() => void apply()}>Import {plural(imports, "icon")}</button>
        <button type="button" disabled={busy !== null} onClick={cancel}>Cancel</button>
      </div>
    </section>}
  </fieldset>;
}
