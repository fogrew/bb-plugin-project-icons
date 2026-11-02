import { useEffect, useRef, useState } from "react";
import type { EditorProps } from "./image-editor";
import { snapshotIcon } from "../lib/image-processing";

// One active PNG draft; all sources share the same ownership and Save outcome rules.
export function usePngDraft({ project, state, busy, registerCancel }: EditorProps, reset: () => void, afterSave?: () => void) {
  const [snapshot, setSnapshot] = useState<ReturnType<typeof snapshotIcon> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const callbacks = useRef({ reset, afterSave });
  callbacks.current = { reset, afterSave };
  const current = (version: number) => version === generation.current && state.getSnapshot().selected === project.id;
  const cancel = () => {
    generation.current += 1;
    setSnapshot(null); setLoading(false); setError("");
    callbacks.current.reset();
  };
  useEffect(() => {
    const unregister = registerCancel?.(cancel);
    const unsubscribe = state.subscribe(() => { if (state.getSnapshot().selected !== project.id) cancel(); });
    return () => { unregister?.(); unsubscribe(); generation.current += 1; callbacks.current.reset(); };
  }, [state, project.id, registerCancel]);
  const render = async (draw: (canvas: HTMLCanvasElement) => void | Promise<void>, failure: string) => {
    if (busy) return;
    const version = ++generation.current;
    setSnapshot(null); setLoading(true); setError("");
    try {
      const canvas = document.createElement("canvas");
      await draw(canvas);
      if (current(version)) setSnapshot(snapshotIcon(canvas));
    } catch {
      if (current(version)) setError(failure);
    } finally { if (current(version)) setLoading(false); }
  };
  const save = async () => {
    if (!snapshot || loading || busy || state.getSnapshot().selected !== project.id) return;
    const version = generation.current;
    const saved = callbacks.current.afterSave;
    const result = await state.mutate("save", async () => {
      if (!current(version)) throw new Error("Draft cancelled.");
      return snapshot.base64;
    }, project.id);
    if (result === "success" && current(version)) { saved?.(); cancel(); }
  };
  return { snapshot, loading, error, render, save, cancel };
}
