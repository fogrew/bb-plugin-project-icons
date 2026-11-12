import test from "node:test";
import assert from "node:assert/strict";
import { createFileInputEvents, ownsImagePaste, singleImageFile, transferFiles } from "./lib/image-input.ts";
import { decodeImage } from "./lib/image-processing.ts";
import { bmpEntry, buildIco, jpegBytes, pngEntry, pngWithSize, webpBytes } from "./test-fixtures/ico.mjs";
import { transparentPng } from "./test-fixtures/png.mjs";

const png = new File(["png"], "icon.png", { type: "image/png" });
const transfer = (files = [png]) => ({
  types: ["Files"], files,
  items: files.map((file) => ({ kind: "file", getAsFile: () => file })),
});
const event = (target = null) => ({
  target, prevented: false, stopped: false,
  preventDefault() { this.prevented = true; },
  stopPropagation() { this.stopped = true; },
});
function setup(owned = true) {
  const received = [], dragging = [];
  return { received, dragging, handlers: createFileInputEvents({
    receive: (files) => received.push(files), ownsPaste: () => owned,
    setDragging: (value) => dragging.push(value),
  }) };
}

test("picker, drop and paste use the same one-file policy", () => {
  assert.equal(singleImageFile([png]), png);
  for (const files of [[], [png, png]]) assert.throws(() => singleImageFile(files), /one image/);
  const { handlers, received } = setup();
  handlers.drop(event(), transfer());
  handlers.paste(event(), transfer());
  assert.deepEqual(received, [[png], [png]]);
  for (const method of ["drop", "paste"]) {
    handlers[method](event(), transfer([png, png]));
    assert.throws(() => singleImageFile(received.at(-1)), /one image/);
  }
});
test("shared decoder rejects unsupported and oversize input before platform decoding", async () => {
  const previous = globalThis.createImageBitmap;
  const decoded = [];
  globalThis.createImageBitmap = async (file) => { decoded.push(file); return file; };
  try {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      const file = new File([new Uint8Array(2_000_000)], "boundary", { type });
      assert.equal(await decodeImage(file), file);
    }
    for (const file of [
      new File(["svg"], "icon.svg", { type: "image/svg+xml" }),
      new File(["png"], "icon.png"),
      new File([new Uint8Array(2_000_001)], "large", { type: "image/png" }),
    ]) await assert.rejects(decodeImage(file));
    assert.equal(decoded.length, 3);
    globalThis.createImageBitmap = async () => { throw new Error("corrupt image"); };
    await assert.rejects(decodeImage(png), /corrupt/);
  } finally { globalThis.createImageBitmap = previous; }
});
test("nested drag leaves retain highlighting until the outer target is left", () => {
  const { handlers, dragging } = setup();
  handlers.enter(event(), transfer());
  handlers.enter(event(), transfer());
  handlers.leave(event());
  assert.equal(dragging.at(-1), true);
  handlers.leave(event());
  assert.equal(dragging.at(-1), false);
  handlers.leave(event());
  handlers.enter(event(), transfer());
  handlers.drop(event(), transfer());
  assert.equal(dragging.at(-1), false);
  handlers.reset();
  assert.equal(dragging.at(-1), false);
});
test("file drops and dragover are claimed even for unsupported or unreadable transfers", () => {
  const { handlers, received } = setup();
  for (const files of [[new File(["text"], "note.txt", { type: "text/plain" })], []]) {
    const drop = event(), over = event();
    handlers.over(over, transfer(files));
    handlers.drop(drop, transfer(files));
    assert.ok(over.prevented && over.stopped);
    assert.ok(drop.prevented && drop.stopped);
  }
  assert.equal(received.length, 2);
});
test("text drags, HTML and plain text paste retain their browser defaults", () => {
  const { handlers, received } = setup();
  const text = { types: ["text/plain", "text/html"], files: [], items: [{ kind: "string" }] };
  for (const method of ["enter", "over", "drop", "paste"]) {
    const input = event();
    handlers[method](input, text);
    assert.equal(input.prevented, false);
    assert.equal(input.stopped, false);
  }
  assert.deepEqual(received, []);
});
test("unowned image paste never consumes the event", () => {
  const { handlers, received } = setup(false);
  const input = event();
  handlers.paste(input, transfer());
  assert.equal(input.prevented, false);
  assert.deepEqual(received, []);
});
test("clipboard item fallback ignores strings and null files without duplicating files", () => {
  const data = { ...transfer(), files: [], items: [
    { kind: "string", getAsFile: () => { throw new Error("not a file"); } },
    { kind: "file", getAsFile: () => null },
    { kind: "file", getAsFile: () => png },
  ] };
  assert.deepEqual(transferFiles(data), [png]);
  assert.deepEqual(transferFiles(transfer()), [png]);
});
test("paste ownership requires focus in the area and excludes text editing", () => {
  // Minimal DOM doubles; browser harness separately exercises real focus/closest.
  const button = { closest: () => null };
  const text = { closest: () => ({}) };
  const outside = { closest: () => null };
  const area = { ownerDocument: { activeElement: button }, contains: (node) => node !== outside };
  assert.equal(ownsImagePaste(area, button), true);
  assert.equal(ownsImagePaste(area, outside), false);
  area.ownerDocument.activeElement = outside;
  assert.equal(ownsImagePaste(area, outside), false);
  area.ownerDocument.activeElement = text;
  assert.equal(ownsImagePaste(area, text), false);
});

