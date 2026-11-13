import type { Theme } from "./theme-variants";

export function readThemeMode(root: HTMLElement = document.documentElement): Theme {
  if (root.classList.contains("dark")) return "dark";
  if (root.classList.contains("light")) return "light";
  const scheme = getComputedStyle(root).colorScheme.trim();
  if (scheme === "dark" || scheme === "light") return scheme;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function watchThemeMode(onChange: (mode: Theme) => void, root: HTMLElement = document.documentElement): () => void {
  let current = readThemeMode(root);
  const check = () => {
    const next = readThemeMode(root);
    if (next === current) return;
    current = next;
    onChange(next);
  };
  const observer = new MutationObserver(check);
  observer.observe(root, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
  const query = matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", check);
  return () => { observer.disconnect(); query.removeEventListener("change", check); };
}
