// Real Chrome and the real sidebar module; BB's DOM, theme classes and plugin routes are fixtures.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { PNG } from "pngjs";

const output = resolve("dist/theme-variants-browser");
await mkdir(output, { recursive: true });
const glyph = (r, g, b) => {
  const png = new PNG({ width: 64, height: 64 });
  for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
    const inside = x >= 8 && x < 56 && y >= 8 && y < 56;
    png.data.set(inside ? [r, g, b, 255] : [0, 0, 0, 0], (y * 64 + x) * 4);
  }
  return PNG.sync.write(png);
};
const black = glyph(0, 0, 0);
const white = glyph(255, 255, 255);
const bundle = await build({ stdin: { contents: `
import { mountIcons } from "./lib/sidebar-icons";
window.fixture = { mountIcons };
`, resolveDir: process.cwd() }, bundle: true, write: false, format: "iife" });
const css = await readFile("app.css", "utf8");
const requests = [];
let variantRoute = "ok";
const server = createServer((req, res) => {
  requests.push(req.url);
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(bundle.outputFiles[0].text); }
  if (url.pathname === "/api/v1/plugins/project-icons/http/icons") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ proj_aaaaaaaaaa: 10, proj_bbbbbbbbbb: 20 })); }
  if (url.pathname === "/api/v1/plugins/project-icons/http/icon-variants") {
    if (variantRoute === "fail") { res.statusCode = 500; return res.end("no"); }
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ proj_aaaaaaaaaa: { dark: 11, light: 12 }, proj_bbbbbbbbbb: { dark: 21 }, __proto__x: { dark: 1 } }));
  }
  if (url.pathname === "/api/v1/plugins/project-icons/http/icon") {
    const theme = url.searchParams.get("theme");
    res.setHeader("Content-Type", "image/png");
    return res.end(theme === "dark" ? white : black);
  }
  res.setHeader("Content-Type", "text/html");
  res.end(`<!doctype html><html class="light"><meta charset="utf-8"><style>
    :root, .light { --surface: #ffffff; color-scheme: light; } .dark { --surface: #18181b; color-scheme: dark; }
    body { margin: 0; background: var(--surface); font: 14px system-ui; }
    [data-sidebar="group-label"] > span:first-child { display: inline-flex; align-items: center; gap: 2px; }
    ${css.replace(/`/g, "")}
  </style><body><main></main>`);
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let navigations = 0;
  page.on("framenavigated", () => { navigations += 1; });
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.addScriptTag({ url: "/fixture.js" });
  const result = await page.evaluate(async () => {
    const check = (value, label) => { if (!value) throw Error(label); };
    const tick = () => new Promise(done => setTimeout(done, 100));
    const until = async (condition, label) => { for (let i = 0; i < 60; i += 1) { if (condition()) return; await tick(); } throw Error(label); };
    const luminance = ([r, g, b]) => [r, g, b].map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const rgb = value => value.match(/\d+/g).slice(0, 3).map(Number);
    const glyphPixel = async img => {
      const bitmap = await createImageBitmap(await (await fetch(img.src)).blob());
      const canvas = new OffscreenCanvas(20, 20);
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0, 20, 20);
      return [...context.getImageData(10, 10, 1, 1).data].slice(0, 3);
    };
    const row = (id, name) => {
      const el = document.createElement("section"); el.dataset.sidebarProjectId = id;
      const label = document.createElement("div"); label.dataset.sidebar = "group-label";
      const wrapper = document.createElement("span"), title = document.createElement("span");
      title.title = name; title.textContent = name; wrapper.append(title); label.append(wrapper); el.append(label);
      const dot = document.createElement("button"); dot.className = "project-colors-control"; dot.textContent = "•"; label.append(dot);
      document.querySelector("main").append(el); return { el, dot };
    };
    const a = row("proj_aaaaaaaaaa", "Alpha"), b = row("proj_bbbbbbbbbb", "Beta"), c = row("proj_cccccccccc", "Gamma");
    window.marker = "no reload";
    const controller = new AbortController();
    const dispose = window.fixture.mountIcons(controller.signal);
    await tick();
    await until(() => a.el.querySelector(".bb-project-icons-image") && b.el.querySelector(".bb-project-icons-image"), "icons mounted");
    const imgA = a.el.querySelector(".bb-project-icons-image"), imgB = b.el.querySelector(".bb-project-icons-image");
    const surface = () => rgb(getComputedStyle(document.body).backgroundColor);
    const out = {};
    await until(() => imgA.src.includes("projectId=proj_aaaaaaaaaa&theme=light&v=12"), "light variant first: " + imgA.src);
    await until(() => imgB.src.endsWith("projectId=proj_bbbbbbbbbb&v=20"), "no light variant falls back to the single default: " + imgB.src);
    check(imgA.getBoundingClientRect().width === 20 && imgA.getBoundingClientRect().height === 20, "icon drawn at 20 px");
    out.lightContrast = contrast(await glyphPixel(imgA), surface());
    check(out.lightContrast >= 4.5, "light variant contrast " + out.lightContrast);
    for (const dot of [a.dot, b.dot, c.dot]) check(getComputedStyle(dot).display !== "none", "Project Colors control stays visible");
    check(a.el.classList.contains("bb-project-icons-row"), "row is decorated");

    document.documentElement.className = "dark"; await tick();
    await until(() => imgA.src.includes("theme=dark&v=11"), "dark variant after live switch: " + imgA.src);
    await until(() => imgB.src.includes("theme=dark&v=21"), "second project's dark variant");
    out.darkContrast = contrast(await glyphPixel(imgA), surface());
    check(out.darkContrast >= 4.5, "dark variant contrast " + out.darkContrast);
    out.singleOnDark = contrast(await glyphPixel(Object.assign(new Image(), { src: imgB.src.replace("&theme=dark", "").replace("v=21", "v=20") })), surface());
    check(out.singleOnDark < 3, "the single dark glyph would be unreadable on the dark surface, which is what variants fix");
    await until(() => c.el.querySelector(".bb-project-icons-image").src.startsWith("data:"), "a project without a saved icon keeps its automatic initials");
    check(a.el.querySelectorAll(".bb-project-icons-image").length === 1, "no duplicate image after switching");

    document.documentElement.className = ""; document.documentElement.style.colorScheme = "light"; await tick();
    await until(() => imgA.src.includes("theme=light&v=12"), "color-scheme fallback to light");
    document.documentElement.style.colorScheme = "dark"; await tick();
    await until(() => imgA.src.includes("theme=dark&v=11"), "color-scheme fallback to dark");
    document.documentElement.style.colorScheme = ""; document.documentElement.className = "light"; await tick();
    await until(() => imgA.src.includes("theme=light&v=12"), "back to light");
    out.marker = window.marker;
    window.dispose = dispose;
    return out;
  });
  assert.equal(result.marker, "no reload");
  assert.equal(navigations, 1, "theme switching never navigates");
  await page.screenshot({ path: resolve(output, "light.png") });
  await page.evaluate(() => { document.documentElement.className = "dark"; });
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(output, "dark.png") });

  variantRoute = "fail";
  await page.evaluate(() => window.dispose());
  await page.evaluate(() => { document.documentElement.className = "dark"; document.querySelectorAll(".bb-project-icons-image").forEach(n => n.remove()); window.fixture.mountIcons(new AbortController().signal); });
  await page.waitForTimeout(600);
  const degraded = await page.evaluate(() => document.querySelector("[data-sidebar-project-id=proj_aaaaaaaaaa] .bb-project-icons-image").src);
  assert.ok(degraded.endsWith("projectId=proj_aaaaaaaaaa&v=10"), "a failing variants route keeps the single default: " + degraded);
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
