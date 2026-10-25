import { IconPreview } from "./icon-preview";
import type { usePngDraft } from "./use-png-draft";

export function DraftOutput({ draft, name, busy, focus, children }: {
  draft: ReturnType<typeof usePngDraft>; name: string; busy: boolean; focus: () => void; children?: React.ReactNode;
}) {
  return <>
    {draft.loading && <p role="status">Rendering draft…</p>}
    {draft.error && <p role="alert">{draft.error}</p>}
    {draft.snapshot && <><IconPreview url={draft.snapshot.url} name={name} />{children}</>}
    {(draft.snapshot || draft.loading || draft.error) && <div className="bb-project-icons-actions">
      <button type="button" disabled={busy || draft.loading || !draft.snapshot} onClick={() => void draft.save()}>Save</button>
      <button type="button" disabled={busy} onClick={() => { draft.cancel(); focus(); }}>Cancel</button>
    </div>}
  </>;
}
