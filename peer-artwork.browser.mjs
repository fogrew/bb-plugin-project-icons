// Real React/Chrome editor; SDK, RPC (peer probe) and the Homepage image route are fixtures.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { PNG } from "pngjs";

const output = resolve("dist/peer-artwork-browser");
await mkdir(output, { recursive: true });
const sdk = `
export const experimental_usePluginId = () => "peer-test";
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
    window.calls = []; window.probe = {status: "image", pluginVersion: "0.2.7"}; window.gate = null;
    window.projects = [{id:"proj_aaaaaaaaaa",name:"Alpha",revision:null},{id:"proj_bbbbbbbbbb",name:"Beta",revision:7}];
    window.api = async (method, input) => {
      if (method === "list") return {projects: window.projects};
      window.calls.push({method, input});
      if (method === "peerArtwork") {
        if (window.gate) await window.gate(input.projectId);
        if (window.probe === "throw") throw new Error("rpc down");
        return window.probe;
      }
      if (method === "save") return {revision: 9};
      return {};
    };
    const root = createRoot(document.getElementById("root"));
    window.show = id => root.render(<window.Settings projectId={id} />);
    window.show("proj_aaaaaaaaaa");
  ` },
  bundle: true, format: "esm", jsx: "automatic", outfile: resolve(output, "fixture.js"),
  plugins: [{ name: "sdk-fixture", setup(b) {
    b.onResolve({ filter: /^@get-bb\/plugin-sdk\/app$/ }, () => ({ path: "sdk", namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: sdk, loader: "js", resolveDir: process.cwd() }));
  } }],
});
let peerRoute = "png";
const peerRequests = [];
const server = createServer(async (req, res) => {
  if (req.url.startsWith("/api/v1/plugins/homepage/http/project-icon")) {
    peerRequests.push(req.url);
    if (peerRoute === "png") return res.writeHead(200, { "Content-Type": "image/png" }).end(image);
    if (peerRoute === "svg") return res.writeHead(200, { "Content-Type": "image/svg+xml" }).end("<svg xmlns='http://www.w3.org/2000/svg'/>");
    if (peerRoute === "big") return res.writeHead(200, { "Content-Type": "image/png" }).end(Buffer.alloc(3 * 1024 * 1024, 1));
    return res.writeHead(404).end();
  }
  if (req.url.includes("/icon?")) return res.writeHead(200, { "Content-Type": "image/png" }).end(image);
  if (req.url.startsWith("/__route/")) { peerRoute = req.url.slice(9); return res.writeHead(204).end(); }
  if (req.url === "/") return res.writeHead(200, { "Content-Type": "text/html" }).end('<!doctype html><html><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>');
  if (["/fixture.js", "/fixture.css"].includes(req.url)) return res.writeHead(200, { "Content-Type": req.url.endsWith(".js") ? "text/javascript" : "text/css" }).end(await readFile(resolve(output, req.url.slice(1))));
  res.writeHead(404).end();
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = "http://127.0.0.1:" + server.address().port;
let browser;
const checks = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin);
  const use = page.getByRole("button", { name: "Use Homepage artwork" });
  await use.waitFor();
  const saves = () => page.evaluate(() => window.calls.filter(c => c.method === "save").length);
  const probes = () => page.evaluate(() => window.calls.filter(c => c.method === "peerArtwork").length);
  assert.equal(await probes(), 0);
  assert.equal(peerRequests.length, 0);
  checks.push("nothing probes or fetches until the button is pressed");

  await use.click();
  await page.getByRole("button", { name: "Save", exact: true }).waitFor();
  await page.getByText("Previewing a snapshot of Homepage artwork.").waitFor();
  assert.equal(await page.getByText("saving replaces the current icon").count(), 0);
  assert.equal(await saves(), 0);
  assert.deepEqual(await page.evaluate(() => window.calls.find(c => c.method === "peerArtwork").input), { projectId: "proj_aaaaaaaaaa", peer: "homepage" });
  assert.deepEqual(peerRequests, ["/api/v1/plugins/homepage/http/project-icon?projectId=proj_aaaaaaaaaa"]);
  checks.push("image artwork becomes a previewed draft with provenance; nothing is saved yet");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => window.calls.some(c => c.method === "save"));
  assert.equal(await page.evaluate(() => window.calls.find(c => c.method === "save").input.projectId), "proj_aaaaaaaaaa");
  checks.push("explicit Save stores the imported snapshot for the right project");

  await page.evaluate(() => window.show("proj_bbbbbbbbbb"));
  await page.getByText("Icon for Beta").waitFor();
  await use.click();
  await page.getByText("saving replaces the current icon").waitFor();
  checks.push("existing manual icon is flagged as replaced only on Save");

  await page.getByRole("button", { name: "Cancel" }).first().click();
  await page.getByText("Previewing a snapshot of Homepage artwork.").waitFor({ state: "detached" });
  checks.push("provenance note disappears when the draft is cancelled");

  for (const [probe, text] of [
    [{ status: "unavailable", reason: "not-installed" }, "The Homepage plugin is not installed."],
    [{ status: "unavailable", reason: "disabled" }, "The Homepage plugin is disabled."],
    [{ status: "unavailable", reason: "incompatible" }, "not compatible"],
    [{ status: "unavailable", reason: "timeout" }, "did not respond in time"],
    [{ status: "none" }, "Homepage has no artwork for this project."],
    [{ status: "glyph" }, "Glyphs cannot be imported"],
    ["throw", "Could not use Homepage artwork: rpc down."],
  ]) {
    await page.evaluate(value => { window.probe = value; }, probe);
    await use.click();
    await page.getByText(text).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save", exact: true }).count(), 0);
  }
  checks.push("missing, disabled, incompatible, timed-out, glyph-only and failing peers give explicit states without a draft");

  await page.evaluate(() => { window.probe = { status: "image", pluginVersion: "0.2.7" }; });
  for (const [route, text] of [["svg", "not a PNG, JPEG or WebP"], ["big", "larger than 2 MB"], ["missing", "no image for this project"]]) {
    await page.request.get(`${origin}/__route/${route}`);
    await use.click();
    await page.getByText(text).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save", exact: true }).count(), 0);
  }
  checks.push("SVG, oversized and absent images are rejected before the editor");

  await page.request.get(`${origin}/__route/png`);
  await page.evaluate(() => { window.gate = () => new Promise(done => { window.release = done; }); });
  await page.evaluate(() => window.show("proj_aaaaaaaaaa"));
  await page.getByText("Icon for Alpha").waitFor();
  const before = peerRequests.length;
  await use.click();
  await page.getByText("Checking Homepage…").waitFor();
  await page.evaluate(() => window.show("proj_bbbbbbbbbb"));
  await page.getByText("Icon for Beta").waitFor();
  await page.evaluate(() => window.release());
  await page.waitForTimeout(300);
  assert.equal(await page.getByRole("button", { name: "Save", exact: true }).count(), 0);
  assert.equal(peerRequests.length, before, "late probe result for the previous project fetches nothing");
  checks.push("a delayed peer answer after a project switch is discarded");
  assert.deepEqual(errors, []);

  await writeFile(resolve(output, "results.json"), JSON.stringify({ checks, boundaries: "Real Chrome/React/editor. SDK, RPC and Homepage route mocked; not live BB or a live Homepage plugin." }, null, 2));
  console.log(checks.join("\n"));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
