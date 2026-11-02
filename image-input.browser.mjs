// Optional finite browser harness: no BB installation or HTTP server is modified.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const output = resolve("dist/image-input-browser");
await mkdir(output, { recursive: true });
await build({
  stdin: { contents: `
    import { useSyncExternalStore } from "react";
    import { createRoot } from "react-dom/client";
    import { ImageEditor } from "./components/image-editor";
    import { createSettingsState } from "./settings-state";
    const projects = [{ id: "a", name: "Alpha", revision: null }, { id: "b", name: "Beta", revision: null }];
    window.saves = [];
    window.failSave = false;
    window.holdSave = false;
    window.state = createSettingsState({
      list: async () => ({ projects }),
      save: async (input) => {
        if (window.holdSave) await new Promise((done) => window.finishSave = done);
        if (window.failSave) throw new Error("Simulated RPC failure");
        window.saves.push(input);
      },
      remove: async () => {},
    }, () => {});
    const nativeDecode = window.createImageBitmap.bind(window);
    window.decodeCount = 0;
    window.createImageBitmap = (file) => {
      window.decodeCount++;
      if (file.name === "late.png") return new Promise((done) => {
        window.finishDecode = async () => done(await nativeDecode(file));
      });
      return nativeDecode(file);
    };
    function App() {
      const snapshot = useSyncExternalStore(window.state.subscribe, window.state.getSnapshot);
      const project = snapshot.projects.find((row) => row.id === snapshot.selected);
      return <div className="bb-project-icons-settings">
        <label>Search<input type="search" aria-label="Search" /></label>
        <textarea aria-label="Notes" />
        <button onClick={() => window.state.select("a")}>Alpha</button>
        <button onClick={() => window.state.select("b")}>Beta</button>
        {project && <ImageEditor key={project.id} project={project} state={window.state} busy={!!snapshot.operation} />}
        {snapshot.notice && <p role="status">{snapshot.notice.text}</p>}
      </div>;
    }
    await window.state.refresh();
    createRoot(document.getElementById("root")).render(<App />);
  `, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, format: "esm", outfile: resolve(output, "fixture.js"), jsx: "automatic",
});
await writeFile(resolve(output, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Image input verification</title>
<style>:root { --background: white; --foreground: #202020; --border: #777; --ring: #165dbb; --muted: #eee; --muted-foreground: #555; --destructive: #aa1111; } body { margin: 16px; font-family: sans-serif; }</style>
<link rel="stylesheet" href="../../app.css"><div id="root"></div><script type="module" src="./fixture.js"></script></html>`);
// Chromium blocks file:// ES modules; inline the generated bundle instead.
const { readFile } = await import("node:fs/promises");
const htmlPath = resolve(output, "index.html");
const bundle = await readFile(resolve(output, "fixture.js"), "utf8");
await writeFile(htmlPath, (await readFile(htmlPath, "utf8")).replace('<script type="module" src="./fixture.js"></script>',
  () => '<script type="module">' + bundle.replaceAll("</script", "<\\/script") + "</script>"));

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 768, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
  await page.goto(pathToFileURL(htmlPath).href);
  const area = page.getByRole("group", { name: "Project icon image input and editor" });
  const preview = page.getByAltText("Enlarged draft icon");
  const picker = page.locator('input[type="file"]');
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 80; canvas.height = 40;
    canvas.getContext("2d").fillRect(0, 0, 80, 40);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  const file = (name = "icon.png") => ({ name, mimeType: "image/png", buffer: png });
  const visiblePreview = () => preview.waitFor({ state: "visible" });
  const transfer = async (kind, count = 1, name = "icon.png", target = ".bb-project-icons-input") =>
    page.evaluate(({ kind, count, name, target, bytes }) => {
      const element = document.querySelector(target);
      element.focus();
      const data = new DataTransfer();
      for (let i = 0; i < count; i++) data.items.add(new File([new Uint8Array(bytes)], name, { type: "image/png" }));
      const event = kind === "paste" ? new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })
        : new DragEvent(kind, { bubbles: true, cancelable: true, dataTransfer: data });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, { kind, count, name, target, bytes: [...png] });

  await picker.setInputFiles(file());
  await visiblePreview();
  assert.equal(await page.evaluate(() => window.decodeCount), 1);
  results.push("Picker: real PNG decode and canvas preview");

  assert.equal(await transfer("drop"), true);
  await visiblePreview();
  assert.equal(await transfer("paste"), true);
  await visiblePreview();
  results.push("Drop/paste: synthetic DataTransfer, real PNG decode and canvas preview");

  for (const target of ['input[type="search"]', "textarea"]) {
    assert.equal(await transfer("paste", 1, "icon.png", target), false);
  }
  // Also verify real DOM text-editing detection inside the area.
  await area.evaluate((element) => {
    for (const tag of ["input", "textarea", "div"]) {
      const child = document.createElement(tag);
      child.dataset.textFixture = tag;
      if (tag === "div") child.contentEditable = "true";
      element.append(child);
    }
  });
  for (const tag of ["input", "textarea", "div"]) {
    assert.equal(await transfer("paste", 1, "icon.png", '[data-text-fixture="' + tag + '"]'), false);
  }
  await area.evaluate((element) => element.querySelectorAll("[data-text-fixture]").forEach((node) => node.remove()));
  results.push("Search, textarea, text input and contenteditable paste keep browser defaults");

  const before = await preview.getAttribute("src");
  assert.equal(await transfer("drop", 2), true);
  await page.getByRole("alert").filter({ hasText: "one image" }).waitFor();
  assert.equal(await preview.getAttribute("src"), before);
  assert.equal(await transfer("paste", 2), true);
  assert.equal(await preview.getAttribute("src"), before);
  results.push("Multiple-file drop/paste rejected with existing draft preserved");

  await area.evaluate((element) => {
    const child = element.querySelector("label");
    const data = new DataTransfer();
    data.items.add(new File(["x"], "icon.png", { type: "image/png" }));
    for (const [target, type] of [[element, "dragenter"], [child, "dragenter"], [child, "dragleave"]])
      target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }));
  });
  assert.equal(await area.getAttribute("data-dragging"), "true");
  await area.dispatchEvent("dragleave");
  assert.equal(await area.getAttribute("data-dragging"), "false");
  results.push("Nested drag retains highlight until final leave");

  await picker.setInputFiles({ name: "unsupported.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await page.getByRole("alert").filter({ hasText: "Could not read" }).waitFor();
  await picker.setInputFiles({ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("invalid") });
  await page.getByRole("alert").filter({ hasText: "Could not read" }).waitFor();
  await picker.setInputFiles(file());
  await visiblePreview();
  results.push("Unsupported/corrupt files report failure; retry succeeds");

  await picker.setInputFiles(file("late.png"));
  await page.getByRole("status").filter({ hasText: "Reading image" }).waitFor();
  await page.getByRole("button", { name: "Beta", exact: true }).click();
  await page.evaluate(() => window.finishDecode());
  assert.equal(await preview.count(), 0);
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  assert.equal(await preview.count(), 0);
  results.push("Project switch discards late decode without applying to either project");

  await picker.setInputFiles(file("late.png"));
  await page.getByRole("status").filter({ hasText: "Reading image" }).waitFor();
  await transfer("paste");
  await visiblePreview();
  const newest = await preview.getAttribute("src");
  await page.evaluate(() => window.finishDecode());
  assert.equal(await preview.getAttribute("src"), newest);
  results.push("Newer input wins over pending decode");

  await page.evaluate(() => window.failSave = true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Could not save" }).waitFor();
  assert.equal(await preview.isVisible(), true);
  await page.evaluate(() => { window.failSave = false; window.holdSave = true; });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => !!window.finishSave);
  assert.equal(await transfer("drop"), true);
  await page.getByRole("alert").filter({ hasText: "Wait for" }).waitFor();
  await page.evaluate(() => window.finishSave());
  await preview.waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => window.saves.length), 1);
  assert.equal(await page.evaluate(() => window.saves[0].projectId), "a");
  results.push("Failed save retains draft; busy drop is claimed/refused; retry saves to owner");

  await area.focus();
  await page.keyboard.press("Tab");
  assert.equal(await picker.evaluate((node) => node === document.activeElement), true);
  await picker.setInputFiles(file());
  await visiblePreview();
  const slider = page.getByRole("slider").first();
  await slider.focus();
  const zoom = await slider.inputValue();
  await page.keyboard.press("ArrowRight");
  assert.ok(Number(await slider.inputValue()) > Number(zoom));
  await page.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await picker.evaluate((node) => node === document.activeElement), true);
  results.push("Keyboard Tab reaches picker; arrows adjust crop; Enter cancels and restores focus");

  await page.setViewportSize({ width: 320, height: 1000 });
  await picker.setInputFiles(file());
  await visiblePreview();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(output, "mobile.png"), fullPage: true });
  results.push("320 px layout has no horizontal overflow; screenshot saved");
  assert.deepEqual(errors, []);
  results.push("No page errors");
  console.log(JSON.stringify({ browser: await browser.version(), results }, null, 2));
  await writeFile(resolve(output, "results.json"), JSON.stringify({ browser: await browser.version(), results }, null, 2));
} finally { await browser.close(); }
