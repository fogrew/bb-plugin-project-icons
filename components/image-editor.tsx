import { useId, useMemo, useRef, useState } from "react";
import { ImageInput } from "./image-input";
import { singleImageFile } from "../lib/image-input";
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
  const [inputError, setInputError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const png = usePngDraft(props, () => { draft.cancel(); setCrop(defaultCrop); setInputError(""); });
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
  const upload = async (files: File[]) => {
    if (state.getSnapshot().selected !== project.id) return;
    if (busy || state.getSnapshot().operation) { setInputError("Wait for the current icon operation, then try again."); return; }
    let file: File;
    try { file = singleImageFile(files); }
    catch { setInputError("Choose one image at a time. The current draft is unchanged."); return; }
    setInputError("");
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
    <ImageInput busy={busy} inputRef={input} onFiles={files => void upload(files)}>
    {inputError && <p role="alert">{inputError}</p>}
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
        ] as const).map(([key, label, min, max, step]) => <div key={key} className="bb-project-icons-crop-control">
          <div><label htmlFor={`${id}-${key}`}>{label}</label>: <output htmlFor={`${id}-${key}`}>{Number(crop[key].toFixed(2))}</output></div>
          <input id={`${id}-${key}`} type="range" min={min} max={max} step={step} value={crop[key]} disabled={min === max}
            onChange={(event) => change({ ...crop, [key]: Number(event.target.value) })} />
        </div>)}
      </fieldset>}
    </DraftOutput>
    </ImageInput>
  </div>;
}
