// Finite component check, without a BB install or new dependencies.
// Usage: node scripts/check-presets-browser.mjs <esbuild-package-dir> <existing-node_modules> <chrome-executable> [light|dark] [playwright-core-package-dir]
// Uses an isolated temporary Chrome profile and removes it on exit.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";

const [esbuildDir, modulesDir, chromePath, theme = "light", playwrightDir] = process.argv.slice(2);
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
      import { drawPreset } from ${source("lib/preset-rendering.ts")};
      import { palette, foreground, contrast, glyphs } from ${source("lib/icon-presets.ts")};
      import { IconPicker } from ${source("components/icon-picker.tsx")};
      import { createSettingsState } from ${source("settings-state.ts")};
      let fail = false, saveGate, saveRelease, fontGate, fontRelease, decodeGate, decodeRelease;
      let opened=0, closed=0;
      const nativeDecode=window.createImageBitmap.bind(window);
      window.createImageBitmap=async (...args)=>{
        const bitmap=await nativeDecode(...args);opened++;
        const close=bitmap.close.bind(bitmap);bitmap.close=()=>{closed++;close();};
        if(decodeGate)await decodeGate;
        return bitmap;
      };
      const root=createRoot(document.getElementById("app"));
      let secondRoot,secondContainer;
      const calls = [];
      let projects = [{id:"proj_aaaaaaaaaa",name:"Привет мир",revision:1},{id:"proj_bbbbbbbbbb",name:"Beta",revision:null}];
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
        state, calls, unmount:()=>root.unmount(),
        mountSecond(){
          secondContainer=document.createElement("div");secondContainer.id="second";secondContainer.className="bb-project-icons-settings";
          document.body.append(secondContainer);secondRoot=createRoot(secondContainer);secondRoot.render(<App/>);
        },
        unmountSecond(){secondRoot.unmount();secondContainer.remove();},
        resources:()=>({opened,closed}),
        holdDecode(){decodeGate=new Promise(r=>{decodeRelease=r;});},
        releaseDecode(){decodeGate=undefined;decodeRelease();},
        drawPreset, palette, foreground, contrast, glyphs, fail: value => {fail=value;},
        holdSave() { saveGate = new Promise(resolve => {saveRelease=resolve;}); },
        releaseSave() { saveGate=undefined; saveRelease(); },
        holdFont() { fontGate = new Promise(resolve => {fontRelease=resolve;}); },
        releaseFont() { fontGate=undefined; fontRelease(); },
      };
      state.refresh().then(() => root.render(<App/>));
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
  const results=[];
  const check=(value,message)=>{if(!value)throw Error(message);results.push(message);document.body.dataset.progress=results.length+":"+message;};
  const wait=async fn=>{await new Promise(r=>setTimeout(r,10));for(let n=0;n<300;n++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error("Timed out: "+fn);};
  const button=name=>Array.from(document.querySelectorAll("button")).find(b=>b.getAttribute("aria-label")===name||b.textContent===name);
  const click=name=>{const b=button(name);if(!b)throw Error("Missing "+name);b.click();};
  const preview=()=>document.querySelector('img[alt="Enlarged draft icon"]');
  const field=()=>document.querySelector('input:not([type="file"])');
  const input=value=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(field(),value);
    field().dispatchEvent(new Event("input",{bubbles:true}));
  };
  const absent=async()=>{await new Promise(r=>setTimeout(r,40));check(!preview(),"cancelled render stays absent");};
  const history=()=>JSON.parse(localStorage.getItem("emoji-component-test:color-recents:v1")||"[]");
  const emojiHistory=()=>JSON.parse(localStorage.getItem("emoji-component-test:emoji-recents:v1")||"[]");
  const h=window.harness;
  async function pixels(url) {
    const image=new Image();image.src=url;await image.decode();
    const c=document.createElement("canvas");c.width=c.height=64;const x=c.getContext("2d");x.drawImage(image,0,0);
    return {image,data:x.getImageData(0,0,64,64).data};
  }
  async function choose(source) {
    click(source);await wait(()=>document.querySelector('[role="tab"][aria-selected="true"]')?.textContent===source);
    if(source==="Glyph")click("Folder");
    if(source==="Emoji")click("rocket");
    if(source==="Image"){
      const c=document.createElement("canvas");c.width=120;c.height=60;c.getContext("2d").fillRect(0,0,120,60);
      const blob=await new Promise(r=>c.toBlob(r));
      const data=new DataTransfer();data.items.add(new File([blob],"wide.png",{type:"image/png"}));
      const file=document.querySelector('input[type="file"]');file.files=data.files;file.dispatchEvent(new Event("change",{bubbles:true}));
    }
    if(source==="Initials"&&!preview())input("Яe\u0301");
    await wait(preview);
  }
  await wait(()=>button("Glyph"));
  check(document.querySelectorAll('[role="tab"]').length===4,"four source tabs");
  click("Glyph");await wait(()=>button("Folder"));
  input(" DIRECTORY ");await wait(()=>document.querySelectorAll('[aria-label="Glyph results"] button').length===1);
  check(button("Folder")!==undefined,"glyph English keyword search");
  input("missing");await wait(()=>document.body.textContent.includes("No matching glyphs"));
  check(!document.querySelector('[aria-label="Glyph results"] button'),"glyph empty results");
  input("");await wait(()=>button("Folder"));click("Folder");await wait(preview);
  let url=preview().src;let p=await pixels(url);
  check(p.image.naturalWidth===64&&p.image.naturalHeight===64&&atob(url.split(",")[1]).length<=65536,"real 64x64 PNG <=64KiB");
  check(p.data[3]===0&&p.data[(32*64+32)*4+3]===255,"rounded background transparency and opaque center");
  check(preview().src===document.querySelector('img[alt="Draft icon at 20 pixels"]').src,"both previews show identical encoded bytes");
  h.fail(true);click("Save");await wait(()=>h.calls.length===1&&!h.state.getSnapshot().operation);
  check(preview()?.src===url&&history().length===0,"failed Save keeps draft and leaves colors unchanged");
  h.fail(false);click("Save");await wait(()=>history().length===1);
  check(h.calls[1].base64===url.split(",")[1]&&!preview(),"retry saves exact preview bytes and records palette ID");
  check(history()[0]==="slate"&&emojiHistory().length===0,"color and emoji histories distinct");
  for(const color of h.palette) {
    const canvas=document.createElement("canvas");h.drawPreset(canvas,{glyph:"star"},color.id);
    const pixel=await pixels(canvas.toDataURL());const data=pixel.data;
    const ink=h.foreground(color.background),rgb=[1,3,5].map(i=>parseInt(ink.slice(i,i+2),16));
    let inkPixels=0;
    for(let i=0;i<data.length;i+=4)if(data[i]===rgb[0]&&data[i+1]===rgb[1]&&data[i+2]===rgb[2]&&data[i+3]===255)inkPixels++;
    const small=document.createElement("canvas");small.width=small.height=20;small.getContext("2d").drawImage(canvas,0,0,20,20);
    const smallPixels=small.getContext("2d").getImageData(0,0,20,20).data;
    const smallInk=Array.from({length:400},(_,n)=>n*4).filter(i=>smallPixels[i+3]>240 &&
      Math.abs(smallPixels[i]-rgb[0])+Math.abs(smallPixels[i+1]-rgb[1])+Math.abs(smallPixels[i+2]-rgb[2])<120).length;
    check(h.contrast(color.background,ink)>=4.5&&inkPixels>100&&smallInk>12,"readable real palette "+color.id);
  }
  for(const glyph of h.glyphs) {
    const canvas=document.createElement("canvas");h.drawPreset(canvas,{glyph:glyph.id},"amber");
    const pixel=await pixels(canvas.toDataURL());const data=pixel.data;let ink=0,edge=0;
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const i=(y*64+x)*4;
      if(data[i]===0&&data[i+1]===0&&data[i+2]===0&&data[i+3]===255){ink++;if(x<5||x>58||y<5||y>58)edge++;}
    }
    check(ink>100&&edge===0,"unclipped real glyph "+glyph.id);
  }
  click("Initials");await wait(preview);check(field().value==="Пм","Cyrillic project default");
  for(const text of ["e\u0301Я","👩🏽‍💻","🇨🇾","𐐀Я","किЯ"]) {
    const old=preview()?.src;input(text);await wait(()=>preview()&&preview().src!==old);p=await pixels(preview().src);
    check(p.data.some((b,i)=>i%4===3&&b>0),"Unicode PNG "+text);
  }
  input("abc");await wait(()=>document.querySelector('[role="alert"]'));
  check(!preview()&&button("Save").disabled,"invalid explicit input removes savable snapshot");
  input("Я");await wait(preview);click("Amber");await wait(()=>preview()&&preview().src!==url);
  url=preview().src;click("Save");await wait(()=>history()[0]==="amber");
  check(h.calls.at(-1).base64===url.split(",")[1],"initials Save exact bytes and confirmed color");
  h.holdFont();input("Ж");await wait(()=>button("Cancel"));click("Cancel");h.releaseFont();await absent();
  check(field().value==="Пм","Cancel restores predictable default");
  for(const source of ["Glyph","Image","Emoji"]) {
    h.holdFont();input("Ж");await wait(()=>button("Cancel"));click(source);click("Initials");h.releaseFont();await absent();
  }
  h.holdFont();input("Ж");await wait(()=>button("Cancel"));
  h.state.select("proj_bbbbbbbbbb");h.state.select("proj_aaaaaaaaaa");h.releaseFont();await absent();
  check(history()[0]==="amber","project away-and-back never records pending color");
  input("Ж");await wait(preview);h.holdSave();click("Save");await wait(()=>h.state.getSnapshot().operation);
  h.state.select("proj_bbbbbbbbbb");h.state.select("proj_aaaaaaaaaa");h.releaseSave();
  await wait(()=>!h.state.getSnapshot().operation);await absent();
  check(history()[0]==="amber","invalidated sent Save never updates recents");
  const sources=["Image","Emoji","Glyph","Initials"];
  for(const from of sources)for(const to of sources)if(from!==to){
    await choose(from);url=preview().src;click("Save");await wait(()=>!h.state.getSnapshot().operation&&!preview());
    check(h.calls.at(-1).base64===url.split(",")[1],"committed "+from+" before "+to);
    await choose(to);url=preview().src;click("Save");await wait(()=>!h.state.getSnapshot().operation&&!preview());
    check(h.calls.at(-1).base64===url.split(",")[1],"replacement "+from+" -> "+to);
  }
  for(const source of ["Image","Emoji","Glyph","Initials"]){
    await choose(source);const bytes=preview().src;
    click("Open enlarged draft icon preview");
    await wait(()=>document.querySelector("dialog[open]"));
    const dialog=document.querySelector("dialog[open]");
    check(dialog.querySelector('img[alt="PNG preview contents"]').src===bytes &&
      !!dialog.closest("[data-bb-image-preview-ignore]"),source+" shared viewer shows exact PNG with scoped ignore marker");
    dialog.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
    await wait(()=>!document.querySelector("dialog[open]") && document.activeElement.getAttribute("aria-label")==="Open enlarged draft icon preview");
    check(preview()?.src===bytes && document.activeElement.getAttribute("aria-label")==="Open enlarged draft icon preview",
      source+" dialog Escape preserves draft and returns trigger focus");
  }
  await choose("Image");const fit=preview().src;click("Fill");await wait(()=>preview()?.src!==fit);
  check(!!button("Fit"),"image Fit/Fill retained");click("Cancel");await absent();
  h.holdDecode();
  const lateCanvas=document.createElement("canvas");lateCanvas.width=lateCanvas.height=1;
  const lateBlob=await new Promise(r=>lateCanvas.toBlob(r));
  const lateData=new DataTransfer();lateData.items.add(new File([lateBlob],"late.png",{type:"image/png"}));
  const lateInput=document.querySelector('input[type="file"]');lateInput.files=lateData.files;
  lateInput.dispatchEvent(new Event("change",{bubbles:true}));await wait(()=>button("Cancel"));
  click("Glyph");h.releaseDecode();await wait(()=>h.resources().closed===h.resources().opened);
  check(h.resources().closed===h.resources().opened,"late image decode and all bitmaps disposed on source switch");
  click("Glyph");await wait(()=>button("Folder"));button("Folder").focus();
  document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));
  check(document.activeElement.getAttribute("aria-label")==="Star","glyph roving focus");
  document.activeElement.click();await wait(preview);
  document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));await absent();
  check(document.activeElement===field(),"Escape returns focus to search");
  button("Glyph").focus();button("Glyph").dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true}));
  await wait(()=>field()?.value==="Пм");
  check(document.activeElement.textContent==="Initials","four-tab End focus");
  await wait(preview);input("e\u0301Я");await wait(preview);
  check(document.documentElement.scrollWidth<=window.innerWidth,"responsive no document overflow");
  const container=document.getElementById("app");check(container.scrollWidth<=container.clientWidth,"responsive container fit");
  check(document.querySelector('img[alt="Draft icon at 20 pixels"]').getBoundingClientRect().width===20,"actual 20px sample");
  document.body.dataset.testResult=btoa(unescape(encodeURIComponent(JSON.stringify(results))));
}
let chrome;
try {
  const css = await readFile("app.css", "utf8");
  const colors = theme === "dark" ? "--background:#18181b;--foreground:#fafafa;--border:#52525b;--muted:#27272a;--muted-foreground:#b4b4bc;--ring:#72a4f2" : "--background:#fff;--foreground:#111;--border:#ccc;--muted:#eee;--muted-foreground:#555;--ring:#2766c4";
  // Chrome can enforce a larger layout viewport than its narrow screenshot.
  const width = theme === "dark" ? "360px" : "480px";
  const html = '<!doctype html><meta charset="utf-8"><style>:root{'+colors+'}body{font-family:system-ui;margin:20px;color:var(--foreground);background:var(--background)}</style><style>'+css+'</style><div id="app" class="bb-project-icons-settings" style="max-width:'+width+'"></div><script>'+bundle.outputFiles[0].text+'</script><script>('+browserChecks.toString()+')().catch(error=>{document.body.dataset.testError=btoa(unescape(encodeURIComponent(String(error.stack))))})</script>';
  const page=join(directory,"index.html");await writeFile(page,html);
  const screenshot=resolve("dist/presets-component-test-"+theme+".png");
  chrome=spawn(chromePath,["--headless=new","--no-first-run","--no-default-browser-check",
    "--remote-debugging-port=0","--user-data-dir="+join(directory,"profile"),pathToFileURL(page).href],
    {windowsHide:true,stdio:"ignore"});
  let port;
  for(let n=0;n<100;n++){
    try{port=Number((await readFile(join(directory,"profile","DevToolsActivePort"),"utf8")).split("\n")[0]);break;}
    catch{await new Promise(resolve=>setTimeout(resolve,100));}
  }
  assert.ok(port,"Chrome did not start");
  const targets=await(await fetch("http://127.0.0.1:"+port+"/json/list")).json();
  const socket=new WebSocket(targets.find(t=>t.type==="page").webSocketDebuggerUrl);
  await once(socket,"open");
  let serial=0;const pending=new Map();
  socket.addEventListener("message",event=>{
    const value=JSON.parse(event.data);if(!value.id)return;
    const call=pending.get(value.id);pending.delete(value.id);
    if(value.error)call.reject(Error(JSON.stringify(value.error)));else call.resolve(value.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
    const value=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
    if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||JSON.stringify(value.exceptionDetails));
    return value.result.value;
  };
  await send("Emulation.setDeviceMetricsOverride",{width:theme==="dark"?320:768,height:1100,deviceScaleFactor:1,mobile:false});
  let result;
  for(let n=0;n<400;n++){
    result=await evaluate("({result:document.body?.dataset.testResult,error:document.body?.dataset.testError,progress:document.body?.dataset.progress})");
    if(result.result||result.error)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(result.error)throw Error(result.progress+": "+Buffer.from(result.error,"base64").toString());
  assert.ok(result.result,"Incomplete browser checks: "+result.progress);
  const checks=JSON.parse(Buffer.from(result.result,"base64").toString());
  const key=async(key,code,keyCode)=>{
    await send("Input.dispatchKeyEvent",{type:"keyDown",key,code,windowsVirtualKeyCode:keyCode,text:key==="Enter"?"\r":undefined});
    await send("Input.dispatchKeyEvent",{type:"keyUp",key,code,windowsVirtualKeyCode:keyCode});
  };
  await evaluate('document.querySelector(\'[role="tab"][aria-selected="true"]\').focus()');
  await key("Home","Home",36);
  assert.equal(await evaluate("document.activeElement.textContent"),"Image");
  await key("ArrowLeft","ArrowLeft",37);
  assert.equal(await evaluate("document.activeElement.textContent"),"Initials");
  await key("ArrowLeft","ArrowLeft",37);
  assert.equal(await evaluate("document.activeElement.textContent"),"Glyph");
  await key("Tab","Tab",9);assert.equal(await evaluate("document.activeElement.type"),"search");
  await key("Tab","Tab",9);assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),"Folder");
  await key("ArrowRight","ArrowRight",39);assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),"Star");
  await key("Enter","Enter",13);await new Promise(resolve=>setTimeout(resolve,100));
  assert.ok(await evaluate('!!document.querySelector(\'img[alt="Enlarged draft icon"]\')'));
  await key("Escape","Escape",27);await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(await evaluate("document.activeElement.type"),"search");
  assert.equal(await evaluate('!!document.querySelector(\'img[alt="Enlarged draft icon"]\')'),false);
  checks.push("trusted CDP keys: wrapping tabs, Home, Tab, glyph arrows, Enter, Escape and focus");
  // Native range events must preserve DOM identity and focus across recomputation.
  await evaluate('document.querySelector(\'[id$="-image-tab"]\').click()');
  await evaluate(`(async()=>{
    const canvas=document.createElement("canvas");canvas.width=120;canvas.height=60;
    canvas.getContext("2d").fillRect(0,0,120,60);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve));
    const data=new DataTransfer();data.items.add(new File([blob],"range.png",{type:"image/png"}));
    const input=document.querySelector('input[type="file"]');input.files=data.files;
    input.dispatchEvent(new Event("change",{bubbles:true}));
  })()`);
  for(let n=0;n<100;n++){
    if(await evaluate('!!document.querySelector(\'input[type="range"]\')'))break;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  await evaluate('window.zoomNode=document.querySelector(\'input[type="range"]\');window.zoomNode.focus()');
  const cropProbe=[];
  const sliderLabels=await evaluate('Array.from(document.querySelectorAll(\'input[type="range"]\')).map(input=>({id:input.id,labels:input.labels.length,explicit:Array.from(input.labels).every(label=>label.htmlFor===input.id&&label.control===input)}))');
  const sliderNames=(await send("Accessibility.getFullAXTree")).nodes.filter(node=>node.role?.value==="slider").map(node=>node.name?.value);
  assert.equal(sliderLabels.length,3);
  assert.ok(sliderLabels.every(input=>input.id&&input.labels===1&&input.explicit),"Every crop slider must have an explicit native label");
  assert.equal(sliderNames.length,3);
  for(const [index,label] of ["Zoom","Horizontal offset (pixels)","Vertical offset (pixels)"].entries()){
    assert.equal(sliderNames[index],label,"Missing exact accessible slider name");
  }
  checks.push("all three crop sliders have explicit native labels and accessibility-tree names");
  if(playwrightDir){
    const {chromium}=require(resolve(playwrightDir));
    const pwBrowser=await chromium.connectOverCDP("http://127.0.0.1:"+port);
    const pwPage=pwBrowser.contexts()[0].pages()[0];
    for(const name of ["Zoom","Horizontal offset (pixels)","Vertical offset (pixels)"]){
      assert.equal(await pwPage.getByRole("slider",{name,exact:true}).count(),1);
    }
    checks.push("Playwright getByRole slider resolves all three exact stable accessible names");
    await pwPage.getByText("Zoom",{exact:true}).click();
    assert.ok(await pwPage.getByRole("slider",{name:"Zoom",exact:true}).evaluate(input=>document.activeElement===input));
    checks.push("native clickable Zoom label focuses the named range");
    await evaluate("window.harness.mountSecond()");
    const second=pwPage.locator("#second");
    const imageBytes=await evaluate('(()=>{const canvas=document.createElement("canvas");canvas.width=120;canvas.height=60;canvas.getContext("2d").fillRect(0,0,120,60);return canvas.toDataURL().split(",")[1];})()');
    await second.locator('input[type="file"]').setInputFiles({name:"second.png",mimeType:"image/png",buffer:Buffer.from(imageBytes,"base64")});
    await second.getByRole("slider",{name:"Zoom",exact:true}).waitFor();
    const instances=await evaluate('Array.from(document.querySelectorAll("input[type=range]")).map(input=>({id:input.id,labelCount:input.labels.length,control:input.labels[0]?.control===input,htmlFor:input.labels[0]?.htmlFor}))');
    assert.equal(instances.length,6);assert.equal(new Set(instances.map(input=>input.id)).size,6);
    assert.ok(instances.every(input=>input.id&&input.labelCount===1&&input.control&&input.htmlFor===input.id));
    for(const name of ["Zoom","Horizontal offset (pixels)","Vertical offset (pixels)"]){
      assert.equal(await pwPage.getByRole("slider",{name,exact:true}).count(),2);
    }
    checks.push("two editor instances have six unique range IDs and correct native label targets");
    await evaluate("window.harness.unmountSecond();window.zoomNode.focus()");
  }


  for(let n=0;n<2;n++){
    await key("ArrowRight","ArrowRight",39);
    await new Promise(resolve=>setTimeout(resolve,40));
    cropProbe.push(await evaluate('({same:window.zoomNode===document.querySelector(\'input[type="range"]\'),focused:document.activeElement===window.zoomNode,value:document.querySelector(\'input[type="range"]\')?.value})'));
  }
  const rect=await evaluate('(()=>{const e=document.querySelector(\'input[type="range"]\');e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()');
  await send("Input.dispatchMouseEvent",{type:"mousePressed",x:rect.x+rect.width*.25,y:rect.y+rect.height/2,button:"left",clickCount:1});
  for(const fraction of [.4,.55,.7]){
    await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:rect.x+rect.width*fraction,y:rect.y+rect.height/2,button:"left",buttons:1});
    await new Promise(resolve=>setTimeout(resolve,40));
    cropProbe.push(await evaluate('({same:window.zoomNode===document.querySelector(\'input[type="range"]\'),focused:document.activeElement===window.zoomNode,value:document.querySelector(\'input[type="range"]\')?.value})'));
  }
  await send("Input.dispatchMouseEvent",{type:"mouseReleased",x:rect.x+rect.width*.7,y:rect.y+rect.height/2,button:"left",clickCount:1});
  console.log("Native crop probe: "+JSON.stringify(cropProbe));
  assert.ok(cropProbe.every(p=>p.same&&p.focused),"Range node/focus must survive both native keys and pointer drag");
  assert.equal(cropProbe[1].value,"1.1","Both native ArrowRight events must update Zoom");
  assert.ok(cropProbe.slice(2).every((p,i,list)=>i===0||Number(p.value)>Number(list[i-1].value)),"Pointer drag must keep updating Zoom");
  checks.push("native Zoom ArrowRight twice and continuous pointer drag retain DOM/focus");
  await evaluate(`(()=>{
    window.fillNode=Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Fill");
    window.fillNode.focus();
  })()`);
  await key("Enter","Enter",13);await new Promise(resolve=>setTimeout(resolve,40));
  assert.ok(await evaluate('document.activeElement===window.fillNode&&window.fillNode.isConnected&&document.querySelector(\'input[type="range"]\')===window.zoomNode'));
  checks.push("native Fill activation preserves button focus and crop DOM");
  const beforeFailure=await evaluate("window.harness.calls.length");
  await evaluate(`(()=>{
    window.zoomNode.focus();
    const encode=HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL=function(...args){
      HTMLCanvasElement.prototype.toDataURL=encode;
      throw Error("Test PNG encoding failure");
    };
  })()`);
  await key("ArrowRight","ArrowRight",39);await new Promise(resolve=>setTimeout(resolve,40));
  const failedCrop=await evaluate(`(()=>{
    const save=Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Save");
    save.click();
    return {same:document.querySelector('input[type="range"]')===window.zoomNode,focused:document.activeElement===window.zoomNode,
      preview:!!document.querySelector('img[alt="Enlarged draft icon"]'),saveDisabled:save.disabled,error:!!document.querySelector('[role="alert"]')};
  })()`);
  assert.deepEqual(failedCrop,{same:true,focused:true,preview:false,saveDisabled:true,error:true});
  assert.equal(await evaluate("window.harness.calls.length"),beforeFailure,"Null snapshot must not dispatch stale Save");
  checks.push("failed crop encoding retains focused controls and blocks stale Save");
  await key("ArrowRight","ArrowRight",39);await new Promise(resolve=>setTimeout(resolve,40));
  const recoveredUrl=await evaluate('document.querySelector(\'img[alt="Enlarged draft icon"]\')?.src');
  assert.ok(recoveredUrl);
  await evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Save").click()');
  for(let n=0;n<100;n++){
    if(await evaluate('!window.harness.state.getSnapshot().operation&&!document.querySelector(\'img[alt="Enlarged draft icon"]\')'))break;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(await evaluate("window.harness.calls.at(-1).base64"),recoveredUrl.split(",")[1]);
  checks.push("crop retry uses retained bitmap and saves exact recovered PNG");

  await evaluate('document.querySelector(\'[id$="-initials-tab"]\').click()');
  await new Promise(resolve=>setTimeout(resolve,100));
  const shot=await send("Page.captureScreenshot",{format:"png"});
  await writeFile(screenshot,Buffer.from(shot.data,"base64"));
  await evaluate('window.harness.holdFont();const input=document.querySelector("input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"Ж");input.dispatchEvent(new Event("input",{bubbles:true}))');
  await new Promise(resolve=>setTimeout(resolve,30));
  await evaluate('window.harness.unmount();window.harness.releaseFont()');
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(await evaluate('!!document.querySelector(\'img[alt="Enlarged draft icon"]\')'),false);
  checks.push("unmount invalidates pending font renderer");
  await writeFile("dist/presets-report-"+theme+".json",JSON.stringify({checks,theme,playwright:Boolean(playwrightDir),cropProbe,failedCrop,sliderLabels,sliderNames,boundaries:"Mocked SDK plugin ID/RPC/projects/realtime/theme; real Chrome fonts, canvas, pixels and trusted CDP keyboard."},null,2));
  for(const name of checks)console.log("PASS "+name);
  console.log(checks.length+" component checks passed; screenshot: "+screenshot);
  await send("Browser.close");socket.close();
  if(chrome.exitCode===null)await once(chrome,"exit");
} finally {
  if(chrome?.exitCode === null)chrome.kill();
  const target=resolve(directory),parent=resolve(tmpdir());
  assert.ok(target.startsWith(parent+"\\")||target.startsWith(parent+"/"),"Temp profile escaped OS temp");
  assert.ok(target.includes("project-icons-emoji-"),"Unexpected profile directory");
  await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
