import { useCallback, useId, useRef, useState } from "react";
import { ImageEditor } from "./image-editor";
import { EmojiPicker } from "./emoji-picker";

export function IconPicker(props: Parameters<typeof ImageEditor>[0]) {
  const id = useId();
  const [source, setSource] = useState<"image" | "emoji">("image");
  const activeSource = useRef(source);
  const cancelDraft = useRef<(() => void) | null>(null);
  const registerCancel = useCallback((cancel: () => void) => {
    cancelDraft.current = cancel;
    return () => { if (cancelDraft.current === cancel) cancelDraft.current = null; };
  }, []);
  const selectSource = (next: "image" | "emoji") => {
    if (activeSource.current === next) return;
    // Cancel immediately, even if away-and-back tab changes share a React batch.
    cancelDraft.current?.();
    activeSource.current = next;
    setSource(next);
  };
  return <div className="bb-project-icons-crop">
    <div role="tablist" aria-label="Icon source" className="bb-project-icons-actions">
      {(["image", "emoji"] as const).map((item, index) => <button key={item}
        type="button" role="tab" id={`${id}-${item}-tab`} aria-selected={source === item}
        aria-controls={`${id}-${item}-panel`} tabIndex={source === item ? 0 : -1}
        disabled={props.busy} onClick={() => selectSource(item)} onKeyDown={event => {
          const next = event.key === "Home" ? 0 : event.key === "End" ? 1
            : ["ArrowLeft", "ArrowRight"].includes(event.key) ? 1 - index : null;
          if (next === null) return;
          event.preventDefault();
          selectSource(next === 0 ? "image" : "emoji");
          const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
          tabs?.[next]?.focus();
        }}>{item === "image" ? "Image" : "Emoji"}</button>)}
    </div>
    {(["image", "emoji"] as const).map(item => <div key={item} role="tabpanel"
      id={`${id}-${item}-panel`} aria-labelledby={`${id}-${item}-tab`} hidden={source !== item}>
      {source === item && (item === "image"
        ? <ImageEditor {...props} registerCancel={registerCancel} />
        : <EmojiPicker {...props} registerCancel={registerCancel} />)}
    </div>)}
  </div>;
}