test("shared decoder validates ICO files and decodes only the chosen entry", async () => {
  const previous = globalThis.createImageBitmap;
  const decoded = [];
  globalThis.createImageBitmap = async (source) => { decoded.push(source); return source; };
  const pngs = [pngEntry(16), pngEntry(48)];
  const bmps = [bmpEntry(32), bmpEntry(16)];
  const file = (bytes, name = "favicon.ico", type = "image/x-icon") => new File([bytes], name, { type });
  const ico = (entries, name, type) => file(buildIco(entries), name, type);
  try {
    const fromPng = await decodeImage(ico(pngs));
    assert.equal(fromPng.type, "image/png");
    assert.ok(Buffer.from(await fromPng.arrayBuffer()).equals(pngs[1].data));
    const fromBmp = await decodeImage(ico(bmps));
    assert.equal(fromBmp.type, "image/x-icon");
    assert.ok(Buffer.from(await fromBmp.arrayBuffer()).subarray(22).equals(bmps[0].data));
    assert.equal((await decodeImage(ico(pngs, "FAVICON.ICO", ""))).type, "image/png");
    assert.equal((await decodeImage(ico(pngs, "favicon.ico", "image/vnd.microsoft.icon"))).type, "image/png");
    assert.equal((await decodeImage(ico(pngs, "favicon.ico", "image/png"))).type, "image/png");
    assert.equal(decoded.length, 5);
  } finally { globalThis.createImageBitmap = previous; }
});

test("shared decoder accepts PNG, JPEG and WebP content under an .ico name and rejects the reverse", async () => {
  const previous = globalThis.createImageBitmap;
  const decoded = [];
  globalThis.createImageBitmap = async (source) => { decoded.push(source); return source; };
  const named = (bytes, name, type) => new File([bytes], name, { type });
  try {
    for (const [bytes, mimeType] of [[transparentPng, "image/png"], [jpegBytes(64, 64), "image/jpeg"], [webpBytes(64, 64), "image/webp"]]) {
      for (const type of ["image/x-icon", "image/vnd.microsoft.icon", ""]) {
        const image = await decodeImage(named(bytes, "favicon.ico", type));
        assert.equal(image.type, mimeType);
        assert.ok(Buffer.from(await image.arrayBuffer()).equals(bytes));
      }
    }
    const before = decoded.length;
    const good = buildIco([pngEntry(32)]);
    for (const [name, candidate] of Object.entries({
      "ICO content named png": named(good, "favicon.png", "image/png"),
      "ICO content named jpg": named(good, "favicon.jpg", "image/jpeg"),
      "ICO content typed as PNG without an ico name": named(good, "", "image/png"),
      "ICO type without an ico name": named(transparentPng, "favicon.png", "image/x-icon"),
      "ICO type and no name": named(good, "", "image/x-icon"),
      "pasted-style image name": named(good, "image.png", "image/x-icon"),
      "oversize PNG under an ico name": named(pngWithSize(transparentPng, 9000, 64), "favicon.ico", "image/x-icon"),
      "oversize JPEG under an ico name": named(jpegBytes(5000, 64), "favicon.ico", "image/x-icon"),
      "oversize WebP under an ico name": named(webpBytes(64, 9000), "favicon.ico", "image/x-icon"),
      "unknown content under an ico name": named("GIF89a", "favicon.ico", "image/x-icon"),
      "svg under an ico name": named("<svg/>", "favicon.ico", "image/svg+xml"),
      "svg content under an ico name": named("<svg/>", "favicon.ico", "image/x-icon"),
      "truncated directory": named(good.subarray(0, 20), "favicon.ico", "image/x-icon"),
      "hostile count": named(Buffer.concat([Buffer.from([0, 0, 1, 0, 255, 255]), Buffer.alloc(64)]), "favicon.ico", "image/x-icon"),
      "oversize file": named(Buffer.concat([good, Buffer.alloc(2_000_000)]), "favicon.ico", "image/x-icon"),
    })) await assert.rejects(decodeImage(candidate), undefined, name);
    assert.equal(decoded.length, before);
  } finally { globalThis.createImageBitmap = previous; }
});
