// Finite native Chrome regression; SDK/RPC are fakes and theme tokens are fixture CSS.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const output = resolve("dist/crop-labels-browser");
await mkdir(output, { recursive: true });
await build({
  stdin: { contents: `
    import { useSyncExternalStore } from "react";
    import { createRoot } from "react-dom/client";
    import { ImageEditor } from "./components/image-editor";
    import { createSettingsState } from "./settings-state";
    window.saves = [];
    function Fixture({ id }) {
      const state = window.states[id];
      const snapshot = useSyncExternalStore(state.subscribe, state.getSnapshot);
      return <section aria-label={id}><ImageEditor project={snapshot.projects[0]} state={state}
        busy={!!snapshot.operation} />{snapshot.notice && <p role="status">{snapshot.notice.text}</p>}</section>;
    }
    window.states = {};
    for (const id of ["Alpha", "Beta"]) {
      const state = window.states[id] = createSettingsState({
        list: async () => ({ projects: [{ id, name: id, revision: null }] }),
        save: async (input) => { window.saves.push(input); }, remove: async () => {},
      }, () => {});
      await state.refresh(); state.select(id);
    }
    createRoot(document.getElementById("root")).render(<><Fixture id="Alpha" /><Fixture id="Beta" /></>);
  `, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, format: "esm", outfile: resolve(output, "fixture.js"), jsx: "automatic",
});
const bundle = await readFile(resolve(output, "fixture.js"), "utf8");
const htmlPath = resolve(output, "index.html");
await writeFile(htmlPath, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Crop label regression</title>
<style>:root { --background:white; --foreground:#202020; --border:#777; --ring:#165dbb; --muted:#eee; --muted-foreground:#555; }</style>
<link rel="stylesheet" href="../../app.css"><div id="root"></div><script type="module">${bundle.replaceAll("</script", "<\\/script")}</script></html>`);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 1200 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(htmlPath).href);
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120; canvas.height = 80;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 120, 80);
    gradient.addColorStop(0, "red"); gradient.addColorStop(1, "blue");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 120, 80);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  for (const id of ["Alpha", "Beta"]) {
    const editor = page.getByRole("region", { name: id, exact: true });
    await editor.locator('input[type="file"]').setInputFiles({ name: "gradient.png", mimeType: "image/png", buffer: png });
    await editor.getByAltText("Enlarged draft icon").waitFor();
    for (const name of ["Zoom", "Horizontal offset (pixels)", "Vertical offset (pixels)"]) {
      assert.equal(await editor.getByRole("slider", { name, exact: true }).count(), 1, name);
    }
  }
  assert.deepEqual(await page.locator('input[type="range"]').evaluateAll((inputs) => ({
    count: inputs.length, unique: new Set(inputs.map((input) => input.id)).size,
    associated: inputs.every((input) => input.id && input.labels.length === 1 && input.labels[0].control === input),
  })), { count: 6, unique: 6, associated: true });
  const editor = page.getByRole("region", { name: "Alpha", exact: true });
  const zoom = editor.getByRole("slider", { name: "Zoom", exact: true });
  const node = await zoom.elementHandle();
  await editor.locator("label").filter({ hasText: /^Zoom$/ }).click();
  assert.equal(await node.evaluate((input) => document.activeElement === input), true);
  for (const expected of [1.05, 1.1]) {
    await page.keyboard.press("ArrowRight");
    assert.equal(await node.evaluate((input) => input.isConnected && document.activeElement === input), true);
    assert.equal(Number(await zoom.inputValue()), expected);
  }
  const before = await editor.getByAltText("Enlarged draft icon").getAttribute("src");
  const box = await zoom.boundingBox();
  await page.mouse.move(box.x + box.width * 0.06, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  assert.ok(Number(await zoom.inputValue()) > 2);
  assert.equal(await node.evaluate((input) => input.isConnected && document.activeElement === input), true);
  assert.notEqual(await editor.getByAltText("Enlarged draft icon").getAttribute("src"), before);
  await editor.getByRole("button", { name: "Fill", exact: true }).click();
  assert.equal(await editor.getByRole("button", { name: "Fill", exact: true }).getAttribute("aria-pressed"), "true");
  for (const name of ["Horizontal offset (pixels)", "Vertical offset (pixels)"]) {
    const slider = editor.getByRole("slider", { name, exact: true });
    await slider.focus(); await page.keyboard.press("ArrowRight");
    assert.ok(Number(await slider.inputValue()) > 0);
  }
  const draft = await editor.getByAltText("Enlarged draft icon").getAttribute("src");
  // Inject only the encoder failure; native decode, drawing and successful encoding remain real.
  await page.evaluate(() => {
    window.nativeToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); };
  });
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Could not upload icon" }).waitFor();
  assert.equal(await editor.getByAltText("Enlarged draft icon").getAttribute("src"), draft);
  assert.equal(await editor.getByRole("button", { name: "Save", exact: true }).isEnabled(), true);
  assert.equal(await node.evaluate((input) => input.isConnected), true);
  for (const name of ["Zoom", "Horizontal offset (pixels)", "Vertical offset (pixels)"]) {
    assert.equal(await editor.getByRole("slider", { name, exact: true }).count(), 1);
  }
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.nativeToBlob; });
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await editor.getByAltText("Enlarged draft icon").waitFor({ state: "detached" });
  const saved = await page.evaluate(() => window.saves);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].projectId, "Alpha");
  assert.equal(saved[0].base64, draft.split(",")[1]);
  assert.equal(await page.getByRole("region", { name: "Beta", exact: true }).getByAltText("Enlarged draft icon").count(), 1);
  assert.deepEqual(errors, []);
  const results = { chrome: browser.version(), scenarios: "role/name, two instances, native label focus, same-node arrows, pointer drag, Fill, offsets, encoder failure and PNG save", mocks: "SDK/RPC, theme tokens; injected null toBlob failure", liveBB: false };
  await writeFile(resolve(output, "results.json"), JSON.stringify(results, null, 2));
  console.log(results);
} finally { await browser.close(); }
