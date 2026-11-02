import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { createHash } from "node:crypto";

const host = process.env.IMAGE_PREVIEW_SOURCE;
assert.ok(host, "Set IMAGE_PREVIEW_SOURCE to the installed image-preview.ts");
const source = await readFile(host);
const original = await readFile("project-grid.browser.mjs", "utf8");
const prefix = original.slice(0, original.indexOf("const scenarios = [];"))
  .replace('dist/project-grid-browser', 'dist/icon-preview-browser')
  .replace('[35, 100, 150, 255]', '[35, 100, 150, 0]');
await writeFile("dist/icon-preview-browser-run.mjs", prefix.replaceAll('from "node:', 'from "node:') + `
try {
  await build({ stdin: { contents: 'import { mountImagePreview } from ' + JSON.stringify(${JSON.stringify(host)}) + '; mountImagePreview(new AbortController().signal);',
    resolveDir: process.cwd(), loader: "ts" }, bundle: true, outfile: resolve(output, "host.js") });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.addScriptTag({ path: resolve(output, "host.js") });
  await page.evaluate(() => {
    const control = document.createElement("img");
    control.src = "/api/icon?projectId=control";
    control.alt = "Host viewer control";
    document.querySelector("main").prepend(control);
  });
  await page.locator('img[alt="Host viewer control"][data-bb-image-preview]').waitFor();
  await page.getByAltText("Host viewer control").click();
  await page.locator("#bb-image-preview-lightbox:visible").waitFor();
  await page.keyboard.press("Escape");
  await page.locator('img[alt="Host viewer control"][data-bb-image-preview]').evaluate(el=>el.remove());
  await page.locator(".bb-project-icons-project").first().click();
  const current = page.getByRole("button", {name:"Open current project icon preview"});
  await current.waitFor();
  const results = [];
  for (const width of [320,375,1440,640]) for (const theme of ["light","dark"]) {
    await page.setViewportSize({width,height: width === 640 ? 400 : 900});
    await page.emulateMedia({colorScheme:theme});
    await current.focus();
    await page.keyboard.press("Enter");
    const dialog = page.locator("dialog[open]");
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)),true);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)),true);
    const image = dialog.locator("img");
    const close = dialog.getByRole("button");
    const a = await image.boundingBox(), b = await close.boundingBox();
    assert.ok(b.y+b.height <= a.y);
    assert.ok(b.width>=44 && b.height>=44);
    assert.ok(a.x>=0 && a.x+a.width<=width);
    assert.equal(await page.locator("#bb-image-preview-lightbox:visible").count(),0);
    await page.screenshot({path:resolve(output,width+"-"+theme+".png")});
    await page.keyboard.press("Escape");
    await dialog.waitFor({state:"hidden"});
    assert.equal(await current.evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press("Space");
    await close.click();
    assert.equal(await page.evaluate(()=>window.calls.length),0);
    results.push({width,theme});
  }
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({name:"draft.png",mimeType:"image/png",buffer:image});
  const draft = page.getByRole("button",{name:"Open enlarged draft icon preview"});
  await draft.waitFor();
  const before = await draft.locator("img").getAttribute("src");
  await draft.click();
  assert.equal(await page.locator("dialog[open] img").getAttribute("src"),before);
  await page.screenshot({path:resolve(output,"draft.png")});
  await page.keyboard.press("Escape");
  await input.evaluate(el=>window.originalInput=el);
  for (const key of ["Enter","Space"]) {
    await draft.focus(); await page.keyboard.press(key);
    await page.locator("dialog[open]").getByRole("button").click();
    assert.equal(await draft.locator("img").getAttribute("src"),before);
    assert.equal(await input.evaluate(el=>el===window.originalInput),true);
    assert.equal(await page.evaluate(()=>window.calls.length),0);
  }
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  assert.equal(await draft.count(),0);
  assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.getByRole("tab",{name:"Emoji",exact:true}).click();
  await page.getByRole("button",{name:/grinning face/i}).first().click();
  await draft.waitFor();
  const emoji = await draft.locator("img").getAttribute("src");
  await draft.click();
  assert.equal(await page.locator("dialog[open] img").getAttribute("src"),emoji);
  await page.screenshot({path:resolve(output,"emoji.png")});
  await page.keyboard.press("Escape");
  assert.equal(await draft.locator("img").getAttribute("src"),emoji);
  await page.getByRole("button",{name:"Save",exact:true}).click();
  assert.equal(await page.evaluate(()=>window.calls.at(-1).input.base64),emoji.split(",")[1]);
  await writeFile(resolve(output,"results.json"),JSON.stringify({results,hostSource:${JSON.stringify(host)},sha256:${JSON.stringify(createHash("sha256").update(source).digest("hex"))}},null,2));
  console.log("Preview browser regression passed");
} finally { await browser?.close(); await new Promise(done=>server.close(done)); }
`);
await import("./dist/icon-preview-browser-run.mjs");
