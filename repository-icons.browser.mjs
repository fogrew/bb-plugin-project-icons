// Real React/Chrome editor; SDK registrations and RPC (discovery results) are fixtures.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { extractIconImage } from "./lib/ico.ts";
import { BOTTOM, TOP, bmpEntry, buildIco, pngEntry } from "./test-fixtures/ico.mjs";

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
const bmpIco = buildIco([bmpEntry(16), bmpEntry(48), bmpEntry(32, { depth: 24 })]);
const pngIco = buildIco([pngEntry(16), pngEntry(64), bmpEntry(32)]);
const candidateIco = extractIconImage(bmpIco);
const candidatePng = extractIconImage(pngIco);
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
        return {status:"ok",candidates:[{path:"public/favicon.png",name:"favicon.png"},{path:"public/favicon.ico",name:"favicon.ico"},{path:"assets/icon.ico",name:"icon.ico"},{path:"docs/logo.png",name:"logo.png"}],rejected:{svg:1,unsupported:0},truncated:false};
      }
      if (method === "readCandidate") {
        if (input.path === "docs/logo.png") throw new Error("Image is larger than 2 MB");
        if (input.path === "assets/icon.ico") return {base64:"${Buffer.from(candidatePng.bytes).toString("base64")}",mimeType:"${candidatePng.mimeType}",sizeBytes:${candidatePng.bytes.length}};
        if (input.path === "public/favicon.ico") return {base64:"${Buffer.from(candidateIco.bytes).toString("base64")}",mimeType:"${candidateIco.mimeType}",sizeBytes:${candidateIco.bytes.length}};
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
  assert.equal(await list.getByRole("button").count(), 4);
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

  const savedPng = async (count) => {
    await page.waitForFunction((n) => window.calls.filter(c => c.method === "save").length === n, count);
    const base64 = await page.evaluate(() => window.calls.filter(c => c.method === "save").at(-1).input.base64);
    return PNG.sync.read(Buffer.from(base64, "base64"));
  };
  const near = (actual, expected) => expected.every((value, index) => Math.abs(actual[index] - value) <= 12);
  const sample = (icon, y) => Array.from(icon.data.subarray((y * 64 + 32) * 4, (y * 64 + 32) * 4 + 4));
  const assertHalves = (icon, label) => {
    assert.deepEqual([icon.width, icon.height], [64, 64], label);
    assert.ok(near(sample(icon, 8), TOP) && near(sample(icon, 56), BOTTOM), `${label}: ${sample(icon, 8)} / ${sample(icon, 56)}`);
  };
  const saveButton = page.getByRole("button", { name: "Save", exact: true });

  await find.click();
  await list.waitFor();
  await list.getByRole("button", { name: "public/favicon.ico" }).click();
  await saveButton.waitFor();
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.method === "save").length), 1);
  await saveButton.click();
  assertHalves(await savedPng(2), "repository ICO candidate");
  checks.push("a repository favicon.ico (BMP entries) is decoded by Chrome, previewed, and saved as an upright 64 x 64 PNG only after Save");

  await find.click();
  await list.waitFor();
  await list.getByRole("button", { name: "assets/icon.ico" }).click();
  await saveButton.waitFor();
  await saveButton.click();
  assertHalves(await savedPng(3), "repository ICO candidate (PNG entry)");
  checks.push("a repository favicon.ico whose largest entry is a PNG is previewed and saved as an upright 64 x 64 PNG");

  const picker = page.locator('input[type="file"]');
  assert.match(await picker.getAttribute("accept"), /\.ico/);
  await picker.setInputFiles({ name: "favicon.ico", mimeType: "image/x-icon", buffer: pngIco });
  await saveButton.waitFor();
  await saveButton.click();
  assertHalves(await savedPng(4), "manual multi-size ICO (PNG entry)");
  await picker.setInputFiles({ name: "favicon.ico", mimeType: "image/x-icon", buffer: bmpIco });
  await saveButton.waitFor();
  await saveButton.click();
  assertHalves(await savedPng(5), "manual multi-size ICO (BMP entry)");
  checks.push("manual ICO import picks the largest entry (PNG or BMP) and saves a 64 x 64 PNG");

  for (const [name, file] of Object.entries({
    "truncated directory": { name: "bad.ico", mimeType: "image/x-icon", buffer: bmpIco.subarray(0, 20) },
    "extension mismatch": { name: "photo.png", mimeType: "image/png", buffer: pngIco },
    "PNG renamed to ico": { name: "photo.ico", mimeType: "image/x-icon", buffer: image },
  })) {
    const rejection = page.getByRole("alert").filter({ hasText: "Could not read image" });
    await picker.setInputFiles({ name: "favicon.ico", mimeType: "image/x-icon", buffer: pngIco });
    await saveButton.waitFor();
    await rejection.waitFor({ state: "detached" });
    await picker.setInputFiles(file);
    await rejection.waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(c => c.method === "save").length), 5, name);
  }
  checks.push("hostile, mislabeled and renamed ICO files are rejected without saving");

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
