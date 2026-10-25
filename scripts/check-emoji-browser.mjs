// Finite component check, without a BB install or new dependencies.
// Usage: node scripts/check-emoji-browser.mjs <esbuild-package-dir> <existing-node_modules> <chrome-executable> [light|dark]
// Uses an isolated temporary Chrome profile and removes it on exit.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";

const [esbuildDir, modulesDir, chromePath, theme = "light"] = process.argv.slice(2);
if (!esbuildDir || !modulesDir || !chromePath) throw new Error("Supply existing esbuild package, node_modules and Chrome executable paths.");
const require = createRequire(import.meta.url);
const { build } = require(resolve(esbuildDir));
const directory = await mkdtemp(join(tmpdir(), "project-icons-emoji-"));
const source = name => JSON.stringify(resolve(name).replaceAll("\\", "/"));
const bundle = await build({
  stdin: {
    contents: `
      import * as React from "react";
      import { createRoot } from "react-dom/client";
      import { IconPicker } from ${source("components/icon-picker.tsx")};
      import { createSettingsState } from ${source("settings-state.ts")};
      let fail = false, saveGate, saveRelease, fontGate, fontRelease;
      const calls = [];
      let projects = [{id:"proj_aaaaaaaaaa",name:"Alpha",revision:1},{id:"proj_bbbbbbbbbb",name:"Beta",revision:null}];
      const state = createSettingsState({
        list: async () => ({projects}),
        save: async input => { calls.push(input); if(saveGate) await saveGate; if(fail) throw Error("offline"); return {revision:2}; },
        remove: async () => ({removed:true}),
      }, () => {});
      function App() {
        const snapshot = React.useSyncExternalStore(state.subscribe, state.getSnapshot);
        const project = snapshot.projects.find(row => row.id === snapshot.selected);
        return project ? <IconPicker key={project.id} project={project} state={state} busy={snapshot.operation !== null}/> : null;
      }
      Object.defineProperty(document.fonts, "ready", {get: () => fontGate || Promise.resolve(document.fonts)});
      window.harness = {
        state, calls, fail: value => {fail=value;},
        holdSave() { saveGate = new Promise(resolve => {saveRelease=resolve;}); },
        releaseSave() { saveGate=undefined; saveRelease(); },
        holdFont() { fontGate = new Promise(resolve => {fontRelease=resolve;}); },
        releaseFont() { fontGate=undefined; fontRelease(); },
      };
      state.refresh().then(() => createRoot(document.getElementById("app")).render(<App/>));
    `,
    loader: "tsx", resolveDir: process.cwd(), sourcefile: "emoji-component-harness.tsx",
  },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  nodePaths: [resolve(modulesDir)],
  plugins: [{ name: "sdk-plugin-id-only", setup(build) {
    build.onResolve({filter: /^@get-bb\/plugin-sdk\/app$/}, () => ({path:"sdk",namespace:"harness"}));
    build.onLoad({filter: /.*/, namespace:"harness"}, () => ({contents:'export const experimental_usePluginId = () => "emoji-component-test";'}));
  }}],
});

