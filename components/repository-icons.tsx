import { useEffect, useRef, useState } from "react";

type Candidate = { path: string; name: string };
export type RepositoryApi = {
  discover(projectId: string): Promise<{
    status: "ok" | "unavailable"; candidates: Candidate[]; rejected: { svg: number; unsupported: number }; truncated: boolean;
  }>;
  read(projectId: string, path: string): Promise<{ base64: string; mimeType: string }>;
};
type View =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "reading"; candidates: Candidate[]; note: string }
  | { phase: "done"; candidates: Candidate[]; note: string; error?: string }
  | { phase: "failed"; message: string };

const describe = (rejected: { svg: number; unsupported: number }, truncated: boolean) => [
  rejected.svg ? `${rejected.svg} SVG file(s) skipped: SVG is not supported.` : "",
  rejected.unsupported ? `${rejected.unsupported} file(s) skipped: unsupported format.` : "",
  truncated ? "More matches exist; showing the best ones." : "",
].filter(Boolean).join(" ");

export function RepositoryIcons({ api, projectId, busy, epoch, onFile }: {
  api: RepositoryApi; projectId: string; busy: boolean; epoch: () => number; onFile(file: File): void;
}) {
  const [view, setView] = useState<View>({ phase: "idle" });
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  const current = (version: number) => version === generation.current;
  const search = async () => {
    const version = ++generation.current;
    setView({ phase: "searching" });
    try {
      const result = await api.discover(projectId);
      if (!current(version)) return;
      if (result.status === "unavailable") {
        setView({ phase: "failed", message: "Repository files are unavailable (project folder missing or host offline)." });
        return;
      }
      setView({ phase: "done", candidates: result.candidates, note: describe(result.rejected, result.truncated) });
    } catch {
      if (current(version)) setView({ phase: "failed", message: "Could not search the repository. Try again." });
    }
  };
  const choose = async (candidate: Candidate, candidates: Candidate[], note: string) => {
    const version = ++generation.current;
    const started = epoch();
    setView({ phase: "reading", candidates, note });
    try {
      const file = await api.read(projectId, candidate.path);
      if (!current(version) || epoch() !== started) { if (current(version)) setView({ phase: "done", candidates, note }); return; }
      const bytes = Uint8Array.from(atob(file.base64), char => char.charCodeAt(0));
      setView({ phase: "done", candidates, note });
      onFile(new File([bytes], candidate.name, { type: file.mimeType }));
    } catch (error) {
      if (!current(version)) return;
      setView({ phase: "done", candidates, note, error: `Could not use ${candidate.path}: ${error instanceof Error ? error.message : "read failed"}.` });
    }
  };
  const candidates = view.phase === "reading" || view.phase === "done" ? view.candidates : [];
  const note = view.phase === "reading" || view.phase === "done" ? view.note : "";
  const blocked = busy || view.phase === "searching" || view.phase === "reading";
  return <div className="bb-project-icons-repository">
    <button type="button" aria-disabled={blocked} onClick={() => { if (!blocked) void search(); }}>
      Find icons in repository
    </button>
    {view.phase === "searching" && <p role="status">Searching repository…</p>}
    {view.phase === "reading" && <p role="status">Reading image…</p>}
    {view.phase === "failed" && <p role="alert">{view.message}</p>}
    {view.phase === "done" && candidates.length === 0 && <p role="status">No favicon, icon or logo images found.</p>}
    {candidates.length > 0 && <ul aria-label="Repository icon candidates" className="bb-project-icons-candidates">
      {candidates.map(candidate => <li key={candidate.path}>
        <button type="button" aria-disabled={busy || view.phase === "reading"} title={candidate.path}
          onClick={() => { if (!busy && view.phase !== "reading") void choose(candidate, candidates, note); }}>{candidate.path}</button>
      </li>)}
    </ul>}
    {note && <p className="bb-project-icons-help">{note}</p>}
    {view.phase === "done" && view.error && <p role="alert">{view.error}</p>}
  </div>;
}
