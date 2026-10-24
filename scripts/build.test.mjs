import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "project-icons-build-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  copyFileSync(new URL("./build.mjs", import.meta.url), join(dir, "build.mjs"));
  const versions = { "bb-app": "0.46.1", esbuild: "0.28.1", "@tailwindcss/node": "4.3.0", "@tailwindcss/oxide": "4.3.0", tailwindcss: "4.3.0" };
  for (const [name, version] of Object.entries(versions)) {
    const path = join(dir, "node_modules", name);
    mkdirSync(join(path, "dist"), { recursive: true });
    writeFileSync(join(path, "package.json"), JSON.stringify({ name, version, main: "./dist/index.js" }));
    writeFileSync(join(path, "dist", "index.js"), "");
  }
  // This fake CLI records invocation only; the real build is checked separately.
  writeFileSync(join(dir, "node_modules/bb-app/dist/bb.js"), 'console.log(JSON.stringify({ args: process.argv.slice(2), override: process.env.BB_CLI ?? null }));');
  return {
    dir,
    run: () => spawnSync(process.execPath, [join(dir, "build.mjs")], {
      encoding: "utf8", env: { ...process.env, BB_CLI: "must-never-run" },
    }),
  };
}
test("build invokes the installed official CLI and removes the desktop override", (t) => {
  const { run } = fixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { args: ["plugin", "build"], override: null });
});
test("build refuses version drift before the CLI can fetch a fallback toolchain", (t) => {
  const { dir, run } = fixture(t);
  writeFileSync(join(dir, "node_modules/esbuild/package.json"), JSON.stringify({ name: "esbuild", version: "0.0.0", main: "./dist/index.js" }));
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /esbuild must be 0.28.1/);
  assert.equal(result.stdout, "");
});
test("build fails clearly when npm dependencies or the CLI are missing", (t) => {
  const { dir, run } = fixture(t);
  rmSync(join(dir, "node_modules/bb-app/dist/bb.js"));
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no dist\/bb.js/);
  assert.match(result.stderr, /Run npm ci/);
});
