import { useEffect, useMemo, useRef } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../server";
import { createAdopter } from "../lib/auto-adopt";
import { fetchPeerImage } from "../lib/peer-image";
import { decodeImage, defaultCrop, drawIcon, encodeIcon } from "../lib/image-processing";
import { drawEmoji } from "../lib/emoji-rendering";

export const SCAN_EVENT = "bb-project-icons-scan";
const START_DELAY_MS = 3000;
const INTERVAL_MS = 10 * 60 * 1000;

async function normalise(file: File): Promise<string> {
  const bitmap = await decodeImage(file);
  try {
    const canvas = document.createElement("canvas");
    drawIcon(canvas, bitmap, defaultCrop);
    return await encodeIcon(canvas);
  } finally { bitmap.close(); }
}

async function renderEmoji(emoji: string): Promise<string> {
  const canvas = document.createElement("canvas");
  drawEmoji(canvas, emoji);
  return encodeIcon(canvas);
}

export function AutoAdopt() {
  const rpc = useRpc<typeof rpcContract>();
  const adopter = useMemo(() => createAdopter({
    scan: input => rpc.call("adoptionScan", input),
    adopt: input => rpc.call("adoptPeer", input),
    fetchImage: (projectId, signal, source) => fetchPeerImage(projectId, signal, fetch, source),
    normalise,
    renderEmoji,
  }), [rpc]);
  const trigger = useRef<(force: boolean) => void>(() => {});
  useEffect(() => {
    const controller = new AbortController();
    trigger.current = force => {
      if (!force && document.visibilityState === "hidden") return;
      void adopter.run({ force, signal: controller.signal });
    };
    const start = setTimeout(() => trigger.current(false), START_DELAY_MS);
    const interval = setInterval(() => trigger.current(false), INTERVAL_MS);
    const manual = () => trigger.current(true);
    const visible = () => { if (document.visibilityState === "visible") trigger.current(false); };
    window.addEventListener(SCAN_EVENT, manual);
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearTimeout(start);
      clearInterval(interval);
      trigger.current = () => {};
      window.removeEventListener(SCAN_EVENT, manual);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [adopter]);
  useRealtime("changed", () => trigger.current(false));
  return null;
}
