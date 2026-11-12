// Real React/Chrome dialogs and editor; SDK registrations, RPC and realtime are fixtures.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { PNG } from "pngjs";

const output = resolve("dist/contextual-browser");
await mkdir(output, { recursive: true });
const sdk = `
import { useEffect } from "react";
export const experimental_usePluginId = () => "contextual-test";
const rpc = {call: (...args) => window.api(...args)};
export const useRpc = () => rpc;
export const useBbContext = () => ({projectId: "proj_unrelated"});
export function useRealtime(_, callback) {
  useEffect(() => { window.listeners.add(callback); return () => window.listeners.delete(callback); }, [callback]);
}
export function definePluginApp(register) {
  register({slots: {
    settingsSection: r => window.Settings = r.component,
    homepageSection: r => window.Home = r.component,
    experimental_appOverlay: r => window.overlays.push(r.component),
    experimental_threadAction: r => window.actions.push(r),
  }, contentScripts: {register() {}}});
}
`;
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    window.actions = []; window.overlays = []; window.listeners = new Set();
    await import("./app");
    window.projects = [{id:"proj_aaaaaaaaaa",name:"Same",revision:1},{id:"proj_bbbbbbbbbb",name:"Same",revision:1}];
    window.calls = [];
    window.api = async (method,input) => {
      if(method === "list") return {projects: window.projects.map(p=>({...p}))};
      window.calls.push({method,input});
      if(method === "save") window.projects.find(p=>p.id===input.projectId).revision++;
      return {};
    };
    window.refresh = () => [...window.listeners].forEach(fn=>fn());
    const decode = window.createImageBitmap.bind(window);
    window.createImageBitmap = file => file.name === "late.png"
      ? new Promise(done=>window.finishDecode=async()=>done(await decode(file))) : decode(file);
    let root;
    window.mount = () => {
      root = createRoot(document.getElementById("root"));
      root.render(<><window.Home projectId="proj_bbbbbbbbbb" />
        <button id="menu" onClick={()=>window.actions.find(a=>a.placement==="menu").item({thread:{projectId:"proj_bbbbbbbbbb"}}).run({})}>Menu for B</button>
        <button id="header" onClick={()=>window.actions.find(a=>a.placement==="header").item({thread:{projectId:"proj_aaaaaaaaaa"}}).run({})}>Header for A</button>
        {window.overlays.map((Overlay,i)=><Overlay key={i}/>)}</>);
    };
    window.unmount = () => root.unmount();
    window.mount();
  ` },
  bundle: true, format: "esm", jsx: "automatic", outfile: resolve(output, "fixture.js"),
  plugins: [{name:"sdk-fixture", setup(b) {
    b.onResolve({filter:/^@get-bb\/plugin-sdk\/app$/},()=>({path:"sdk",namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:sdk,loader:"js",resolveDir:process.cwd()}));
  }}],
});
const hostReset = `
:root{--background:#1c1c24;--foreground:#eee;--border:#888;--ring:#80bfff;--muted:#303030;--muted-foreground:#bbb;--accent:#353535;--accent-foreground:#fff;--destructive:#ff9999;color-scheme:dark}
*,::before,::after{margin:0;padding:0;box-sizing:border-box}
body{background:var(--background);color:var(--foreground);font:14px system-ui}
button{background:transparent;border:0;font:inherit;color:inherit}
dialog{margin:0}`;
const png = new PNG({width:64,height:64});
png.data.fill(255);
const image = PNG.sync.write(png);
const server = createServer(async(req,res)=>{
  if(req.url.includes("/icon?")) return res.writeHead(200,{"Content-Type":"image/png"}).end(image);
  if(req.url === "/") return res.writeHead(200,{"Content-Type":"text/html"}).end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${hostReset}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>`);
  if(["/fixture.js","/fixture.css"].includes(req.url)) return res.writeHead(200,{"Content-Type":req.url.endsWith(".js")?"text/javascript":"text/css"}).end(await readFile(resolve(output,req.url.slice(1))));
  res.writeHead(404).end();
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
let browser;
const checks=[];
try {
  browser = await chromium.launch({executablePath:process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors=[]; page.on("pageerror",error=>errors.push(error.message));
  await page.goto("http://127.0.0.1:"+server.address().port);
  const outer = page.locator("dialog.bb-project-icons-contextual");
  const close = outer.getByRole("button",{name:"Close editor",exact:true});
  const draft = outer.getByRole("button",{name:"Open enlarged draft icon preview"});
  const upload = async(name="draft.png") => {
    await outer.locator('input[type="file"]').setInputFiles({name,mimeType:"image/png",buffer:image});
  };
  const open = async(name) => {
    await page.getByRole("button",{name,exact:true}).click();
    await outer.locator("fieldset").waitFor();
    assert.equal(await outer.getAttribute("open"),"");
  };
  for(const [entry,id] of [["Edit icon","proj_bbbbbbbbbb"],["Menu for B","proj_bbbbbbbbbb"],["Header for A","proj_aaaaaaaaaa"]]) {
    await open(entry);
    await upload();
    await outer.getByRole("button",{name:"Save",exact:true}).click();
    await page.waitForFunction(()=>window.calls.length>0);
    assert.equal(await page.evaluate(()=>window.calls.pop().input.projectId),id);
    await close.click();
  }
  checks.push("all three SDK entries save only their target ID despite identical names and unrelated active context");

  const geometry = () => outer.evaluate(el => {
    const box = el.getBoundingClientRect(), view = document.documentElement;
    return {left: box.left, top: box.top, right: view.clientWidth - box.right, bottom: view.clientHeight - box.bottom, width: box.width, height: box.height, scroll: el.scrollHeight > el.clientHeight};
  });
  const styled = locator => locator.evaluate(el => {
    const style = getComputedStyle(el);
    return {border: parseFloat(style.borderTopWidth), background: style.backgroundColor, padding: parseFloat(style.paddingLeft)};
  });
  for(const [width,height] of [[320,568],[768,1024],[1440,900]]) {
    await page.setViewportSize({width,height});
    await open("Menu for B");
    const box = await geometry();
    assert.ok(box.left >= 0 && box.top >= 0 && box.right >= 0 && box.bottom >= 0, `dialog inside ${width}x${height}: ${JSON.stringify(box)}`);
    assert.ok(Math.abs(box.left - box.right) <= 1 && Math.abs(box.top - box.bottom) <= 1, `dialog centered at ${width}x${height}: ${JSON.stringify(box)}`);
    for(const control of [close, outer.getByRole("tab",{name:"Image",exact:true}), outer.getByRole("button",{name:"Find icons in repository"})]) {
      const look = await styled(control);
      assert.ok(look.border > 0 && look.padding > 0 && look.background !== "rgba(0, 0, 0, 0)", `styled control at ${width}x${height}: ${JSON.stringify(look)}`);
    }
    assert.notEqual((await styled(outer)).background, "rgba(0, 0, 0, 0)");
    const closeBox = await close.boundingBox();
    assert.ok(closeBox.x >= box.left && closeBox.x + closeBox.width <= box.left + box.width);
    await page.mouse.click(box.left + 12, box.top + 12);
    assert.equal(await outer.evaluate(el=>el.open),true);
    const field = await outer.getByRole("button",{name:"Find icons in repository"}).boundingBox();
    await page.mouse.move(field.x + 4, field.y + 4);
    await page.mouse.down();
    await page.mouse.move(1, 1);
    await page.mouse.up();
    assert.equal(await outer.evaluate(el=>el.open),true);
    await page.mouse.click(1, 1);
    await outer.waitFor({state:"hidden"});
    await open("Menu for B");
    await page.keyboard.press("Escape");
    await outer.waitFor({state:"hidden"});
    await open("Menu for B");
    await close.click();
    await outer.waitFor({state:"hidden"});
  }
  await page.setViewportSize({width:320,height:320});
  await open("Menu for B");
  const small = await geometry();
  assert.ok(small.top >= 0 && small.bottom >= 0 && small.scroll, `dialog fits and scrolls in short viewport: ${JSON.stringify(small)}`);
  await close.click();
  await page.setViewportSize({width:1280,height:720});
  checks.push("dialog is centered, inside the viewport at 320/768/1440 px and scrolls in a short one under a host CSS reset; close, tab and action buttons keep visible styling");
  checks.push("editor closes by close button, Escape and backdrop click, and ignores clicks inside the dialog padding and drags that end on the backdrop");

  await open("Menu for B");
  await upload();
  const src=await draft.locator("img").getAttribute("src");
  for(const mode of ["button","escape"]) {
    await draft.click();
    const preview=page.locator("dialog.bb-project-icons-viewer[open]");
    await preview.waitFor();
    if(mode==="button") await preview.getByRole("button",{name:"Close preview"}).click();
    else await page.keyboard.press("Escape");
    await preview.waitFor({state:"hidden"});
    assert.equal(await outer.evaluate(el=>el.open),true);
    assert.equal(await draft.locator("img").getAttribute("src"),src);
    assert.equal(await draft.evaluate(el=>el===document.activeElement),true);
    assert.equal(await outer.getByRole("tab",{name:"Image",exact:true}).getAttribute("aria-selected"),"true");
  }
  checks.push("nested preview Close/Escape preserves outer editor, exact draft, source and trigger focus");
  await page.keyboard.press("Escape");
  await outer.waitFor({state:"hidden"});
  assert.equal(await page.getByRole("button",{name:"Menu for B"}).evaluate(el=>el===document.activeElement),true);
  await open("Menu for B");
  assert.equal(await draft.count(),0);
  for(let i=0;i<9;i++) await page.keyboard.press("Tab");
  assert.equal(await outer.evaluate(el=>el.contains(document.activeElement)),true);
  await close.click();
  checks.push("Escape discards unsaved draft, returns focus and repeated open starts clean with modal Tab containment");

  await page.evaluate(() => {
    const item = document.createElement("button");
    item.textContent = "Temporary menu item";
    document.body.append(item); item.focus();
    window.actions.find(a=>a.placement === "menu").item({thread:{projectId:"proj_aaaaaaaaaa"}}).run({});
    item.remove(); document.querySelector("#header").focus();
  });
  await outer.locator("fieldset").waitFor();
  await close.click();
  assert.equal(await page.locator("#header").evaluate(el=>el===document.activeElement),true);
  checks.push("host menu teardown before modal open restores focus to its surviving trigger");

  await page.evaluate(() => {
    const target = document.querySelector("#menu");
    target.dispatchEvent(new MouseEvent("contextmenu", {bubbles:true,composed:true}));
    const item = document.createElement("button"); item.setAttribute("role","menuitem");
    document.body.append(item); item.focus();
    window.actions.find(a=>a.placement === "menu").item({thread:{projectId:"proj_bbbbbbbbbb"}}).run({});
    item.remove();
  });
  await outer.locator("fieldset").waitFor();
  await close.click();
  assert.equal(await page.locator("#menu").evaluate(el=>el===document.activeElement),true);
  checks.push("contextmenu event origin survives removed menu item and restores focus without intercepting menus");

  await open("Header for A");
  await upload("late.png");
  await page.waitForFunction(()=>typeof window.finishDecode==="function");
  await close.click();
  await open("Menu for B");
  await page.evaluate(()=>window.finishDecode());
  assert.equal(await draft.count(),0);
  assert.equal(await page.evaluate(()=>window.calls.length),0);
  checks.push("late decode after close/reopen cannot cross project ownership or save");

  await page.evaluate(()=>{window.projects=window.projects.filter(p=>p.id!=="proj_bbbbbbbbbb"); window.refresh();});
  await outer.getByRole("alert").filter({hasText:"Project is no longer available."}).waitFor();
  assert.equal(await outer.locator("fieldset").count(),0);
  await close.click();
  checks.push("deleted target after realtime refresh never falls back to another project");

  await page.evaluate(()=>window.unmount());
  assert.equal(await page.locator("dialog").count(),0);
  assert.equal(await page.evaluate(()=>window.listeners.size),0);
  await page.evaluate(()=>window.mount());
  await open("Header for A");
  await close.click();
  await page.evaluate(()=>window.unmount());
  assert.equal(await page.evaluate(()=>window.listeners.size),0);
  assert.deepEqual(errors,[]);
  checks.push("overlay unmount/remount removes modal and realtime listeners; new registration opens cleanly");
  await writeFile(resolve(output,"results.json"),JSON.stringify({checks,boundaries:"Real Chrome/React/editor. SDK registration, RPC and realtime mocked; not live BB."},null,2));
  console.log(checks.join("\n"));
} finally {
  await browser?.close();
  await new Promise(done=>server.close(done));
}

