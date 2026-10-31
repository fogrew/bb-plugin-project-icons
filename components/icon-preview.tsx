import { useId, useRef } from "react";

export function PngPreview({ url, label, className }: { url: string; label: string; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useId();
  return <span data-bb-image-preview-ignore="" className="bb-project-icons-png-preview">
    <button ref={trigger} type="button" className="bb-project-icons-preview-trigger"
      aria-label={`Open ${label.toLowerCase()} preview`} aria-haspopup="dialog"
      onClick={() => dialog.current?.showModal()}>
      <img className={className} src={url} alt={label} />
    </button>
    <dialog ref={dialog} className="bb-project-icons-viewer" aria-labelledby={title}
      onClose={() => { if (trigger.current?.isConnected) trigger.current.focus(); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          dialog.current?.close();
        }
        if (event.key === "Tab") {
          event.preventDefault();
          dialog.current?.querySelector("button")?.focus();
        }
      }}>
      <div className="bb-project-icons-viewer-toolbar">
        <h2 id={title}>{label}</h2>
        <button type="button" autoFocus onClick={() => dialog.current?.close()}>Close preview</button>
      </div>
      <img className="bb-project-icons-viewer-image" src={url} alt="PNG preview contents" />
    </dialog>
  </span>;
}

export function IconPreview({ url, name }: { url: string; name: string }) {
  return <figure className="bb-project-icons-crop-preview">
    <PngPreview url={url} label="Enlarged draft icon" className="bb-project-icons-large-sample" />
    <figcaption><span className="bb-project-icons-sidebar-sample"><span data-bb-image-preview-ignore=""><img src={url} alt="Draft icon at 20 pixels" /></span>{name}</span><small>Actual sidebar size: 20 × 20 pixels</small></figcaption>
  </figure>;
}
