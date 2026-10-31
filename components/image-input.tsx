import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileInputEvents, ownsImagePaste } from "../lib/image-input";

type Props = {
  busy: boolean;
  onFiles(files: File[]): void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  children: ReactNode;
};

export function ImageInput({ busy, onFiles, inputRef, children }: Props) {
  const id = useId();
  const area = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const latest = useRef(onFiles);
  latest.current = onFiles;
  const events = useMemo(() => createFileInputEvents({
    receive: (files) => latest.current(files),
    ownsPaste: (target) => !!area.current && ownsImagePaste(area.current, target),
    setDragging,
  }), []);
  return <div ref={area} className="bb-project-icons-input" role="group" tabIndex={0}
    aria-label="Project icon image input and editor" aria-describedby={`${id}-help`}
    aria-busy={busy} data-dragging={dragging}
    onDragEnter={(event) => events.enter(event, event.dataTransfer)}
    onDragLeave={events.leave}
    onDragOver={(event) => {
      events.over(event, event.dataTransfer);
      if (event.defaultPrevented) event.dataTransfer.dropEffect = busy ? "none" : "copy";
    }}
    onDrop={(event) => events.drop(event, event.dataTransfer)}
    onPaste={(event) => events.paste(event, event.clipboardData)}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) events.reset(); }}>
    <label htmlFor={id}>Choose image</label>
    <p id={`${id}-help`} className="bb-project-icons-help">
      Choose or drop one PNG, JPEG, or WebP (up to 2 MB).
      <span className="bb-project-icons-extended-help"> You can also focus this area and paste an image.
        A new image replaces the draft. Switching projects cancels it. Adjust, then Save.
        Output: transparent 64 × 64 PNG.</span>
    </p>
    <input ref={inputRef} id={id} type="file" accept="image/png,image/jpeg,image/webp"
      aria-describedby={`${id}-help`} disabled={busy} onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (files.length) latest.current(files);
      }} />
    {dragging && <p role="status">{busy ? "Wait for the current operation before adding an image." : "Drop one image to edit."}</p>}
    {children}
  </div>;
}
