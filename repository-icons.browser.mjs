// Real React/Chrome editor; SDK registrations and RPC (discovery results) are fixtures.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { PNG } from "pngjs";

const output = resolve("dist/repository-browser");
await mkdir(output, { recursive: true });
const sdk = `
export const experimental_usePluginId = () => "repository-test";
const rpc = {call: (...args) => window.api(...args)};
export const useRpc = () => rpc;
export const useBbContext = () => ({projectId: null});
export const useRealtime = () => {};
export function definePluginApp(register) {
  register({slots: {
    settingsSection: r => window.Settings = r.component,
    homepageSection: () => {}, experimental_appOverlay: () => {}, experimental_threadAction: () => {},
  }, contentScripts: {register() {}}});
}
`;
const png = new PNG({ width: 64, height: 64 });
png.data.fill(255);
const image = PNG.sync.write(png);
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    await import("./app");
    window.calls = []; window.mode = "ok";
    window.api = async (method, input) => {
      if (method === "list") return {projects: [{id:"proj_aaaaaaaaaa",name:"Demo",revision:location.search.includes("assigned") ? 7 : null}]};
      window.calls.push({method, input});
      if (method === "discover") {
        if (window.mode === "down") return {status:"unavailable",candidates:[],rejected:{svg:0,unsupported:0},truncated:false};
        if (window.mode === "empty") return {status:"ok",candidates:[],rejected:{svg:2,unsupported:0},truncated:false};
        return {status:"ok",candidates:[{path:"public/favicon.png",name:"favicon.png"},{path:"docs/logo.png",name:"logo.png"}],rejected:{svg:1,unsupported:0},truncated:false};
      }
      if (method === "readCandidate") {
        if (input.path === "docs/logo.png") throw new Error("Image is larger than 2 MB");
        return {base64:"${image.toString("base64")}",mimeType:"image/png",sizeBytes:${image.length}};
      }
      if (method === "save") return {revision: 5};
      return {};
    };
    createRoot(document.getElementById("root")).render(<window.Settings projectId="proj_aaaaaaaaaa" />);
  ` },
  bundle: true, format: "esm", jsx: "automatic", outfile: resolve(output, "fixture.js"),
  plugins: [{ name: "sdk-fixture", setup(b) {
    b.onResolve({ filter: /^@get-bb\/plugin-sdk\/app$/ }, () => ({ path: "sdk", namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: sdk, loader: "js", resolveDir: process.cwd() }));
  } }],
});
const server = createServer(async (req, res) => {
  if (req.url.includes("/icon?")) return res.writeHead(200, { "Content-Type": "image/png" }).end(image);
  if (req.url.split("?")[0] === "/") return res.writeHead(200, { "Content-Type": "text/html" }).end('<!doctype html><html><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>');
  if (["/fixture.js", "/fixture.css"].includes(req.url)) return res.writeHead(200, { "Content-Type": req.url.endsWith(".js") ? "text/javascript" : "text/css" }).end(await readFile(resolve(output, req.url.slice(1))));
  res.writeHead(404).end();
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
let browser;
const checks = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:" + server.address().port);
  const find = page.getByRole("button", { name: "Find icons in repository" });
  await find.waitFor();
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.method === "discover").length), 0);
  checks.push("no discovery runs on render; it needs an explicit click");

  await find.click();
  const list = page.getByRole("list", { name: "Repository icon candidates" });
  await list.waitFor();
  assert.equal(await list.getByRole("button").count(), 2);
  await page.getByText("1 SVG file(s) skipped: SVG is not supported.").waitFor();
  checks.push("candidates listed with explicit SVG rejection");

  await list.getByRole("button", { name: "docs/logo.png" }).click();
  await page.getByText("Could not use docs/logo.png: Image is larger than 2 MB.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Save", exact: true }).count(), 0);
  checks.push("oversized candidate fails clearly without a draft");

  await list.getByRole("button", { name: "public/favicon.png" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.method === "save").length), 0);
  checks.push("selected candidate becomes a previewed draft; nothing is saved yet");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => window.calls.some(c => c.method === "save"));
  assert.equal(await page.evaluate(() => window.calls.find(c => c.method === "save").input.projectId), "proj_aaaaaaaaaa");
  checks.push("explicit Save stores the chosen candidate for the right project");

  await page.evaluate(() => { window.mode = "empty"; });
  await find.click();
  await page.getByText("No favicon, icon or logo images found.").waitFor();
  await page.evaluate(() => { window.mode = "down"; });
  await find.click();
  await page.getByRole("alert").filter({ hasText: "Repository files are unavailable" }).waitFor();
  assert.deepEqual(errors, []);
  checks.push("no-results and unavailable-host states are explicit");

  const assigned = await browser.newPage();
  assigned.setDefaultTimeout(5000);
  await assigned.goto("http://127.0.0.1:" + server.address().port + "/?assigned=1");
  await assigned.getByRole("img", { name: "Current project icon" }).waitFor();
  await assigned.getByRole("button", { name: "Find icons in repository" }).click();
  const assignedList = assigned.getByRole("list", { name: "Repository icon candidates" });
  await assignedList.waitFor();
  assert.equal(await assigned.evaluate(() => window.calls.filter(c => c.method === "discover").length), 1);
  await assignedList.getByRole("button", { name: "public/favicon.png" }).click();
  await assigned.getByRole("button", { name: "Save", exact: true }).waitFor();
  checks.push("search and candidate selection work when the project already has an icon");
  await writeFile(resolve(output, "results.json"), JSON.stringify({ checks, boundaries: "Real Chrome/React/editor. SDK and RPC mocked; not live BB." }, null, 2));
  console.log(checks.join("\n"));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
