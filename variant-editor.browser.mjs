// Real React and Chrome Settings editor; SDK registration, RPC and routes are fixtures.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { PNG } from "pngjs";

const output = resolve("dist/variant-editor-browser");
await mkdir(output, { recursive: true });
const sdk = `
import { useEffect } from "react";
export const experimental_usePluginId = () => "variant-test";
const rpc = { call: (...args) => window.api(...args) };
export const useRpc = () => rpc;
export const useBbContext = () => ({});
export function useRealtime() {}
export function definePluginApp(register) {
  register({ slots: { settingsSection: r => window.Settings = r.component, homepageSection() {}, experimental_appOverlay() {}, experimental_threadAction() {} }, contentScripts: { register() {} } });
}
`;
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    await import("./app");
    window.calls = [];
    window.state = { projects: [
      { id: "proj_aaaaaaaaaa", name: "With icon", revision: 5, variants: { light: null, dark: null } },
      { id: "proj_bbbbbbbbbb", name: "No icon", revision: null, variants: { light: null, dark: null } },
    ] };
    window.api = async (method, input) => {
      if (method === "list") return { automaticAdoption: false, projects: window.state.projects.map(p => ({ ...p, variants: { ...p.variants } })) };
      window.calls.push({ method, input });
      return method === "removeWithUndo" ? { removed: true, undo: null } : {};
    };
    window.show = id => createRoot(document.getElementById("root")).render(<window.Settings projectId={id} />);
  ` },
  bundle: true, format: "esm", jsx: "automatic", outfile: resolve(output, "fixture.js"),
  plugins: [{ name: "sdk-fixture", setup(b) {
    b.onResolve({ filter: /^@get-bb\/plugin-sdk\/app$/ }, () => ({ path: "sdk", namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: sdk, loader: "js", resolveDir: process.cwd() }));
  } }],
});
const hostReset = `:root{--background:#fff;--foreground:#111;--border:#888;--ring:#05f;--muted:#eee;--muted-foreground:#555;--accent:#ddd;--accent-foreground:#000;--destructive:#b00}
*,::before,::after{margin:0;padding:0;box-sizing:border-box}body{background:var(--background);color:var(--foreground);font:14px system-ui}`;
const draftPng = new PNG({ width: 64, height: 64 });
draftPng.data.fill(180);
const image = PNG.sync.write(draftPng);
const server = createServer(async (req, res) => {
  if (req.url.includes("/icon?")) return res.writeHead(200, { "Content-Type": "image/png" }).end(image);
  if (req.url === "/") return res.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><meta charset="utf-8"><style>${hostReset}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>`);
  if (["/fixture.js", "/fixture.css"].includes(req.url)) return res.writeHead(200, { "Content-Type": req.url.endsWith(".js") ? "text/javascript" : "text/css" }).end(await readFile(resolve(output, req.url.slice(1))));
  res.writeHead(404).end();
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
let browser;
const checks = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.waitForFunction(() => window.show);
  await page.evaluate(() => window.show("proj_bbbbbbbbbb"));
  await page.getByText("Light and dark variants (optional)").click();
  const target = page.getByRole("radiogroup", { name: "Apply the next icon to" });
  await target.waitFor();
  for (const name of ["Light theme only", "Dark theme only"]) assert.equal(await target.getByLabel(name).isDisabled(), true);
  assert.equal(await target.getByLabel("Default (every theme)").isChecked(), true);
  await page.getByText("Save a default icon first").waitFor();
  checks.push("a project without a default icon cannot target a theme variant");

  await page.evaluate(() => window.show("proj_aaaaaaaaaa"));
  await page.getByText("Light and dark variants (optional)").click();
  await target.getByLabel("Dark theme only").waitFor();
  assert.equal(await target.getByLabel("Dark theme only").isDisabled(), false);
  await target.getByLabel("Dark theme only").check();
  await page.locator('input[type="file"]').setInputFiles({ name: "dark.png", mimeType: "image/png", buffer: image });
  const sample = page.locator(".bb-project-icons-sidebar-sample");
  await sample.waitFor();
  const sampleLook = await sample.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, size: (() => { const box = el.querySelector("img").getBoundingClientRect(); return [box.width, box.height]; })() }));
  assert.equal(sampleLook.background, "rgb(24, 24, 27)");
  assert.deepEqual(sampleLook.size, [20, 20]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => window.calls.some(call => call.method === "save"));
  const saved = await page.evaluate(() => window.calls.find(call => call.method === "save").input);
  assert.equal(saved.projectId, "proj_aaaaaaaaaa");
  assert.equal(saved.theme, "dark");
  await page.getByText("Dark variant saved.").waitFor();
  checks.push("a dark draft previews at 20 px on a dark surface and saves with theme=dark");

  await page.evaluate(() => { window.state.projects[0].variants = { light: 8, dark: 9 }; window.calls.length = 0; });
  await page.evaluate(() => window.show("proj_aaaaaaaaaa"));
  await page.getByRole("button", { name: "Open dark theme icon preview" }).waitFor();
  await page.getByRole("button", { name: "Open light theme icon preview" }).waitFor();
  assert.equal(await page.locator(".bb-project-icons-surface-dark img[alt=\"Dark theme icon\"]").getAttribute("src"), "/api/v1/plugins/project-icons/http/icon?projectId=proj_aaaaaaaaaa&theme=dark&v=9");
  await page.getByRole("button", { name: "Remove dark variant" }).click();
  await page.waitForFunction(() => window.calls.some(call => call.method === "removeWithUndo"));
  assert.deepEqual(await page.evaluate(() => window.calls.find(call => call.method === "removeWithUndo").input), { projectId: "proj_aaaaaaaaaa", theme: "dark" });
  checks.push("existing variants are previewed with their own routes and removed individually");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: resolve(output, "editor.png") });
  await writeFile(resolve(output, "results.json"), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ checks }));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
