import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

const output = resolve("dist/automatic-icons-browser");
await mkdir(output, { recursive: true });
const bundle = await build({ stdin: { contents: `
import { mountIcons } from "./lib/sidebar-icons";
import { automaticIcon, automaticColor } from "./lib/automatic-icon";
import { projectInitials } from "./lib/icon-presets";
window.fixture = { mountIcons, automaticIcon, automaticColor, projectInitials };
`, resolveDir: process.cwd() }, bundle: true, write: false, format: "iife" });
const server = createServer((req, res) => {
  res.setHeader("Content-Type", req.url === "/fixture.js" ? "text/javascript" : "text/html");
  res.end(req.url === "/fixture.js" ? bundle.outputFiles[0].text :
    '<!doctype html><meta charset="utf-8"><style>body{font:20px system-ui;padding:24px;background:#eee}.bb-project-icons-image{width:36px;height:36px;vertical-align:middle;margin:8px}</style><h1>Automatic project initials — DOM fixture</h1><main></main><script src="/fixture.js"></script>');
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:" + server.address().port);
  const result = await page.evaluate(async () => {
    const f = window.fixture;
    let icons = {}, fetches = 0, release;
    window.fetch = async () => { fetches++; return { ok: true, json: async () => icons }; };
    const tick = () => new Promise(done => setTimeout(done, 30));
    const check = (value, label) => { if (!value) throw Error(label); };
    const row = (id, name) => {
      const el = document.createElement("section"); el.dataset.sidebarProjectId = id;
      const label = document.createElement("div"); label.dataset.sidebar = "group-label";
      const wrapper = document.createElement("span"), title = document.createElement("span");
      title.title = name; title.textContent = name; wrapper.append(title); label.append(wrapper); el.append(label);
      document.querySelector("main").append(el); return { el, title };
    };
    const a = row("proj_aaaaaaaaaa", "Привет мир");
    const b = row("proj_bbbbbbbbbb", "");
    const controller = new AbortController();
    let dispose = f.mountIcons(controller.signal);
    await tick();
    const image = a.el.querySelector("img");
    check(image.src === f.automaticIcon("proj_aaaaaaaaaa", "Привет мир"), "shared Unicode PNG");
    check(image.alt === "" && image.getAttribute("aria-hidden") === "true", "decorative");
    check(b.el.querySelector("img").src === f.automaticIcon("proj_bbbbbbbbbb", ""), "empty");
    for (const name of ["e\u0301lan voyage", "👩🏽‍💻 workspace", "東京", "#️⃣ Project", " --- "]) {
      a.title.firstChild.data = name; await tick();
      check(image.src === f.automaticIcon("proj_aaaaaaaaaa", name), "rename " + name);
    }
    const c = row("proj_cccccccccc", "東京");
    await tick(); check(c.el.querySelectorAll("img").length === 1, "new row");
    a.title.textContent = "東京"; await tick();
    check(f.projectInitials(a.title.textContent) === f.projectInitials(c.title.textContent), "duplicate names");
    icons = { proj_aaaaaaaaaa: 7 };
    window.dispatchEvent(new Event("bb-project-icons-changed")); await tick();
    check(image.src.endsWith("projectId=proj_aaaaaaaaaa&v=7"), "saved PNG precedence");
    icons = {}; window.dispatchEvent(new Event("bb-project-icons-changed")); await tick();
    check(image.src === f.automaticIcon("proj_aaaaaaaaaa", "東京"), "remove fallback");
    icons = { proj_aaaaaaaaaa: 8 };
    window.dispatchEvent(new Event("bb-project-icons-changed")); await tick();
    check(image.src.endsWith("&v=8"), "Undo/realtime saved revision");
    check(a.el.querySelectorAll("img").length === 1, "no duplicates");
    dispose(); await tick();
    check(!document.querySelector(".bb-project-icons-image"), "cleanup");
    const before = fetches; window.dispatchEvent(new Event("bb-project-icons-changed")); await tick();
    check(fetches === before, "listeners disposed");
    window.fetch = () => new Promise(done => release = done);
    dispose = f.mountIcons(controller.signal);
    dispose();
    release({ ok: true, json: async () => ({ proj_aaaaaaaaaa: 99 }) }); await tick();
    check(!document.querySelector(".bb-project-icons-image"), "late response and microtask disposed");
    window.fetch = async () => ({ ok: true, json: async () => ({}) });
    dispose = f.mountIcons(controller.signal); await tick();
    window.dispose = dispose;
    return { fetches, scenarios: ["Unicode PNG equivalence", "empty/duplicate names", "text-node and replacement rename", "new rows", "saved precedence", "remove and realtime", "no duplicate images", "cleanup/listener removal", "late fetch and queued decoration"], mutations: "Only DOM; mock fetch accepts no writes", liveBB: false };
  });
  await page.screenshot({ path: resolve(output, "sidebar-fallback.png") });
  await page.evaluate(() => window.dispose());
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
