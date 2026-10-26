import { useId, useMemo, useRef, useState } from "react";
import type { createSettingsState, Project } from "../settings-state";
import { createDraft } from "../lib/image-draft";
import { clampCrop, decodeImage, defaultCrop, drawIcon, offsetBounds, type Crop } from "../lib/image-processing";
import { usePngDraft } from "./use-png-draft";
import { DraftOutput } from "./draft-output";

export type EditorProps = {
  project: Project; state: ReturnType<typeof createSettingsState>; busy: boolean;
  registerCancel?: (cancel: () => void) => () => void;
};

export function ImageEditor(props: EditorProps) {
  const { project, state, busy } = props;
  const id = useId();
  const draft = useMemo(() => createDraft<ImageBitmap>(project.id, () => state.getSnapshot().selected), [project.id, state]);
  const [crop, setCrop] = useState<Crop>(defaultCrop);
  const input = useRef<HTMLInputElement>(null);
  const png = usePngDraft(props, () => { draft.cancel(); setCrop(defaultCrop); });
  const render = (next: Crop) => png.render(canvas => {
    const image = draft.current();
    if (!image) throw new Error("Draft cancelled.");
    drawIcon(canvas, image, next);
  }, "Could not preview this image. Choose another image.");
  const change = (next: Crop) => {
    const image = draft.current();
    if (!image || busy) return;
    const bounded = clampCrop(image.width, image.height, next);
    setCrop(bounded); void render(bounded);
  };
  const upload = async (file: File) => {
    setCrop(defaultCrop);
    await png.render(async canvas => {
      if (!await draft.load(() => decodeImage(file))) throw new Error("Draft cancelled.");
      const image = draft.current();
      if (image) drawIcon(canvas, image, defaultCrop);
    }, "Could not read image. Choose a PNG, JPEG, or WebP image under 2 MB.");
  };
  const focus = () => input.current?.focus();
  const image = draft.current();
  const bounds = image ? offsetBounds(image.width, image.height, crop) : { x: 0, y: 0 };
  return <div className="bb-project-icons-crop" onKeyDown={event => {
    if (event.key === "Escape" && !busy) { event.preventDefault(); png.cancel(); focus(); }
  }}>
    <label htmlFor={id}>Choose image</label>
    <p id={`${id}-help`} className="bb-project-icons-help">PNG, JPEG, or WebP; up to 2 MB. Adjust the draft, then Save. Output: transparent 64 × 64 PNG.</p>
    <input ref={input} id={id} type="file" accept="image/png,image/jpeg,image/webp"
      aria-describedby={`${id}-help`} disabled={busy} onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void upload(file);
      }} />
    <DraftOutput draft={png} name={project.name} busy={busy} focus={focus}>
      {image && <fieldset disabled={busy} className="bb-project-icons-crop-controls">
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
      </fieldset>}
    </DraftOutput>
  </div>;
}
