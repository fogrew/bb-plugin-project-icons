import { useCallback, useId, useRef, useState } from "react";
import { ImageEditor } from "./image-editor";
import { EmojiPicker } from "./emoji-picker";
import { PresetPicker } from "./preset-picker";

const sources = ["image", "emoji", "glyph", "initials"] as const;
type Source = typeof sources[number];

export function IconPicker(props: Parameters<typeof ImageEditor>[0]) {
  const id = useId();
  const [source, setSource] = useState<Source>("image");
  const activeSource = useRef(source);
  const cancelDraft = useRef<(() => void) | null>(null);
  const registerCancel = useCallback((cancel: () => void) => {
    cancelDraft.current = cancel;
    return () => { if (cancelDraft.current === cancel) cancelDraft.current = null; };
  }, []);
  const selectSource = (next: Source) => {
    if (activeSource.current === next) return;
    // Cancel immediately, even if away-and-back tab changes share a React batch.
    cancelDraft.current?.();
    activeSource.current = next;
    setSource(next);
  };
  return <div className="bb-project-icons-crop">
    <div role="tablist" aria-label="Icon source" className="bb-project-icons-actions">
      {sources.map((item, index) => <button key={item}
        type="button" role="tab" id={`${id}-${item}-tab`} aria-selected={source === item}
        aria-controls={`${id}-${item}-panel`} tabIndex={source === item ? 0 : -1}
        disabled={props.busy} onClick={() => selectSource(item)} onKeyDown={event => {
          const next = event.key === "Home" ? 0 : event.key === "End" ? sources.length - 1
            : event.key === "ArrowRight" ? (index + 1) % sources.length
            : event.key === "ArrowLeft" ? (index + sources.length - 1) % sources.length : null;
          if (next === null) return;
          event.preventDefault();
          selectSource(sources[next]);
          const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
          tabs?.[next]?.focus();
        }}>{item[0].toUpperCase() + item.slice(1)}</button>)}
    </div>
    {sources.map(item => <div key={item} role="tabpanel"
      id={`${id}-${item}-panel`} aria-labelledby={`${id}-${item}-tab`} hidden={source !== item}>
      {source === item && (item === "image"
        ? <ImageEditor {...props} registerCancel={registerCancel} />
        : item === "emoji" ? <EmojiPicker {...props} registerCancel={registerCancel} />
        : <PresetPicker {...props} source={item} registerCancel={registerCancel} />)}
    </div>)}
  </div>;
}
