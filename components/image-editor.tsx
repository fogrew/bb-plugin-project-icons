import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { createSettingsState, Project } from "../settings-state";
import { createDraft } from "../lib/image-draft";
import { clampCrop, decodeImage, defaultCrop, drawIcon, encodeIcon, offsetBounds, type Crop } from "../lib/image-processing";

type Props = { project: Project; state: ReturnType<typeof createSettingsState>; busy: boolean };

export function ImageEditor({ project, state, busy }: Props) {
  const id = useId();
  const draft = useMemo(() => createDraft<ImageBitmap>(project.id, () => state.getSnapshot().selected), [project.id, state]);
  const [crop, setCrop] = useState<Crop>(defaultCrop);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const cancel = () => {
    request.current += 1;
    draft.cancel();
    setPreview("");
    setLoading(false);
    setError("");
    setCrop(defaultCrop);
  };
  useEffect(() => {
    // Subscribe directly so even an away-and-back selection in one React batch cancels the draft.
    const unsubscribe = state.subscribe(() => {
      if (state.getSnapshot().selected !== project.id) cancel();
    });
    return () => { unsubscribe(); request.current += 1; draft.cancel(); };
  }, [state, project.id, draft]);

  const render = (next: Crop) => {
    const image = draft.current();
    if (!image) return;
    const canvas = document.createElement("canvas");
    drawIcon(canvas, image, next);
    setPreview(canvas.toDataURL("image/png"));
  };
  const change = (next: Crop) => {
    const image = draft.current();
    if (!image) return;
    try {
      const bounded = clampCrop(image.width, image.height, next);
      render(bounded); setCrop(bounded); setError("");
    }
    catch { setError("Could not preview this image. Choose another image."); setPreview(""); }
  };
  const upload = async (file: File) => {
    const version = ++request.current;
    setLoading(true); setPreview(""); setError(""); setCrop(defaultCrop);
    try {
      if (await draft.load(() => decodeImage(file)) && version === request.current) render(defaultCrop);
    } catch {
      if (version === request.current) setError("Could not read image. Choose a PNG, JPEG, or WebP image under 2 MB.");
    } finally {
      if (version === request.current) setLoading(false);
    }
  };
  const save = async () => {
    const image = draft.current();
    if (!image || !preview || busy || state.getSnapshot().selected !== project.id) return;
    const version = request.current;
    await state.mutate("save", async () => {
      const canvas = document.createElement("canvas");
      drawIcon(canvas, image, crop);
      const base64 = await encodeIcon(canvas);
      if (version !== request.current || draft.current() !== image) throw new Error("Draft cancelled.");
      return base64;
    }, project.id);
    if (version === request.current && state.getSnapshot().notice?.kind === "success") cancel();
  };
  const image = draft.current();
  const bounds = image ? offsetBounds(image.width, image.height, crop) : { x: 0, y: 0 };
  return <div className="bb-project-icons-crop">
    <label htmlFor={id}>Choose image</label>
    <p id={`${id}-help`} className="bb-project-icons-help">PNG, JPEG, or WebP; up to 2 MB. Adjust the draft, then Save. Output: transparent 64 × 64 PNG.</p>
    <input ref={input} id={id} type="file" accept="image/png,image/jpeg,image/webp"
      aria-describedby={`${id}-help`} disabled={busy} onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void upload(file);
      }} />
    {loading && <p role="status">Reading image…</p>}
    {error && <p role="alert">{error}</p>}
    {preview && <>
      <figure className="bb-project-icons-crop-preview">
        <img className="bb-project-icons-large-sample" src={preview} alt="Enlarged draft icon" />
        <figcaption><span className="bb-project-icons-sidebar-sample"><img src={preview} alt="Draft icon at 20 pixels" />{project.name}</span><small>Actual sidebar size: 20 × 20 pixels</small></figcaption>
      </figure>
      <fieldset disabled={busy} className="bb-project-icons-crop-controls">
        <legend>Image adjustments</legend>
        <div className="bb-project-icons-actions" role="group" aria-label="Image sizing">
          {(["fit", "fill"] as const).map((mode) => <button key={mode} type="button" aria-pressed={crop.mode === mode}
            onClick={() => change({ ...crop, mode })}>{mode === "fit" ? "Fit" : "Fill"}</button>)}
        </div>
        {([
          ["zoom", "Zoom", 1, 4, 0.05], ["x", "Horizontal offset (pixels)", -bounds.x, bounds.x, "any"],
          ["y", "Vertical offset (pixels)", -bounds.y, bounds.y, "any"],
        ] as const).map(([key, label, min, max, step]) => <label key={key}>
          {label}: <output>{Number(crop[key].toFixed(2))}</output>
          <input type="range" min={min} max={max} step={step} value={crop[key]} disabled={min === max}
            onChange={(event) => change({ ...crop, [key]: Number(event.target.value) })} />
        </label>)}
      </fieldset>
    </>}
    {(preview || loading || error) && <div className="bb-project-icons-actions">
      <button type="button" disabled={busy || loading || !preview} onClick={() => void save()}>Save</button>
      <button type="button" disabled={busy} onClick={() => { cancel(); input.current?.focus(); }}>Cancel</button>
    </div>}
  </div>;
}
