import { useMemo } from "react";
import { automaticIcon } from "../lib/automatic-icon";

export function AutomaticIcon({ id, name }: { id: string; name: string }) {
  const src = useMemo(() => automaticIcon(id, name), [id, name]);
  return <img src={src} alt="" aria-hidden="true" />;
}