async function browserChecks() {
  const results = [];
  const check = (condition, message) => { if (!condition) throw Error(message); results.push(message); };
  const wait = async predicate => {
    for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw Error("Timed out waiting for component");
  };
  const button = name => Array.from(document.querySelectorAll("button")).find(b => b.getAttribute("aria-label") === name || b.textContent === name);
  const click = name => { const target = button(name); if (!target) throw Error("Missing button: " + name); target.click(); };
  const preview = () => document.querySelector('img[alt="Enlarged draft icon"]');
  const recents = () => JSON.parse(localStorage.getItem("emoji-component-test:emoji-recents:v1") || "[]");
  const search = value => {
    const input = document.querySelector('input[type="search"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", {bubbles:true}));
  };
  await wait(() => button("Emoji"));
  const h = window.harness;
  click("Emoji"); await wait(() => button("woman technologist: medium skin tone"));
  check(document.querySelector('[role="tab"][aria-selected="true"]').textContent === "Emoji", "source tab selection");
  check(Array.from(document.querySelectorAll('[role="tab"]')).every(tab => document.getElementById(tab.getAttribute("aria-controls"))), "every source tab has a matching panel");
  search("CYPRUS"); await wait(() => document.querySelector('[aria-label="Emoji results"] button')?.getAttribute("aria-label") === "flag: Cyprus");
  check(document.querySelectorAll('[aria-label="Emoji results"] button').length === 1, "English search filters exact named results");
  search(""); await wait(() => button("thumbs up: dark skin tone"));
  const first = document.querySelector('[aria-label="Emoji results"] button');
  first.focus(); first.dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowRight",bubbles:true}));
  check(document.activeElement.getAttribute("aria-label") === "grinning face with big eyes", "arrow handler moves result focus");
  document.activeElement.dispatchEvent(new KeyboardEvent("keydown", {key:"End",bubbles:true}));
  check(document.activeElement.getAttribute("aria-label") === "keycap: #", "End handler reaches final result");

  h.holdFont(); click("woman technologist: medium skin tone");
  await wait(() => document.body.textContent.includes("Rendering draft"));
  click("Cancel"); h.releaseFont(); await new Promise(resolve => setTimeout(resolve, 30));
  check(!preview() && recents().length === 0, "Cancel invalidates delayed font rendering without recents");
  h.holdFont(); click("flag: Cyprus"); await wait(() => button("Cancel"));
  click("Image"); h.releaseFont(); await wait(() => document.querySelector('input[type="file"]'));
  click("Emoji"); await wait(() => button("rocket"));
  check(!preview(), "switching source disposes pending emoji draft");

  h.holdFont(); click("rocket"); await wait(() => button("Cancel"));
  click("Image"); click("Emoji"); h.releaseFont();
  await new Promise(resolve => setTimeout(resolve, 30));
  check(!preview(), "source away-and-back invalidates pending rendering in one batch");
  h.holdFont(); click("rocket"); await wait(() => button("Cancel"));
  h.state.select("proj_bbbbbbbbbb"); h.state.select("proj_aaaaaaaaaa"); h.releaseFont();
  await new Promise(resolve => setTimeout(resolve, 30));
  check(!preview() && recents().length === 0, "project away-and-back invalidates pending rendering before Save");

  click("woman technologist: medium skin tone"); await wait(preview);
  const url = preview().src;
  check(url === document.querySelector('img[alt="Draft icon at 20 pixels"]').src, "both previews use identical PNG bytes");
  const image = new Image(); image.src = url; await image.decode();
  const canvas = document.createElement("canvas"); canvas.width=canvas.height=64;
  const ctx = canvas.getContext("2d"); ctx.drawImage(image,0,0);
  const pixels = ctx.getImageData(0,0,64,64).data;
  check(image.naturalWidth === 64 && image.naturalHeight === 64 && atob(url.split(",")[1]).length <= 65536, "real browser PNG satisfies dimension and size bounds");
  check(pixels[3] === 0 && pixels.some((byte,index) => index % 4 === 3 && byte > 0), "native emoji has transparent corner and visible pixels");
  h.fail(true); click("Save"); await wait(() => h.calls.length === 1 && h.state.getSnapshot().operation === null);
  check(preview()?.src === url && recents().length === 0, "failed Save retains snapshot and never writes recents");
  h.fail(false); click("Save"); await wait(() => recents().length === 1);
  check(h.calls[1].base64 === url.split(",")[1] && !preview(), "successful Save sends exact preview bytes and clears draft");
  check(recents()[0] === "1f469-1f3fd-200d-1f4bb", "recents persist exact compound catalog ID after success");

  click("rocket"); await wait(preview); h.holdSave(); click("Save");
  await wait(() => h.calls.length === 3);
  h.state.select("proj_bbbbbbbbbb"); h.state.select("proj_aaaaaaaaaa");
  h.releaseSave(); await wait(() => h.state.getSnapshot().operation === null);
  check(!preview() && recents().length === 1, "away-and-back invalidates sent draft without promising RPC rollback or writing recents");
  click("rocket"); await wait(preview);
  const input = document.querySelector('input[type="search"]');
  input.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape",bubbles:true}));
  await wait(() => !preview());
  check(document.activeElement === input, "Escape cancels draft and returns focus to search");
  click("Clear recents"); await wait(() => recents().length === 0);
  check(!document.querySelector('[aria-label="Recent emoji"]'), "Clear recents clears storage and UI");

  click("Image"); await wait(() => document.querySelector('input[type="file"]'));
  const source = document.createElement("canvas"); source.width=120;source.height=60;
  source.getContext("2d").fillRect(0,0,120,60);
  const blob = await new Promise(resolve => source.toBlob(resolve));
  const transfer = new DataTransfer(); transfer.items.add(new File([blob],"sample.png",{type:"image/png"}));
  const upload = document.querySelector('input[type="file"]');
  upload.files=transfer.files;upload.dispatchEvent(new Event("change",{bubbles:true}));
  await wait(preview);
  const imageUrl=preview().src;
  check(!!button("Fit") && !!button("Fill"), "existing image input and crop controls remain usable");
  click("Save");await wait(() => h.calls.length === 4 && h.state.getSnapshot().operation === null);
  check(h.calls[3].base64 === imageUrl.split(",")[1] && recents().length === 0, "image Save also reuses exact preview bytes without emoji history");
  click("Emoji"); await wait(() => button("rocket")); click("rocket");await wait(preview);
  check(document.documentElement.scrollWidth <= window.innerWidth, "editor fits the viewport without horizontal overflow");
  const container = document.getElementById("app");
  check(container.scrollWidth <= container.clientWidth, "editor contents fit the measured container width");
  document.body.dataset.testResult = btoa(JSON.stringify(results));
}

let chrome;
try {
  const css = await readFile("app.css", "utf8");
  const colors = theme === "dark" ? "--background:#18181b;--foreground:#fafafa;--border:#52525b;--muted:#27272a;--muted-foreground:#b4b4bc;--ring:#72a4f2" : "--background:#fff;--foreground:#111;--border:#ccc;--muted:#eee;--muted-foreground:#555;--ring:#2766c4";
  // Chrome can enforce a larger layout viewport than its narrow screenshot.
  const width = theme === "dark" ? "360px" : "480px";
  const html = '<!doctype html><meta charset="utf-8"><style>:root{'+colors+'}body{font-family:system-ui;margin:20px;color:var(--foreground);background:var(--background)}</style><style>'+css+'</style><div id="app" class="bb-project-icons-settings" style="max-width:'+width+'"></div><script>'+bundle.outputFiles[0].text+'</script><script>('+browserChecks.toString()+')().catch(error=>{document.body.dataset.testError=btoa(String(error.stack))})</script>';
  const page=join(directory,"index.html");await writeFile(page,html);
  const screenshot=resolve("dist/emoji-component-test-"+theme+".png");
  chrome=spawn(chromePath,["--headless=new","--no-first-run","--no-default-browser-check","--disable-gpu",
    "--user-data-dir="+join(directory,"profile"),"--dump-dom","--timeout=30000","--virtual-time-budget=15000",
    "--window-size="+(theme === "dark" ? "400,1000" : "600,1000"),"--screenshot="+screenshot,pathToFileURL(page).href],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
  let output="", errors=""; chrome.stdout.on("data",chunk=>{output+=chunk;});chrome.stderr.on("data",chunk=>{errors+=chunk;});
  const timer=setTimeout(()=>chrome.kill(),45000);
  const [code]=await once(chrome,"exit");clearTimeout(timer);
  assert.equal(code,0,errors);
  const failure=output.match(/data-test-error="([^"]+)"/);
  if(failure)throw Error(Buffer.from(failure[1],"base64").toString());
  const result=output.match(/data-test-result="([^"]+)"/);
  assert.ok(result,"Browser did not finish component checks: "+errors);
  const checks=JSON.parse(Buffer.from(result[1],"base64").toString());
  for(const name of checks)console.log("PASS "+name);
  console.log(checks.length+" component checks passed; screenshot: "+screenshot);
} finally {
  if(chrome?.exitCode === null)chrome.kill();
  await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
