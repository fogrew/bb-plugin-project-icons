import { useEffect, useMemo, useSyncExternalStore } from "react";
import { automaticIcon } from "../lib/automatic-icon";
import { hints } from "../lib/hints-store";

export function AutomaticIcon({ id, name }: { id: string; name: string }) {
  const colors = useSyncExternalStore(hints.subscribe, hints.getSnapshot);
  useEffect(() => { void hints.refresh(); }, []);
  const color = colors.get(id) ?? null;
  const src = useMemo(() => automaticIcon(id, name, color), [id, name, color]);
  return <img src={src} alt="" aria-hidden="true" />;
}
