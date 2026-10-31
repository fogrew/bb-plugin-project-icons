import { readFileSync } from "node:fs";
export const transparentPng = readFileSync(new URL("./canvas-transparent.png", import.meta.url));
export const opaquePng = readFileSync(new URL("./canvas-opaque.png", import.meta.url));
export const emojiPng = readFileSync(new URL("./canvas-emoji.png", import.meta.url));
