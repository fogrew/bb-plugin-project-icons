import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { buildExport } from "./lib/icon-transfer.ts";
import { emojiPng, opaquePng, transparentPng } from "./test-fixtures/png.mjs";
import { A, B, setup } from "./test-fixtures/peer-host.mjs";

const output = resolve("dist/icon-transfer-browser");
await mkdir(output, { recursive: true });
const bundle = await build({
  stdin: { contents: `
    import { createRoot } from "react-dom/client";
    import { IconTransfer } from "./components/icon-transfer";
    const server = new URLSearchParams(location.search).get("server");
    window.rpcCalls = [];
    window.imported = 0;
    const post = async (method, input) => {
      window.rpcCalls.push(method);
      const response = await fetch("/" + server + "/rpc/" + method, { method: "POST", body: JSON.stringify(input ?? null) });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    };
    const api = {
      exportIcons: () => post("exportIcons"),
      preview: payload => post("importPreview", { payload }),
      apply: (payload, decisions) => post("importApply", { payload, decisions }),
    };
    createRoot(document.getElementById("root")).render(
      <div className="bb-project-icons-settings">
        <IconTransfer api={api} iconUrl={(id, revision) => "/" + server + "/icon?projectId=" + id + "&v=" + revision} onImported={() => { window.imported += 1; }} />
      </div>);
  `, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, format: "esm", write: false, jsx: "automatic", outfile: "fixture.js",
});
const script = bundle.outputFiles[0].text.replaceAll("</script", "<\\/script");
const css = await readFile("app.css", "utf8");
const page_html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Icon transfer verification</title><link rel="icon" href="data:,">
<style>:root { --background: white; --foreground: #202020; --border: #777; --ring: #165dbb; --muted: #eee; --muted-foreground: #555; --destructive: #aa1111; }
body { margin: 16px; font-family: sans-serif; box-sizing: border-box; } @media (prefers-color-scheme: dark) { :root { --background: #181818; --foreground: #eee; --border: #888; --muted-foreground: #bbb; --destructive: #ff8a8a; } body { background: #181818; color: #eee; } }
${css}</style><div id="root"></div><script type="module">${script}</script></html>`;

const C = "proj_cccccccccc", D = "proj_dddddddddd", E = "proj_eeeeeeeeee";
const hosts = {
  a: setup({ projects: [{ id: A, name: "Alpha" }, { id: B, name: "Beta" }] }),
  b: setup({ projects: [{ id: C, name: "Alpha" }, { id: D, name: "Beta" }, { id: E, name: "Beta" }] }),
};
await hosts.a.call("save", { projectId: A, base64: transparentPng.toString("base64") });
await hosts.a.call("save", { projectId: B, base64: opaquePng.toString("base64") });
const rows = async name => Object.fromEntries((await hosts[name].call("list", null)).projects.map(row => [row.id, row.revision]));
const iconOf = async (name, id) => {
  const response = await hosts[name].harness.behavior.fetchHttp("GET", `/icon?projectId=${id}`);
  return response.status === 200 ? Buffer.from(await response.arrayBuffer()) : null;
};
const body = request => new Promise(done => { const chunks = []; request.on("data", chunk => chunks.push(chunk)); request.on("end", () => done(Buffer.concat(chunks).toString("utf8"))); });
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const route = url.pathname.match(/^\/(a|b)\/(rpc\/(\w+)|icon)$/);
  if (url.pathname === "/") { response.writeHead(200, { "Content-Type": "text/html" }); response.end(page_html); return; }
  if (!route) { response.writeHead(404).end(); return; }
  const host = hosts[route[1]];
  if (route[2] === "icon") {
    const image = await iconOf(route[1], url.searchParams.get("projectId"));
    response.writeHead(image ? 200 : 404, { "Content-Type": "image/png" }).end(image ?? undefined);
    return;
  }
  try {
    const result = await host.call(route[3], JSON.parse(await body(request)));
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
  } catch (error) { response.writeHead(500).end(String(error?.message ?? error)); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

const results = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errors = [];
const step = async (name, run) => { await run(); results.push(name); console.log(`ok - ${name}`); };
const file = (name, content) => ({ name, mimeType: "application/json", buffer: Buffer.from(content) });
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1024, height: 900 } });
  const open = async name => {
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${origin}/?server=${name}`);
    await page.getByRole("button", { name: "Export icons" }).waitFor();
    return page;
  };
  const pageA = await open("a");
  let exported = "";
  await step("export downloads a versioned file with only ids, names and images", async () => {
    const download = pageA.waitForEvent("download");
    await pageA.getByRole("button", { name: "Export icons" }).click();
    const saved = await download;
    assert.equal(saved.suggestedFilename(), "project-icons.json");
    const path = resolve(output, "export.json");
    await saved.saveAs(path);
    exported = await readFile(path, "utf8");
    const parsed = JSON.parse(exported);
    assert.deepEqual([parsed.format, parsed.version, parsed.icons.length], ["bb-project-icons", 1, 2]);
    assert.deepEqual(parsed.icons.map(icon => Object.keys(icon).join()), Array(2).fill("projectId,projectName,image"));
    await pageA.getByText("Exported 2 icons to project-icons.json.").waitFor();
  });

  const pageB = await open("b");
  const section = pageB.getByRole("region", { name: "Import preview" });
  const choose = payload => pageB.getByLabel("Import icons from a file").setInputFiles(file("icons.json", payload));
  await step("cross-server preview maps nothing by name and writes nothing", async () => {
    await choose(exported);
    await section.waitFor();
    assert.equal(await section.getByRole("listitem").count(), 2);
    for (const select of await section.getByLabel("Import into").all()) assert.equal(await select.inputValue(), "");
    assert.equal(await section.getByText("No project here has this id", { exact: false }).count(), 2);
    assert.equal(await pageB.getByRole("button", { name: "Import 0 icons" }).isDisabled(), true);
    const beta = section.getByRole("listitem").nth(1).getByLabel("Import into");
    const labels = await beta.locator("option").allTextContents();
    assert.deepEqual(labels.slice(0, 3), ["Do not import", `Beta (${D}) (same name)`, `Beta (${E}) (same name)`]);
    assert.deepEqual(await rows("b"), { [C]: null, [D]: null, [E]: null });
    await pageB.screenshot({ path: resolve(output, "preview-1024.png") });
  });
  await step("cancel leaves everything unchanged", async () => {
    await pageB.getByRole("button", { name: "Cancel" }).click();
    await section.waitFor({ state: "detached" });
    assert.deepEqual(await rows("b"), { [C]: null, [D]: null, [E]: null });
    assert.equal(await pageB.evaluate(() => window.rpcCalls.filter(call => call === "importApply").length), 0);
  });
  await step("choosing projects explicitly imports into exactly those projects", async () => {
    await choose(exported);
    await section.waitFor();
    await section.getByRole("listitem").nth(0).getByLabel("Import into").selectOption(C);
    await section.getByRole("listitem").nth(1).getByLabel("Import into").selectOption(E);
    await pageB.getByRole("button", { name: "Import 2 icons" }).click();
    await pageB.getByText("Imported 2 icons.").waitFor();
    assert.equal(await pageB.evaluate(() => window.imported), 1);
    assert.ok((await iconOf("b", C)).equals(transparentPng));
    assert.ok((await iconOf("b", E)).equals(opaquePng));
    assert.equal(await iconOf("b", D), null);
  });
  await step("two icons aimed at one project block the import", async () => {
    await choose(exported);
    await section.waitFor();
    await section.getByRole("listitem").nth(0).getByLabel("Import into").selectOption(D);
    await section.getByRole("listitem").nth(1).getByLabel("Import into").selectOption(D);
    await pageB.getByText("same project", { exact: false }).waitFor();
    assert.equal(await pageB.getByRole("button", { name: /^Import \d+ icons?$/ }).isDisabled(), true);
    await pageB.getByRole("button", { name: "Cancel" }).click();
  });

  const replacement = buildExport([{ projectId: C, projectName: "Alpha", image: emojiPng.toString("base64") }]);
  await step("replacing an icon needs an explicit confirmation", async () => {
    await choose(replacement);
    await section.waitFor();
    assert.equal(await section.getByLabel("Import into").inputValue(), C);
    await section.getByText("Replaces the current icon of Alpha.").waitFor();
    assert.equal(await section.getByAltText("Current icon of Alpha").count(), 1);
    const apply = pageB.getByRole("button", { name: "Import 1 icon" });
    assert.equal(await apply.isDisabled(), true);
    await pageB.getByLabel("Replace 1 existing icon").check();
    assert.equal(await apply.isDisabled(), false);
    await section.getByLabel("Import into").selectOption("");
    assert.equal(await pageB.getByLabel("Replace 1 existing icon").count(), 0);
    await section.getByLabel("Import into").selectOption(C);
    assert.equal(await pageB.getByLabel("Replace 1 existing icon").isChecked(), false);
    assert.ok((await iconOf("b", C)).equals(transparentPng));
    await pageB.getByLabel("Replace 1 existing icon").check();
    await apply.click();
    await pageB.getByText("Imported 1 icon.").waitFor();
    assert.ok((await iconOf("b", C)).equals(emojiPng));
  });
  await step("an identical icon needs no replacement", async () => {
    await choose(replacement);
    await section.getByText("already has this exact icon", { exact: false }).waitFor();
    assert.equal(await pageB.getByRole("button", { name: "Import 0 icons" }).isDisabled(), true);
    await pageB.getByRole("button", { name: "Cancel" }).click();
  });
  await step("corrupt, invalid and oversized files show a clear error and no preview", async () => {
    const entry = { projectId: C, projectName: "x", image: "AAAA" };
    const cases = [
      [JSON.stringify({ format: "bb-project-icons", version: 1, icons: [entry] }), "Icon 1 is not a valid 64 × 64 PNG."],
      ["{ not json", "The file is not valid JSON."],
      [JSON.stringify({ format: "other" }), "The file is not a Project Icons export."],
      [JSON.stringify({ format: "bb-project-icons", version: 3, icons: [] }), "The file was made by a newer version of Project Icons."],
      [JSON.stringify({ format: "bb-project-icons", version: 1, icons: [] }), "The file contains no icons."],
      [`{"format":"bb-project-icons","version":1,"icons":[],"__proto__":{"x":1}}`, "The file is not a valid Project Icons export."],
    ];
    for (const [payload, message] of cases) {
      await choose(payload);
      await pageB.getByRole("alert").filter({ hasText: message }).waitFor();
      assert.equal(await section.count(), 0);
    }
    const calls = await pageB.evaluate(() => window.rpcCalls.length);
    await pageB.getByLabel("Import icons from a file").setInputFiles({ name: "big.json", mimeType: "application/json", buffer: Buffer.alloc(13 * 1024 * 1024, 32) });
    await pageB.getByRole("alert").filter({ hasText: "larger than 12 MB" }).waitFor();
    assert.equal(await pageB.evaluate(() => window.rpcCalls.length), calls);
    assert.deepEqual(await rows("b").then(Object.keys), [C, D, E]);
  });
  await step("a failed import reports that nothing changed", async () => {
    const before = await Promise.all([C, D, E].map(id => iconOf("b", id)));
    const payload = buildExport([{ projectId: D, projectName: "Beta", image: transparentPng.toString("base64") }]);
    await choose(payload);
    await section.waitFor();
    const original = hosts.b.bb.storage.kv.set.bind(hosts.b.bb.storage.kv);
    let count = 0;
    hosts.b.bb.storage.kv.set = async (...args) => { count += 1; if (count === 2) throw new Error("injected"); return original(...args); };
    await pageB.getByRole("button", { name: "Import 1 icon" }).click();
    await pageB.getByRole("alert").filter({ hasText: "The import failed and nothing was changed." }).waitFor();
    hosts.b.bb.storage.kv.set = original;
    const after = await Promise.all([C, D, E].map(id => iconOf("b", id)));
    after.forEach((image, position) => assert.deepEqual(image, before[position]));
    assert.equal(await iconOf("b", D), null);
  });
  await step("an icon that changed after the preview refuses the import and refreshes the preview", async () => {
    const payload = buildExport([{ projectId: C, projectName: "Alpha", image: transparentPng.toString("base64") }]);
    await choose(payload);
    await section.getByText("Replaces the current icon of Alpha.").waitFor();
    await pageB.getByLabel("Replace 1 existing icon").check();
    await hosts.b.call("save", { projectId: C, base64: opaquePng.toString("base64") });
    await pageB.getByRole("button", { name: "Import 1 icon" }).click();
    await pageB.getByRole("alert").filter({ hasText: "changed since the preview" }).waitFor();
    await section.getByText("Replaces the current icon of Alpha.").waitFor();
    assert.equal(await pageB.getByLabel("Replace 1 existing icon").isChecked(), false);
    assert.ok((await iconOf("b", C)).equals(opaquePng));
    await pageB.getByRole("button", { name: "Cancel" }).click();
  });
  await step("320 px layout has no horizontal overflow in light and dark", async () => {
    for (const colorScheme of ["light", "dark"]) {
      await pageB.emulateMedia({ colorScheme });
      await pageB.setViewportSize({ width: 320, height: 900 });
      await choose(exported);
      await section.waitFor();
      const overflow = await pageB.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `horizontal overflow ${overflow}px`);
      await pageB.screenshot({ path: resolve(output, `preview-320-${colorScheme}.png`) });
      await pageB.getByRole("button", { name: "Cancel" }).click();
    }
  });
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "results.json"), JSON.stringify({ results, origin: "mocked SDK host and RPC transport; real server plugin, React, DOM and Chrome" }, null, 2));
  console.log(`${results.length} browser scenarios passed`);
} finally {
  await browser.close();
  server.close();
  await Promise.all(Object.values(hosts).map(host => host.dispose()));
}
