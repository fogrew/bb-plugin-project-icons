import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { MAX_PAYLOAD_CHARS } from "../lib/icon-transfer";

export type PreviewEntry = { sourceId: string; name: string; image: string; hash: string; target: string | null };
export type PreviewProject = { id: string; name: string; revision: number | null; hash: string | null };
type Rejected = { status: "rejected"; code: string; message: string };
type Decision = { sourceId: string; targetId: string; expectedRevision: number | null };
export type TransferApi = {
  exportIcons(): Promise<{ status: "ok"; json: string; count: number; skipped: number } | Rejected>;
  preview(payload: string): Promise<{ status: "ok"; entries: PreviewEntry[]; projects: PreviewProject[] } | Rejected>;
  apply(payload: string, decisions: Decision[]): Promise<
    { status: "imported"; imported: number; unchanged: number } | { status: "failed"; rolledBack: boolean } | Rejected>;
};
type Notice = { kind: "error" | "success"; text: string };
type Review = { payload: string; entries: PreviewEntry[]; projects: PreviewProject[]; choices: Record<string, string> };
type Outcome = "skip" | "add" | "replace" | "same";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const FILE_NAME = "project-icons.json";

export function saveFile(text: string, name = FILE_NAME) {
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
  const generation = useRef(0);
  const help = useId();
  useEffect(() => () => { generation.current += 1; }, []);

  const exportAll = async () => {
    const version = ++generation.current;
    setBusy("Exporting icons…");
    setNotice(null);
    try {
      const result = await api.exportIcons();
      if (version !== generation.current) return;
      if (result.status !== "ok") setNotice({ kind: "error", text: result.message });
      else if (result.count === 0) setNotice({ kind: "error", text: "No project has an icon to export yet." });
      else {
        saveFile(result.json);
        setNotice({ kind: "success", text: `Exported ${plural(result.count, "icon")} to ${FILE_NAME}.${result.skipped ? ` ${plural(result.skipped, "unreadable icon")} left out.` : ""}` });
      }
    } catch { if (version === generation.current) setNotice({ kind: "error", text: "Could not export icons. Try again." }); }
    finally { if (version === generation.current) setBusy(null); }
  };

  const showPreview = async (payload: string, version: number) => {
    try {
      const result = await api.preview(payload);
      if (version !== generation.current) return;
      if (result.status !== "ok") setNotice({ kind: "error", text: result.message });
      else if (result.entries.length === 0) setNotice({ kind: "error", text: "The file contains no icons." });
      else {
        setConfirmed(false);
        setReview({ payload, entries: result.entries, projects: result.projects,
          choices: Object.fromEntries(result.entries.map(entry => [entry.sourceId, entry.target ?? ""])) });
      }
    } catch { if (version === generation.current) setNotice({ kind: "error", text: "Could not check the file. Try again." }); }
  };

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const version = ++generation.current;
    setNotice(null);
    setReview(null);
    if (file.size > MAX_PAYLOAD_CHARS) { setNotice({ kind: "error", text: "That file is larger than 12 MB." }); return; }
    setBusy("Checking file…");
    try {
      const payload = await file.text();
      if (version === generation.current) await showPreview(payload, version);
    } catch { if (version === generation.current) setNotice({ kind: "error", text: "Could not read the file." }); }
    finally { if (version === generation.current) setBusy(null); }
  };

  const cancel = () => {
    generation.current += 1;
    setReview(null);
    setConfirmed(false);
    setNotice(null);
  };

  const byId = new Map((review?.projects ?? []).map(project => [project.id, project]));
  const rows = (review?.entries ?? []).map(entry => {
    const target = byId.get(review!.choices[entry.sourceId] ?? "");
    const outcome: Outcome = !target ? "skip" : target.hash === entry.hash ? "same" : target.revision === null ? "add" : "replace";
    return { entry, target, outcome };
  });
  const count = (outcome: Outcome) => rows.filter(row => row.outcome === outcome).length;
  const chosen = rows.flatMap(row => row.target ? [row.target.id] : []);
  const clash = new Set(chosen).size !== chosen.length;
  const imports = count("add") + count("replace");
  const canImport = !busy && !clash && imports > 0 && (count("replace") === 0 || confirmed);

  const apply = async () => {
    if (!review || !canImport) return;
    const version = ++generation.current;
    const { payload } = review;
    const decisions = rows.flatMap(({ entry, target, outcome }) =>
      target && outcome !== "same" ? [{ sourceId: entry.sourceId, targetId: target.id, expectedRevision: target.revision }] : []);
    setBusy("Importing icons…");
    setNotice(null);
    try {
      const result = await api.apply(payload, decisions);
      if (version !== generation.current) return;
      if (result.status === "imported") {
        setReview(null);
        setNotice({ kind: "success", text: `Imported ${plural(result.imported, "icon")}${result.unchanged ? `; ${plural(result.unchanged, "icon")} already matched` : ""}.` });
        onImported();
      } else if (result.status === "failed") {
        setReview(null);
        setNotice({ kind: "error", text: result.rolledBack ? "The import failed and nothing was changed." : "The import failed and may be incomplete. Check your project icons." });
        onImported();
      } else if (result.code === "stale") {
        setNotice({ kind: "error", text: `${result.message} The preview was refreshed.` });
        await showPreview(payload, version);
      } else { setReview(null); setNotice({ kind: "error", text: result.message }); }
    } catch {
      if (version !== generation.current) return;
      setReview(null);
      setNotice({ kind: "error", text: "The import did not finish. Check your project icons before trying again." });
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
        <input type="file" accept=".json,application/json" disabled={busy !== null} aria-describedby={help} onChange={event => void choose(event)} />
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
                <select value={review.choices[entry.sourceId] ?? ""} disabled={busy !== null}
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
                {outcome === "add" && `Adds an icon to ${target!.name}.`}
                {outcome === "same" && `${target!.name} already has this exact icon. Nothing to change.`}
                {outcome === "replace" && `Replaces the current icon of ${target!.name}.`}
                {target && entry.target === target.id && target.name !== entry.name ? ` The file calls this project "${entry.name}".` : ""}
              </p>
            </div>
            {outcome === "replace" && <img className="bb-project-icons-current" src={iconUrl(target!.id, target!.revision!)} alt={`Current icon of ${target!.name}`} width={40} height={40} />}
          </li>;
        })}
      </ul>
      <p role="status">
        {plural(count("add"), "icon")} to add, {plural(count("replace"), "icon")} to replace, {count("same")} unchanged, {count("skip")} left out.
      </p>
      {clash && <p role="alert">Two icons are set to go into the same project. Change one of them.</p>}
      {count("replace") > 0 && <label className="bb-project-icons-confirm">
        <input type="checkbox" checked={confirmed} disabled={busy !== null} onChange={event => setConfirmed(event.target.checked)} />
        Replace {plural(count("replace"), "existing icon")}
      </label>}
      <div className="bb-project-icons-transfer-actions">
        <button type="button" disabled={!canImport} onClick={() => void apply()}>Import {plural(imports, "icon")}</button>
        <button type="button" disabled={busy !== null} onClick={cancel}>Cancel</button>
      </div>
    </section>}
  </fieldset>;
}
