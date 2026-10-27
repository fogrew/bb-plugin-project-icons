// Finite native Chrome check of the real Settings component. SDK/RPC and host theme tokens are fixtures.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { PNG } from "pngjs";

const output = resolve("dist/project-grid-browser");
await mkdir(output, { recursive: true });
const sdk = `
  import { useEffect } from "react";
  const rpc = { call: (...args) => window.api(...args) };
  export const useRpc = () => rpc;
  export function useRealtime(_, callback) { useEffect(() => { window.realtime = callback; }, [callback]); }
  export function definePluginApp(register) {
    register({ slots: { settingsSection: ({ component }) => window.Settings = component,
      experimental_appOverlay: () => {} }, contentScripts: { register: () => {} } });
  }
`;
await build({
  stdin: { contents: `
    import { createRoot } from "react-dom/client";
    import "./app";
    const names = ["Atlas", "Untitled", "Untitled", "A very long project name that wraps safely across multiple lines",
      "BuildPipelineWithAnUnbrokenNameThatMustNeverPushTheSettingsPageOutsideItsViewport",
      "Preview service", "Research", "Website", "Notes", "Library", "Experiments", "Archive"];
    window.projects = names.map((name, i) => ({ id: "proj_" + String(i).padStart(10, "0"), name,
      revision: i % 3 === 0 || i === 5 ? 1 : null }));
    window.calls = [];
    window.api = async (method, input) => {
      if (method === "list") return { projects: window.projects.map(p => ({ ...p })) };
      window.calls.push({ method, input });
      if (window.hold) await new Promise(done => window.finishOperation = done);
      const project = window.projects.find(p => p.id === input.projectId);
      if (method === "save") project.revision = (project.revision || 1) + 1;
      if (method === "removeWithUndo") { project.revision = null; return { undo: { token: "fixture", expiresAt: Date.now() + 15000 } }; }
      if (method === "restore") { project.revision = 9; return { status: "restored" }; }
    };
    const decode = window.createImageBitmap.bind(window);
    window.createImageBitmap = file => file.name === "late.png"
      ? new Promise(done => window.finishDecode = async () => done(await decode(file))) : decode(file);
    createRoot(document.getElementById("root")).render(<window.Settings />);
  `, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, format: "esm", outfile: resolve(output, "fixture.js"), jsx: "automatic",
  plugins: [{ name: "sdk-fixture", setup(builder) {
    builder.onResolve({ filter: /^@get-bb\/plugin-sdk\/app$/ }, () => ({ path: "sdk", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: sdk, loader: "js", resolveDir: process.cwd() }));
  } }],
});
const png = new PNG({ width: 64, height: 64 });
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
  const i = (y * 64 + x) * 4;
  png.data.set(x > y ? [225, 100, 35, 255] : [35, 100, 150, 255], i);
}
const image = PNG.sync.write(png);
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Project icon grid fixture</title><style>
:root { --background:#fff; --foreground:#202020; --border:#777; --ring:#165dbb; --muted:#eee; --muted-foreground:#555; --accent:#eee; --accent-foreground:#111; --destructive:#a11; color-scheme:light; }
@media(prefers-color-scheme:dark) { :root { --background:#191919; --foreground:#eee; --border:#888; --ring:#80bfff; --muted:#303030; --muted-foreground:#bbb; --accent:#353535; --accent-foreground:#fff; --destructive:#ff9999; color-scheme:dark; } }
body { margin:16px; background:var(--background); color:var(--foreground); font:14px system-ui; }
h1 { font-size:20px; } main { max-width:1100px; margin:auto; }
</style><link rel="stylesheet" href="/fixture.css"><main><h1>Project icons</h1><div id="root"></div></main><script type="module" src="/fixture.js"></script></html>`;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.endsWith("/icon")) {
    if (url.searchParams.get("projectId") === "proj_0000000005" && url.searchParams.get("v") === "1") {
      res.writeHead(404).end(); return;
    }
    res.writeHead(200, { "Content-Type": "image/png" }).end(image); return;
  }
  if (url.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html" }).end(html); return; }
  if (["/fixture.js", "/fixture.css"].includes(url.pathname)) {
    res.writeHead(200, { "Content-Type": url.pathname.endsWith(".js") ? "text/javascript" : "text/css" })
      .end(await readFile(resolve(output, url.pathname.slice(1)))); return;
  }
  res.writeHead(404).end();
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
let browser;
const scenarios = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:" + server.address().port);
  const cards = page.locator(".bb-project-icons-project");
  const card = index => cards.nth(index);
  const search = page.getByRole("searchbox", { name: "Search projects" });
  await cards.last().waitFor();
  assert.equal(await cards.count(), 12);
  await page.getByText("Preview unavailable", { exact: true }).waitFor();
  assert.match(await card(5).innerText(), /Icon assigned/);
  assert.doesNotMatch(await card(5).innerText(), /No icon yet/);
  assert.match(await card(1).innerText(), /proj_0000000001/);
  assert.match(await card(2).innerText(), /proj_0000000002/);
  assert.equal(await page.locator(".bb-project-icons-editor").count(), 1);
  scenarios.push("12 visible native cards; assigned, missing, broken preview, duplicate IDs and long names");

  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      const layout = await page.evaluate(() => {
        const grid = document.querySelector(".bb-project-icons-list");
        const settings = document.querySelector(".bb-project-icons-settings");
        const editor = document.querySelector(".bb-project-icons-editor");
        const tiles = [...grid.querySelectorAll("button")].map(node => node.getBoundingClientRect());
        return { overflow: document.documentElement.scrollWidth > innerWidth,
          maxHeight: getComputedStyle(grid).maxHeight, overflowY: getComputedStyle(grid).overflowY,
          settingsWidth: settings.getBoundingClientRect().width, editorWidth: editor.getBoundingClientRect().width,
          editorAfter: editor.getBoundingClientRect().top >= grid.getBoundingClientRect().bottom,
          columns: tiles.filter(rect => rect.top === tiles[0].top).length };
      });
      assert.equal(layout.overflow, false, theme + width);
      assert.equal(layout.maxHeight, "none");
      assert.equal(layout.overflowY, "visible");
      assert.equal(layout.editorAfter, true);
      assert.ok(layout.editorWidth <= 480);
      if (width >= 1024) { assert.ok(layout.settingsWidth > 480); assert.ok(layout.columns >= 4); }
      if ([320, 375, 1440].includes(width)) await page.screenshot({ path: resolve(output, theme + "-" + width + ".png"), fullPage: true });

      // Calculate the expected row step independently from the rendered first row.
      const rowSize = layout.columns;
      await card(0).focus();
      await page.keyboard.press("ArrowDown");
      assert.equal(await card(rowSize).evaluate(node => node === document.activeElement), true);
      await page.keyboard.press("ArrowUp");
      assert.equal(await card(0).evaluate(node => node === document.activeElement), true);
      if (rowSize > 1) {
        await page.keyboard.press("ArrowRight");
        assert.equal(await card(1).evaluate(node => node === document.activeElement), true);
        await page.keyboard.press("ArrowLeft");
        await card(rowSize - 1).focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(await card(rowSize - 1).evaluate(node => node === document.activeElement), true);
        const lastFullRowEnd = Math.floor(12 / rowSize) * rowSize - 1;
        if (12 % rowSize) {
          await card(lastFullRowEnd).focus();
          await page.keyboard.press("ArrowDown");
          assert.equal(await card(11).evaluate(node => node === document.activeElement), true);
        }
      }
      await page.keyboard.press("End");
      assert.equal(await card(11).evaluate(node => node === document.activeElement), true);
      await page.keyboard.press("ArrowUp");
      assert.equal(await card(11 - rowSize).evaluate(node => node === document.activeElement), true);
      await page.keyboard.press("Home");
      assert.equal(await card(0).evaluate(node => node === document.activeElement), true);
    }
  }
  scenarios.push("Light/dark at 320/375/768/1024/1440: page flow, no horizontal overflow, desktop width, editor width and spatial keyboard");
  await search.focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await card(0).evaluate(node => node === document.activeElement), true);
  await page.keyboard.press("Tab");
  assert.equal(await card(1).evaluate(node => node === document.activeElement), true);
  await page.keyboard.press("Enter");
  assert.equal(await card(1).getAttribute("aria-pressed"), "true");
  await card(2).focus();
  await page.keyboard.press("Space");
  assert.equal(await card(2).getAttribute("aria-pressed"), "true");
  await search.fill("proj_0000000001");
  assert.equal(await cards.count(), 1);
  await page.getByText("1 of 12 projects", { exact: true }).waitFor();
  await page.getByText("The selected project is outside these search results.").waitFor();
  await search.fill("does not exist");
  await page.getByText("No projects match your search.").waitFor();
  await page.getByRole("button", { name: "Clear search" }).click();
  assert.equal(await cards.count(), 12);
  scenarios.push("Search/counts, ID filter, selected-outside-results, no match, clear, native Tab/Enter/Space");

  const picker = page.locator('input[type="file"]');
  const preview = page.getByAltText("Enlarged draft icon");
  const file = name => ({ name, mimeType: "image/png", buffer: image });
  await picker.setInputFiles(file("icon.png"));
  await preview.waitFor();
  await card(1).click();
  await card(2).click();
  assert.equal(await preview.count(), 0);
  await picker.setInputFiles(file("late.png"));
  await page.getByText("Reading image…", { exact: true }).waitFor();
  await card(1).click();
  await card(2).click();
  await page.evaluate(() => window.finishDecode());
  assert.equal(await preview.count(), 0);
  // A same-batch away/back must also invalidate project-owned drafts.
  await picker.setInputFiles(file("icon.png"));
  await preview.waitFor();
  await page.evaluate(() => {
    const buttons = document.querySelectorAll(".bb-project-icons-project");
    buttons[1].click(); buttons[2].click();
  });
  await preview.waitFor({ state: "detached" });
  scenarios.push("Draft switch, late decode and same-batch away/back cancellation through actual grid");

  await picker.setInputFiles(file("icon.png"));
  await preview.waitFor();
  await page.evaluate(() => window.hold = true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => !!window.finishOperation);
  await card(1).click();
  assert.equal(await page.getByRole("button", { name: "Remove icon", exact: true }).isDisabled(), true);
  await picker.setInputFiles(file("icon.png"));
  await page.getByRole("alert").filter({ hasText: "Wait for" }).waitFor();
  await page.evaluate(() => { window.hold = false; window.finishOperation(); });
  await page.waitForFunction(() => window.projects[2].revision !== null);
  await page.waitForFunction(() => document.querySelectorAll(".bb-project-icons-project")[2].textContent.includes("Icon assigned"));
  assert.equal(await card(1).getAttribute("aria-pressed"), "true");
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.method === "save").length), 1);
  assert.equal(await page.evaluate(() => window.calls.find(call => call.method === "save").input.projectId), "proj_0000000002");
  await card(2).click();
  await page.getByRole("button", { name: "Remove icon", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".bb-project-icons-project")[2].textContent.includes("No icon yet"));
  await page.getByRole("button", { name: "Undo removal", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".bb-project-icons-project")[2].textContent.includes("Icon assigned"));
  scenarios.push("Native PNG save retains owner across switch; busy input/removal guard; remove and Undo update card status");

  await page.evaluate(() => {
    window.projects[5].revision = 2;
    window.projects[1].revision = 10;
    window.realtime();
  });
  await page.getByText("Preview unavailable", { exact: true }).waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelectorAll(".bb-project-icons-project")[1].textContent.includes("Icon assigned"));
  assert.equal(await card(2).getAttribute("aria-pressed"), "true");
  scenarios.push("Realtime status updates retain selection; revision change recovers a broken preview");
  assert.deepEqual(errors, []);
  const result = { chrome: browser.version(), scenarios, mocks: "SDK registration/useRpc/realtime, RPC assignments/Undo and host theme tokens; native React/DOM/Chrome/PNG/canvas; fixture HTTP only", liveBB: false };
  await writeFile(resolve(output, "results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}

