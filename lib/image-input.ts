type InputEvent = { preventDefault(): void; stopPropagation(): void };
type Transfer = Pick<DataTransfer, "files" | "items" | "types">;

export function transferHasFiles(data: Transfer) {
  return data.files.length > 0 || Array.from(data.types).includes("Files") || Array.from(data.items).some((item) => item.kind === "file");
}

export function transferFiles(data: Transfer): File[] {
  // Clipboard implementations may expose file items without populating files.
  if (data.files.length) return Array.from(data.files);
  return Array.from(data.items).filter((item) => item.kind === "file")
    .map((item) => item.getAsFile()).filter((file): file is File => file !== null);
}

export function singleImageFile(files: readonly File[]) {
  if (files.length !== 1) throw new Error("Choose one image at a time.");
  return files[0];
}

export function ownsImagePaste(area: HTMLElement, target: EventTarget | null) {
  const active = area.ownerDocument.activeElement;
  if (!active || !area.contains(active) || target !== active) return false;
  // Keep native text editing, including contenteditable descendants, untouched.
  return !active.closest('textarea, [role="textbox"], [contenteditable]:not([contenteditable="false"]), input:not([type="file"]):not([type="range"]):not([type="button"])');
}

export function createFileInputEvents(options: {
  receive(files: File[]): void;
  ownsPaste(target: EventTarget | null): boolean;
  setDragging(value: boolean): void;
}) {
  let depth = 0;
  const reset = () => { depth = 0; options.setDragging(false); };
  const claim = (event: InputEvent) => { event.preventDefault(); event.stopPropagation(); };
  return {
    reset,
    enter(event: InputEvent, data: Transfer) {
      if (!transferHasFiles(data)) return;
      claim(event);
      depth += 1;
      options.setDragging(true);
    },
    leave(event: InputEvent) {
      if (!depth) return;
      claim(event);
      depth = Math.max(0, depth - 1);
      if (!depth) options.setDragging(false);
    },
    over(event: InputEvent, data: Transfer) {
      if (!transferHasFiles(data)) return;
      claim(event);
    },
    drop(event: InputEvent, data: Transfer) {
      reset();
      if (!transferHasFiles(data) && !data.files.length) return;
      // Claim even invalid/busy drops so a file cannot navigate away from BB.
      claim(event);
      options.receive(transferFiles(data));
    },
    paste(event: InputEvent & { target: EventTarget | null }, data: Transfer) {
      if (!options.ownsPaste(event.target) || !transferHasFiles(data)) return;
      claim(event);
      options.receive(transferFiles(data));
    },
  };
}
