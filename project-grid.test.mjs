import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("project collection stays in page flow with a useful desktop width", async () => {
  const css = await readFile(new URL("./app.css", import.meta.url), "utf8");
  const listRules = [...css.matchAll(/\.bb-project-icons-list\s*\{([^}]+)\}/g)].map(match => match[1]).join(";");
  assert.match(listRules, /display:\s*grid/);
  assert.doesNotMatch(listRules, /(?:max-height|overflow(?:-y)?):/);
  assert.match(css, /\.bb-project-icons-settings\s*\{[^}]*max-width:\s*960px/);
  assert.match(css, /\.bb-project-icons-editor\s*\{[^}]*max-width:\s*480px/);
});

test("selector keeps native buttons, assignment text and no new chooser dependencies", async () => {
  const source = await readFile(new URL("./components/project-list.tsx", import.meta.url), "utf8");
  assert.match(source, /<button type="button"/);
  assert.match(source, /aria-pressed=/);
  assert.match(source, /Icon assigned/);
  assert.match(source, /No icon yet/);
  assert.doesNotMatch(source, /<(?:select|details)\b|role="(?:listbox|option)"|from ["'][^"']*(?:emoji|glyph)/);
});
