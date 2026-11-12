// Real React/Chrome UI and canvas normalisation; SDK, RPC, peers and the Homepage image route are fixtures.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { PNG } from "pngjs";

const output = resolve("dist/auto-adopt-browser");
await mkdir(output, { recursive: true });
const sdk = `
export const experimental_usePluginId = () => "auto-adopt-test";
const rpc = {call: (...args) => window.api(...args)};
export const useRpc = () => rpc;
export const useBbContext = () => ({projectId: null});
export const useRealtime = () => {};
export function definePluginApp(register) {
  register({slots: {
    settingsSection: r => window.Settings = r.component,
    homepageSection: () => {}, experimental_threadAction: () => {},
    experimental_appOverlay: () => {},
  }, contentScripts: {register() {}}});
}
`;
const white = new PNG({ width: 64, height: 64 });
white.data.fill(255);
const image = PNG.sync.write(white);
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { AutoAdopt } from "./components/auto-adopt";
    await import("./app");
    window.calls = [];
    window.automaticAdoption = true;
    window.failEnable = false;
    window.scans = [];
    window.projects = [
      {id:"proj_aaaaaaaaaa",name:"Alpha",revision:5,automatic:true,source:{pluginId:"cursor-sidebar",importedAt:1700000000000}},
      {id:"proj_bbbbbbbbbb",name:"Beta",revision:7,automatic:false,source:null},
      {id:"proj_cccccccccc",name:"Gamma",revision:null,automatic:true,source:null},
      {id:"proj_dddddddddd",name:"Delta",revision:null,automatic:false,source:null},
    ];
    window.api = async (method, input) => {
      if (method === "list") return {projects: window.projects, automaticAdoption: window.automaticAdoption};
      window.calls.push({method, input});
      if (method === "enableAutomatic") {
        if (window.failEnable) throw new Error("rpc down");
        window.projects = window.projects.map(p => p.id === input.projectId ? {...p, automatic: true} : p);
        return {status: "enabled"};
      }
      if (method === "setAutomaticAdoption") { window.automaticAdoption = input.enabled; return {enabled: input.enabled}; }
      if (method === "adoptionScan") return window.scans.length ? window.scans.shift() : {status: "ok", candidates: []};
      if (method === "adoptPeer") return {status: "adopted", revision: 11};
      return {};
    };
    window.makeImage = (type, w, h) => {
      const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#2a6"; ctx.fillRect(0, 0, w, h);
      return canvas.toDataURL(type).split(",")[1];
    };
    window.rescans = 0;
    window.addEventListener("bb-project-icons-scan", () => { window.rescans += 1; });
    const root = createRoot(document.getElementById("root"));
    window.show = id => root.render(<window.Settings projectId={id} />);
    window.showAll = () => root.render(<window.Settings />);
    window.mountOverlay = () => createRoot(document.getElementById("overlay")).render(<AutoAdopt />);
    window.ready = true;
  ` },
  bundle: true, format: "esm", jsx: "automatic", outfile: resolve(output, "fixture.js"),
  plugins: [{ name: "sdk-fixture", setup(b) {
    b.onResolve({ filter: /^@get-bb\/plugin-sdk\/app$/ }, () => ({ path: "sdk", namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: sdk, loader: "js", resolveDir: process.cwd() }));
  } }],
});
const homepageRequests = [];
const server = createServer(async (req, res) => {
  if (req.url.startsWith("/api/v1/plugins/homepage/http/project-icon")) {
    homepageRequests.push(req.url);
    return res.writeHead(200, { "Content-Type": "image/png" }).end(image);
  }
  if (req.url.includes("/icon?")) return res.writeHead(200, { "Content-Type": "image/png" }).end(image);
  if (req.url === "/") return res.writeHead(200, { "Content-Type": "text/html" }).end('<!doctype html><html><link rel="stylesheet" href="/fixture.css"><div id="root"></div><div id="overlay"></div><script type="module" src="/fixture.js"></script></html>');
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
  await page.waitForFunction(() => window.ready);
  const calls = method => page.evaluate(name => window.calls.filter(c => c.method === name), method);

  await page.evaluate(() => window.show("proj_aaaaaaaaaa"));
  const imported = await page.evaluate(() => new Date(1700000000000).toLocaleDateString());
  await page.getByText(`From Cursor Sidebar, imported ${imported}.`).waitFor();
  await page.getByText("follows that plugin's artwork until you save or remove this icon").waitFor();
  assert.equal(await page.getByRole("button", { name: "Re-enable automatic icons" }).count(), 0);
  assert.equal(await page.getByRole("checkbox").count(), 0, "the global toggle is not part of the contextual editor");
  checks.push("an auto-imported icon names its source plugin and date");

  await page.evaluate(() => window.show("proj_bbbbbbbbbb"));
  await page.getByText("Set manually. Automatic icons never replace it.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Re-enable automatic icons" }).count(), 0);
  checks.push("a manual icon is labelled manual and offers no re-enable action");

  await page.evaluate(() => window.show("proj_cccccccccc"));
  await page.getByText("Automatic initials. Artwork from an installed supported plugin is used automatically when it exists.").waitFor();
  await page.evaluate(() => { window.automaticAdoption = false; window.show("proj_aaaaaaaaaa"); });
  await page.getByText("Icon for Alpha").waitFor();
  await page.evaluate(() => window.show("proj_cccccccccc"));
  await page.getByText("Automatic adoption is turned off in Project icons settings.").waitFor();
  await page.evaluate(() => { window.automaticAdoption = true; });
  checks.push("a project waiting for artwork explains whether automatic adoption is on");

  await page.evaluate(() => window.show("proj_dddddddddd"));
  await page.getByText("Automatic icons are off for this project because its icon was removed.").waitFor();
  await page.evaluate(() => { window.failEnable = true; });
  await page.getByRole("button", { name: "Re-enable automatic icons" }).click();
  await page.getByRole("alert").filter({ hasText: "Could not re-enable automatic icons" }).waitFor();
  assert.equal(await page.evaluate(() => window.rescans), 0);
  await page.evaluate(() => { window.failEnable = false; });
  await page.getByRole("button", { name: "Re-enable automatic icons" }).click();
  await page.getByText("Automatic initials. Artwork from an installed").waitFor();
  assert.deepEqual((await calls("enableAutomatic")).at(-1).input, { projectId: "proj_dddddddddd" });
  assert.equal(await page.evaluate(() => window.rescans), 1, "re-enabling asks the adopter to scan now");
  assert.equal(await page.getByRole("button", { name: "Re-enable automatic icons" }).count(), 0);
  checks.push("Re-enable automatic icons calls the server, triggers a scan and surfaces failures");

  await page.evaluate(() => window.showAll());
  const toggle = page.getByRole("checkbox", { name: "Use artwork from installed plugins automatically" });
  await toggle.waitFor();
  assert.equal(await toggle.isChecked(), true);
  assert.match(await toggle.getAttribute("aria-describedby") ? await page.locator("#" + await toggle.getAttribute("aria-describedby")).innerText() : "", /Homepage, Cursor Sidebar, Nest, Chat Sidebar/);
  await toggle.click();
  await page.waitForFunction(() => window.automaticAdoption === false);
  await page.waitForFunction(() => !document.querySelector('input[type="checkbox"]').checked);
  assert.deepEqual((await calls("setAutomaticAdoption")).at(-1).input, { enabled: false });
  await toggle.click();
  await page.waitForFunction(() => document.querySelector('input[type="checkbox"]').checked);
  assert.deepEqual((await calls("setAutomaticAdoption")).at(-1).input, { enabled: true });
  checks.push("the global toggle is labelled, described, persisted and re-checked after refresh");

  const png64 = await page.evaluate(() => window.makeImage("image/png", 64, 64));
  const jpeg = await page.evaluate(() => window.makeImage("image/jpeg", 200, 100));
  const webp = await page.evaluate(() => window.makeImage("image/webp", 100, 100));
  const candidate = (projectId, extra) => ({ projectId, peer: "cursor-sidebar", revision: null, transport: "inline", hash: "c".repeat(64), knownHash: null, ...extra });
  const scan = {
    status: "ok",
    candidates: [
      candidate("proj_aaaaaaaaaa", { mimeType: "image/png", base64: png64 }),
      candidate("proj_bbbbbbbbbb", { mimeType: "image/jpeg", base64: jpeg, revision: 4, knownHash: "d".repeat(64) }),
      candidate("proj_cccccccccc", { mimeType: "image/webp", base64: webp, peer: "chat-sidebar" }),
      candidate("proj_dddddddddd", { mimeType: "image/png", base64: Buffer.concat([image.subarray(0, 8), Buffer.alloc(64, 7)]).toString("base64") }),
      candidate("proj_eeeeeeeeee", { transport: "http", peer: "homepage", hash: null }),
    ],
  };
  await page.evaluate(next => { window.scans = [next]; window.mountOverlay(); }, scan);
  await page.evaluate(() => window.dispatchEvent(new Event("bb-project-icons-scan")));
  await page.waitForFunction(() => window.calls.filter(c => c.method === "adoptPeer").length === 4);
  const adopted = await calls("adoptPeer");
  assert.deepEqual(adopted.map(c => c.input.projectId), ["proj_aaaaaaaaaa", "proj_bbbbbbbbbb", "proj_cccccccccc", "proj_eeeeeeeeee"]);
  assert.deepEqual(adopted.map(c => c.input.peer), ["cursor-sidebar", "cursor-sidebar", "chat-sidebar", "homepage"]);
  assert.deepEqual(adopted.map(c => c.input.ifRevision), [null, 4, null, null]);
  assert.deepEqual(adopted.slice(0, 3).map(c => c.input.hash), ["c".repeat(64), "c".repeat(64), "c".repeat(64)]);
  assert.equal(adopted[3].input.hash, createHash("sha256").update(image).digest("hex"));
  assert.deepEqual(homepageRequests, ["/api/v1/plugins/homepage/http/project-icon?projectId=proj_eeeeeeeeee"]);
  for (const { input } of adopted) {
    const bytes = Buffer.from(input.base64, "base64");
    const decoded = PNG.sync.read(bytes);
    assert.deepEqual([decoded.width, decoded.height], [64, 64]);
    assert.ok(bytes.length <= 65536);
  }
  const letterboxed = PNG.sync.read(Buffer.from(adopted[1].input.base64, "base64"));
  assert.equal(letterboxed.data[3], 0, "wide JPEG is fitted onto a transparent 64 x 64 canvas");
  assert.equal(letterboxed.data[(32 * 64 + 32) * 4 + 3], 255);
  checks.push("PNG, JPEG, WebP and Homepage-route artwork are normalised to 64 x 64 PNGs; a corrupt image is skipped without blocking the rest");
  assert.deepEqual(errors, []);

  await writeFile(resolve(output, "results.json"), JSON.stringify({ checks, boundaries: "Real Chrome/React/canvas. SDK, RPC, peer scan results and Homepage route are fixtures; not live BB or any live peer plugin." }, null, 2));
  console.log(checks.join("\n"));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
