import { useEffect, useRef, useState } from "react";

export type PeerArtworkResult =
  | { status: "unavailable"; reason: string }
  | { status: "none" }
  | { status: "glyph" }
  | { status: "image"; pluginVersion: string };
export type PeerArtworkApi = {
  probe(projectId: string): Promise<PeerArtworkResult>;
  fetchImage(projectId: string, signal: AbortSignal): Promise<File>;
};
type View = { phase: "idle" } | { phase: "working" } | { phase: "message"; text: string; alert: boolean } | { phase: "loaded"; epoch: number };

const UNAVAILABLE: Record<string, string> = {
  "not-installed": "The Homepage plugin is not installed.",
  disabled: "The Homepage plugin is disabled.",
  incompatible: "The installed Homepage plugin is not compatible (0.2.7 or newer is required).",
  "not-running": "The Homepage plugin is not running.",
  timeout: "Homepage did not respond in time. Try again.",
  malformed: "Homepage returned an unexpected response.",
};

export function PeerArtwork({ api, projectId, busy, replaces, epoch, onFile }: {
  api: PeerArtworkApi; projectId: string; busy: boolean; replaces: boolean; epoch: () => number; onFile(file: File): void;
}) {
  const [view, setView] = useState<View>({ phase: "idle" });
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const stop = () => { generation.current += 1; controller.current?.abort(); controller.current = null; };
  useEffect(() => stop, []);
  const run = async () => {
    stop();
    const version = generation.current;
    const abort = controller.current = new AbortController();
    const started = epoch();
    const live = () => version === generation.current && epoch() === started;
    const say = (text: string, alert = true) => { if (version === generation.current) setView({ phase: "message", text, alert }); };
    setView({ phase: "working" });
    try {
      const result = await api.probe(projectId);
      if (!live()) { if (version === generation.current) setView({ phase: "idle" }); return; }
      if (result.status === "unavailable") return say(UNAVAILABLE[result.reason] ?? "Homepage artwork is unavailable.");
      if (result.status === "none") return say("Homepage has no artwork for this project.", false);
      if (result.status === "glyph") return say("Homepage shows a built-in glyph for this project. Glyphs cannot be imported; use the Glyph tab instead.", false);
      const file = await api.fetchImage(projectId, abort.signal);
      if (!live()) { if (version === generation.current) setView({ phase: "idle" }); return; }
      onFile(file);
      setView({ phase: "loaded", epoch: epoch() });
    } catch (error) {
      if (abort.signal.aborted) return;
      say(`Could not use Homepage artwork: ${error instanceof Error ? error.message : "read failed"}.`);
    }
  };
  const blocked = busy || view.phase === "working";
  return <div className="bb-project-icons-repository">
    <button type="button" aria-disabled={blocked} onClick={() => { if (!blocked) void run(); }}>Use Homepage artwork</button>
    {view.phase === "working" && <p role="status">Checking Homepage…</p>}
    {view.phase === "message" && <p role={view.alert ? "alert" : "status"}>{view.text}</p>}
    {view.phase === "loaded" && view.epoch === epoch() && <p role="status" className="bb-project-icons-help">
      Previewing a snapshot of Homepage artwork. Nothing is saved until you press Save{replaces ? "; saving replaces the current icon" : ""}. Later Homepage changes will not update it.
    </p>}
  </div>;
}
